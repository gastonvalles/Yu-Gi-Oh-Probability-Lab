import { calculateProbabilities } from '../probability'
import { getCleanHands, getCleanProbability } from '../probability-summary'
import type {
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
export function getHandSizeForView(baseHandSize: number, view: Exclude<TurnView, 'average'>): number {
  return view === 'second' ? baseHandSize + 1 : baseHandSize
}

export function computeLabResults(
  cards: CardEntry[],
  patterns: HandPattern[],
  baseHandSize: number,
): LabComputation {
  const first = calculateView(cards, patterns, 'first', baseHandSize)
  const second = calculateView(cards, patterns, 'second', baseHandSize)
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
