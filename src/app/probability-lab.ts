import { calculateProbabilities } from '../probability'
import { getCleanHands, getCleanProbability } from '../probability-summary'
import type {
  CalculationOutput,
  CalculationSummary,
  CardEntry,
  HandPattern,
  HandSegment,
  PatternKind,
  PatternProbability,
  TurnView,
  ValidationIssue,
} from '../types'
import { buildCalculatorState } from './calculator-state'
import { selectPatternsForView } from './turn-context'

export interface LabViewResult {
  handSize: number | null
  /** Manos con alguna salida y ningún problema. */
  cleanProbability: number
  /** Manos sin ninguna salida (tengan o no problemas). */
  noOpeningProbability: number
  /** Manos con salida y también algún problema activo (no siempre impide jugar). */
  withProblemProbability: number
  cleanHands: number | null
  totalHands: number | null
  patternResults: PatternProbability[]
  /** Reglas presentes en cada grupo de manos, de mayor a menor peso. */
  segmentRules: Record<HandSegment, SegmentRule[]>
}

export interface SegmentRule {
  patternId: string
  name: string
  kind: PatternKind
  /** Fracción de las manos del grupo que cumplen la regla. */
  share: number
  /** Fracción del total de manos (grupo ∧ regla): se usa para promediar turnos. */
  jointProbability: number
}

const HAND_SEGMENTS: readonly HandSegment[] = ['clean', 'withProblem', 'noOpening']

export interface LabResults {
  first: LabViewResult
  second: LabViewResult
  average: LabViewResult
}

export type LabComputation =
  | { status: 'ok'; results: LabResults; issues: ValidationIssue[] }
  | { status: 'blocked'; issues: ValidationIssue[] }

// Ir segundo roba una carta más en el primer turno.
function getHandSizeForView(baseHandSize: number, view: Exclude<TurnView, 'average'>): number {
  return view === 'second' ? baseHandSize + 1 : baseHandSize
}

/**
 * Texto que identifica un cálculo por contenido (mano + cartas + reglas). Los ids de las condiciones se
 * dejan afuera: se generan al azar cada vez que se arman las reglas del sistema y no cambian el resultado
 * (que se indexa por id de regla), así que con ellos la caché nunca coincidía.
 */
export function labInputSignature(cards: CardEntry[], patterns: HandPattern[], baseHandSize: number): string {
  const stablePatterns = patterns.map((pattern) => ({
    ...pattern,
    conditions: pattern.conditions.map(({ id: _conditionId, ...condition }) => condition),
  }))
  // Del apiCard sólo pesan los campos que un matcher puede mirar: la descripción, las URLs, la banlist
  // y los puntos de Genesys no cambian el resultado y engordaban la firma (y las claves de caché).
  const stableCards = cards.map(({ apiCard, ...card }) => ({
    ...card,
    apiCard: apiCard && {
      ygoprodeckId: apiCard.ygoprodeckId,
      cardType: apiCard.cardType,
      frameType: apiCard.frameType,
      race: apiCard.race,
      attribute: apiCard.attribute,
      level: apiCard.level,
      linkValue: apiCard.linkValue,
      atk: apiCard.atk,
      def: apiCard.def,
      archetype: apiCard.archetype,
    },
  }))

  return JSON.stringify([baseHandSize, stableCards, stablePatterns])
}

const MAX_CACHED_COMPUTATIONS = 24
const computationCache = new Map<string, LabComputation>()

/**
 * Resultado del Lab recordado por contenido (mano + cartas + reglas): reabrir la pestaña o
 * volver a una combinación ya vista no repite la enumeración exacta, aunque los arrays sean nuevos.
 */
export function computeLabResults(
  cards: CardEntry[],
  patterns: HandPattern[],
  baseHandSize: number,
): LabComputation {
  const key = labInputSignature(cards, patterns, baseHandSize)
  const cached = computationCache.get(key)

  if (cached) {
    // Se reinserta para mantener el orden de uso (el más viejo es el primero del Map).
    computationCache.delete(key)
    computationCache.set(key, cached)
    return cached
  }

  const computation = computeLabResultsUncached(cards, patterns, baseHandSize)
  computationCache.set(key, computation)

  if (computationCache.size > MAX_CACHED_COMPUTATIONS) {
    computationCache.delete(computationCache.keys().next().value as string)
  }

  return computation
}

/** Un solo turno (la mitad del trabajo): para comparar variantes del deck sin calcular el otro turno. */
export function computeLabViewResult(
  cards: CardEntry[],
  patterns: HandPattern[],
  baseHandSize: number,
  view: Exclude<TurnView, 'average'>,
): LabViewResult | null {
  const { summary } = calculateView(cards, patterns, view, baseHandSize)

  return summary ? toViewResult(summary, getHandSizeForView(baseHandSize, view)) : null
}

function computeLabResultsUncached(
  cards: CardEntry[],
  patterns: HandPattern[],
  baseHandSize: number,
): LabComputation {
  return assembleLabComputation(
    calculateView(cards, patterns, 'first', baseHandSize),
    calculateView(cards, patterns, 'second', baseHandSize),
    patterns,
    baseHandSize,
  )
}

/** Enumeración exacta de un turno (lo pesado): se puede correr en un worker y armar el resultado después. */
export function calculateLabView(
  cards: CardEntry[],
  patterns: HandPattern[],
  baseHandSize: number,
  view: Exclude<TurnView, 'average'>,
): CalculationOutput {
  return calculateView(cards, patterns, view, baseHandSize)
}

/** Arma el resultado del Lab (1º, 2º y promedio) a partir de los dos turnos ya calculados. */
export function assembleLabComputation(
  first: CalculationOutput,
  second: CalculationOutput,
  patterns: HandPattern[],
  baseHandSize: number,
): LabComputation {
  const blockingIssues = [...first.blockingIssues, ...second.blockingIssues]

  if (!first.summary || !second.summary) {
    return { status: 'blocked', issues: dedupeIssues(blockingIssues) }
  }

  const firstResult = toViewResult(first.summary, getHandSizeForView(baseHandSize, 'first'))
  const secondResult = toViewResult(second.summary, getHandSizeForView(baseHandSize, 'second'))

  return {
    status: 'ok',
    issues: dedupeIssues([...first.issues, ...second.issues]),
    results: {
      first: firstResult,
      second: secondResult,
      average: averageViewResults(firstResult, secondResult, patterns),
    },
  }
}

function calculateView(
  cards: CardEntry[],
  patterns: HandPattern[],
  view: Exclude<TurnView, 'average'>,
  baseHandSize: number,
) {
  return calculateProbabilities(
    buildCalculatorState(cards, {
      handSize: getHandSizeForView(baseHandSize, view),
      patterns: selectPatternsForView(patterns, view),
      // Yendo 2º la 6ª carta es robada: las reglas que la ignoran miran sólo las 5 iniciales.
      drawnCards: view === 'second' ? 1 : 0,
    }),
  )
}

function toViewResult(summary: CalculationSummary, handSize: number): LabViewResult {
  const cleanHands = getCleanHands(summary)
  const segmentHands: Record<HandSegment, number> = {
    clean: cleanHands,
    withProblem: summary.overlapHands,
    noOpening: Math.max(0, summary.totalHands - summary.goodHands),
  }
  const segmentRules = Object.fromEntries(
    HAND_SEGMENTS.map((segment) => [
      segment,
      sortRules(
        summary.patternResults.map((result, index) => {
          const hands = summary.segmentPatternHands[segment][index] ?? 0
          return {
            patternId: result.patternId,
            name: result.name,
            kind: result.kind,
            share: segmentHands[segment] > 0 ? hands / segmentHands[segment] : 0,
            jointProbability: summary.totalHands > 0 ? hands / summary.totalHands : 0,
          }
        }),
      ),
    ]),
  ) as Record<HandSegment, SegmentRule[]>

  return {
    handSize,
    cleanProbability: getCleanProbability(summary),
    noOpeningProbability: Math.max(0, 1 - summary.totalProbability),
    withProblemProbability: summary.overlapProbability,
    cleanHands,
    totalHands: summary.totalHands,
    patternResults: summary.patternResults,
    segmentRules,
  }
}

function sortRules(rules: SegmentRule[]): SegmentRule[] {
  return rules.filter((rule) => rule.share > 0).sort((left, right) => right.share - left.share)
}

// share promedio = P(grupo ∧ regla) promedio / P(grupo) promedio: pondera bien turnos con distinto peso.
function averageSegmentRules(first: LabViewResult, second: LabViewResult): Record<HandSegment, SegmentRule[]> {
  const probabilityOf = (view: LabViewResult, segment: HandSegment) =>
    segment === 'clean' ? view.cleanProbability : segment === 'withProblem' ? view.withProblemProbability : view.noOpeningProbability

  return Object.fromEntries(
    HAND_SEGMENTS.map((segment) => {
      const segmentProbability = mean([probabilityOf(first, segment), probabilityOf(second, segment)])
      const byId = new Map<string, SegmentRule>()

      for (const rule of [...first.segmentRules[segment], ...second.segmentRules[segment]]) {
        const current = byId.get(rule.patternId)
        const jointProbability = (current?.jointProbability ?? 0) + rule.jointProbability / 2
        byId.set(rule.patternId, { ...rule, jointProbability, share: 0 })
      }

      const rules = [...byId.values()].map((rule) => ({
        ...rule,
        share: segmentProbability > 0 ? rule.jointProbability / segmentProbability : 0,
      }))

      return [segment, sortRules(rules)]
    }),
  ) as Record<HandSegment, SegmentRule[]>
}

// Promedio 50/50 (moneda para elegir quién empieza). Cada regla se promedia
// sólo sobre los turnos en los que aplica.
function averageViewResults(
  first: LabViewResult,
  second: LabViewResult,
  patterns: HandPattern[],
): LabViewResult {
  const firstById = new Map(first.patternResults.map((result) => [result.patternId, result]))
  const secondById = new Map(second.patternResults.map((result) => [result.patternId, result]))
  const patternResults = patterns.flatMap<PatternProbability>((pattern) => {
    const sources = [firstById.get(pattern.id), secondById.get(pattern.id)].filter(
      (result): result is PatternProbability => Boolean(result),
    )
    const [reference] = sources

    if (!reference) {
      return []
    }

    return [
      {
        ...reference,
        probability: mean(sources.map((result) => result.probability)),
        matchingHands: 0,
        possible: sources.some((result) => result.possible),
      },
    ]
  })

  return {
    handSize: null,
    cleanProbability: mean([first.cleanProbability, second.cleanProbability]),
    noOpeningProbability: mean([first.noOpeningProbability, second.noOpeningProbability]),
    withProblemProbability: mean([first.withProblemProbability, second.withProblemProbability]),
    cleanHands: null,
    totalHands: null,
    patternResults,
    segmentRules: averageSegmentRules(first, second),
  }
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()

  return issues.filter((issue) => {
    const key = `${issue.level}:${issue.message}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}
