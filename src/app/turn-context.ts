import type {
  CalculationSummary,
  CalculatorState,
  HandPattern,
  PatternProbability,
  TurnView,
} from '../types'
import { calculateProbabilities } from '../probability'

/**
 * Aggregated KPI data for the "Promedio" (average) view over asymmetric rules.
 *
 * `cleanProbability`, `cleanHands`, `totalHands`, and `patternResults` describe
 * the merged output. `summaryFirst` / `summarySecond` expose the raw sub-view
 * summaries so callers can surface validation failures (null summary) to the
 * UI without the aggregator having to invent issue lists.
 */
export interface AggregatedKpi {
  cleanProbability: number
  cleanHands: number
  totalHands: number
  patternResults: PatternProbability[]
  summaryFirst: CalculationSummary | null
  summarySecond: CalculationSummary | null
}

/**
 * Filter a pattern list down to the subset that contributes to a given
 * `TurnView`. Order is preserved and no pattern is mutated.
 *
 * - `'average'` returns the input reference as-is. The blending happens in
 *   {@link aggregateKpiAcrossViews}, not here.
 * - `'first'` keeps patterns with `turnContext ∈ { 'first', 'either' }`.
 * - `'second'` keeps patterns with `turnContext ∈ { 'second', 'either' }`.
 */
export function selectPatternsForView(
  patterns: HandPattern[],
  view: TurnView,
): HandPattern[] {
  if (view === 'average') {
    return patterns
  }

  const result: HandPattern[] = []
  for (const pattern of patterns) {
    if (pattern.turnContext === 'either' || pattern.turnContext === view) {
      result.push(pattern)
    }
  }
  return result
}

/**
 * Returns `true` iff at least one pattern has a non-default turn context
 * (`'first'` or `'second'`). When this is `false`, every view collapses to the
 * full pattern list and the KPI Hero can safely hide the turn-view toggle.
 */
export function hasAsymmetricRules(patterns: HandPattern[]): boolean {
  for (const pattern of patterns) {
    if (pattern.turnContext !== 'either') {
      return true
    }
  }
  return false
}

function cleanHandsOf(summary: CalculationSummary): number {
  return Math.max(0, summary.goodHands - summary.overlapHands)
}

function cleanProbabilityOf(summary: CalculationSummary): number {
  if (summary.totalHands <= 0) {
    return 0
  }
  return cleanHandsOf(summary) / summary.totalHands
}

function buildAggregatedFromSingleSummary(
  summary: CalculationSummary,
): AggregatedKpi {
  const cleanHands = cleanHandsOf(summary)
  const cleanProbability = cleanProbabilityOf(summary)
  return {
    cleanProbability,
    cleanHands,
    totalHands: summary.totalHands,
    patternResults: summary.patternResults,
    summaryFirst: summary,
    summarySecond: summary,
  }
}

/**
 * Compute the "Promedio" KPI across the first-turn and second-turn sub-views.
 *
 * Going first uses the base `handSize` (typically 5).
 * Going second uses `handSize + 1` (draw for turn, typically 6).
 *
 * When every pattern has `turnContext === 'either'` the function short-circuits
 * to a single `calculateProbabilities` call — the result is bit-identical to
 * the pre-feature behavior so symmetric decks see no drift.
 *
 * When at least one pattern is asymmetric, the function computes two sub-view
 * summaries and blends them. `cleanProbability` is the arithmetic mean of each
 * sub-view's clean probability (50/50 coin-flip weighting on who goes first).
 * Per-rule `patternResults` are merged by `patternId`, preserving first-view
 * order and appending second-view-only rules after.
 *
 * If either sub-view returns `summary: null` (validation error), the function
 * surfaces a zeroed KPI and both raw summaries so callers can render the same
 * empty state they use for single-view failures.
 */
export function aggregateKpiAcrossViews(
  patterns: HandPattern[],
  baseState: Omit<CalculatorState, 'patterns'>,
): AggregatedKpi {
  if (!hasAsymmetricRules(patterns)) {
    const summary = calculateProbabilities({ ...baseState, patterns }).summary
    if (!summary) {
      return {
        cleanProbability: 0,
        cleanHands: 0,
        totalHands: 0,
        patternResults: [],
        summaryFirst: null,
        summarySecond: null,
      }
    }
    return buildAggregatedFromSingleSummary(summary)
  }

  const firstPatterns = selectPatternsForView(patterns, 'first')
  const secondPatterns = selectPatternsForView(patterns, 'second')

  // Going first: base handSize (5). Going second: handSize + 1 (6, draw for turn).
  const summaryFirst = calculateProbabilities({ ...baseState, patterns: firstPatterns }).summary
  const summarySecond = calculateProbabilities({ ...baseState, handSize: baseState.handSize + 1, patterns: secondPatterns }).summary

  if (!summaryFirst || !summarySecond) {
    return {
      cleanProbability: 0,
      cleanHands: 0,
      totalHands: 0,
      patternResults: [],
      summaryFirst,
      summarySecond,
    }
  }

  const probFirst = cleanProbabilityOf(summaryFirst)
  const probSecond = cleanProbabilityOf(summarySecond)
  const cleanProbability = (probFirst + probSecond) / 2

  // Sub-views now have different totalHands (C(n,5) vs C(n,6)).
  // Use the first-view's totalHands as the reference for display purposes.
  const totalHands = summaryFirst.totalHands
  const cleanHands = Math.round(cleanProbability * totalHands)

  const merged = new Map<string, PatternProbability>()
  for (const result of summaryFirst.patternResults) {
    merged.set(result.patternId, result)
  }
  for (const result of summarySecond.patternResults) {
    if (!merged.has(result.patternId)) {
      merged.set(result.patternId, result)
    }
  }

  return {
    cleanProbability,
    cleanHands,
    totalHands,
    patternResults: Array.from(merged.values()),
    summaryFirst,
    summarySecond,
  }
}

export interface ViewKpi {
  cleanProbability: number
  cleanHands: number
  totalHands: number
  patternResults: PatternProbability[]
}

/**
 * Panel-level branching: compute the effective KPI for the requested turn
 * view. Mirrors the logic in `ProbabilityPanel`'s `result` useMemo so the same
 * branch can be exercised from tests without standing up React.
 *
 * - `'average'` + asymmetric rules → blend sub-views via {@link aggregateKpiAcrossViews}.
 * - `'average'` + all-`'either'` rules → single `calculateProbabilities` call over every pattern.
 * - `'first' | 'second'` → single `calculateProbabilities` call over {@link selectPatternsForView}.
 *
 * Returns `null` when the calculation cannot be completed (validation errors
 * from the engine), matching the "no summary" empty state the UI already
 * handles for single-view failures.
 */
export function computeKpiForView(
  patterns: HandPattern[],
  baseState: Omit<CalculatorState, 'patterns'>,
  view: TurnView,
): ViewKpi | null {
  if (view === 'average' && hasAsymmetricRules(patterns)) {
    const aggregated = aggregateKpiAcrossViews(patterns, baseState)
    if (!aggregated.summaryFirst && !aggregated.summarySecond) {
      return null
    }
    return {
      cleanProbability: aggregated.cleanProbability,
      cleanHands: aggregated.cleanHands,
      totalHands: aggregated.totalHands,
      patternResults: aggregated.patternResults,
    }
  }

  const selected = selectPatternsForView(patterns, view)
  // Going second draws an extra card: handSize + 1.
  const effectiveHandSize = view === 'second' ? baseState.handSize + 1 : baseState.handSize
  const summary = calculateProbabilities({ ...baseState, handSize: effectiveHandSize, patterns: selected }).summary
  if (!summary) {
    return null
  }

  const cleanHands = cleanHandsOf(summary)
  return {
    cleanProbability: cleanProbabilityOf(summary),
    cleanHands,
    totalHands: summary.totalHands,
    patternResults: summary.patternResults,
  }
}
