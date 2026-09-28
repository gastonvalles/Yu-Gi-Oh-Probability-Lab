import { calculateProbabilities } from '../probability'
import { buildCalculationSummary, getCleanHands, getCleanProbability } from '../probability-summary'
import type {
  CalculationSummary,
  CardEntry,
  HandPattern,
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
  /** Manos con salida, pero frenadas por algún problema. */
  blockedOpeningProbability: number
  cleanHands: number | null
  totalHands: number | null
  patternResults: PatternProbability[]
}

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

/**
 * KPI promedio sin validar: lo usa el simulador de cambios sobre un deck que ya
 * pasó la validación. `deckSize` puede superar la suma de copias; la diferencia
 * se trata como cartas neutras que no aparecen en ninguna regla.
 */
export function evaluateAverageCleanProbability(
  cards: CardEntry[],
  patterns: HandPattern[],
  baseHandSize: number,
  deckSize: number,
): number {
  const views = (['first', 'second'] as const).map((view) =>
    getCleanProbability(
      buildCalculationSummary({
        deckSize,
        handSize: getHandSizeForView(baseHandSize, view),
        cards,
        patterns: selectPatternsForView(patterns, view),
      }),
    ),
  )

  return mean(views)
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

  return {
    handSize,
    cleanProbability: getCleanProbability(summary),
    noOpeningProbability: Math.max(0, 1 - summary.totalProbability),
    blockedOpeningProbability: summary.overlapProbability,
    cleanHands,
    totalHands: summary.totalHands,
    patternResults: summary.patternResults,
  }
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
    blockedOpeningProbability: mean([first.blockedOpeningProbability, second.blockedOpeningProbability]),
    cleanHands: null,
    totalHands: null,
    patternResults,
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
