import type { HandPattern, TurnView } from '../types'

/**
 * Filter a pattern list down to the subset that contributes to a given
 * `TurnView`. Order is preserved and no pattern is mutated.
 *
 * - `'average'` returns the input reference as-is. The blending happens in
 *   `computeLabResults`, not here.
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
