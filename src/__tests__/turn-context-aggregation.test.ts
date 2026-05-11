import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { aggregateKpiAcrossViews, selectPatternsForView } from '../app/turn-context'
import { calculateProbabilities } from '../probability'
import { createMatcherPattern } from '../app/pattern-factory'
import type {
  CalculatorState,
  CardEntry,
  HandPattern,
  TurnContext,
} from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimally valid 40-card deck with a starter, an extender, and a
 * handtrap so role matchers always resolve to real cards. The remaining
 * 31 slots are single-copy filler cards with the `tech` role.
 */
function makeCards(): CardEntry[] {
  const base: CardEntry[] = [
    {
      id: 'a',
      name: 'Starter A',
      copies: 3,
      source: 'manual',
      apiCard: null,
      origin: 'engine',
      roles: ['starter'],
      needsReview: false,
    },
    {
      id: 'b',
      name: 'Extender B',
      copies: 3,
      source: 'manual',
      apiCard: null,
      origin: 'engine',
      roles: ['extender'],
      needsReview: false,
    },
    {
      id: 'c',
      name: 'Handtrap C',
      copies: 3,
      source: 'manual',
      apiCard: null,
      origin: 'non_engine',
      roles: ['handtrap'],
      needsReview: false,
    },
  ]
  const filler: CardEntry[] = Array.from({ length: 31 }).map((_, i) => ({
    id: `f${i}`,
    name: `Filler ${i}`,
    copies: 1,
    source: 'manual',
    apiCard: null,
    origin: 'engine',
    roles: ['tech'],
    needsReview: false,
  }))
  return [...base, ...filler]
}

function makePattern(
  name: string,
  turnContext: TurnContext,
  role: 'starter' | 'extender' | 'handtrap',
  kind: 'opening' | 'problem' = 'opening',
): HandPattern {
  return createMatcherPattern(
    name,
    kind,
    [{ matcher: { type: 'role', value: role }, quantity: 1, kind: 'include' }],
    { turnContext },
  )
}

function baseState(cards: CardEntry[]): Omit<CalculatorState, 'patterns'> {
  return {
    deckSize: cards.reduce((sum, card) => sum + card.copies, 0),
    handSize: 5,
    cards,
  }
}

function cleanProbabilityOfSummary(
  summary: NonNullable<ReturnType<typeof calculateProbabilities>['summary']>,
): number {
  if (summary.totalHands <= 0) {
    return 0
  }
  return (summary.goodHands - summary.overlapHands) / summary.totalHands
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbRole: fc.Arbitrary<'starter' | 'extender' | 'handtrap'> = fc.constantFrom(
  'starter',
  'extender',
  'handtrap',
)
const arbPatternKind: fc.Arbitrary<'opening' | 'problem'> = fc.constantFrom('opening', 'problem')

/**
 * Build a list of role-matcher patterns, tagging each with a provided
 * turnContext. `turnContextArb` controls whether the collection is all
 * `'either'` (for backward-compat properties) or mixed (for blended
 * properties).
 */
function arbPatterns(turnContextArb: fc.Arbitrary<TurnContext>): fc.Arbitrary<HandPattern[]> {
  return fc
    .array(
      fc.tuple(
        fc.string({ minLength: 3, maxLength: 8 }).map((s) => `rule-${s}`),
        turnContextArb,
        arbRole,
        arbPatternKind,
      ),
      { minLength: 1, maxLength: 4 },
    )
    .map((entries) =>
      entries.map(([name, tc, role, kind], i) => makePattern(`${name}-${i}`, tc, role, kind)),
    )
}

const arbMixedTurnContext: fc.Arbitrary<TurnContext> = fc.constantFrom('first', 'second', 'either')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aggregateKpiAcrossViews', () => {
  it("5.3.1: all-'either' decks match calculateProbabilities' single-summary cleanProbability", () => {
    /** Validates: Requirements 5.1, 8.3 */
    fc.assert(
      fc.property(arbPatterns(fc.constant<TurnContext>('either')), (patterns) => {
        const cards = makeCards()
        const bs = baseState(cards)
        const single = calculateProbabilities({ ...bs, patterns }).summary
        // With a 40-card deck, 5-card hand, and well-formed role patterns the
        // engine always returns a summary. Skip the odd case where the
        // generator builds patterns that can't resolve (shouldn't happen with
        // our fixed roles).
        if (!single) return

        const expected = cleanProbabilityOfSummary(single)
        const agg = aggregateKpiAcrossViews(patterns, bs)
        expect(Math.abs(agg.cleanProbability - expected)).toBeLessThan(1e-9)
      }),
      { numRuns: 30 },
    )
  })

  it('5.3.2: mixed decks use the arithmetic mean of first/second sub-view cleanProbabilities', () => {
    /** Validates: Requirements 5.2, 8.4 */
    fc.assert(
      fc.property(
        arbPatterns(arbMixedTurnContext),
        // Force at least one asymmetric rule so we hit the mixed branch, not
        // the symmetric short-circuit.
        arbRole,
        fc.constantFrom<'first' | 'second'>('first', 'second'),
        (basePatterns, extraRole, extraTc) => {
          const patterns = [
            ...basePatterns,
            makePattern('asymmetric-rule', extraTc, extraRole, 'opening'),
          ]
          const cards = makeCards()
          const bs = baseState(cards)

          const firstSummary = calculateProbabilities({
            ...bs,
            patterns: selectPatternsForView(patterns, 'first'),
          }).summary
          const secondSummary = calculateProbabilities({
            ...bs,
            handSize: bs.handSize + 1,
            patterns: selectPatternsForView(patterns, 'second'),
          }).summary
          if (!firstSummary || !secondSummary) return

          const probFirst = cleanProbabilityOfSummary(firstSummary)
          const probSecond = cleanProbabilityOfSummary(secondSummary)
          const expected = (probFirst + probSecond) / 2

          const agg = aggregateKpiAcrossViews(patterns, bs)
          expect(Math.abs(agg.cleanProbability - expected)).toBeLessThan(1e-9)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('5.3.3: cleanProbability is in [0, 1] and bounded by min/max of sub-view probabilities', () => {
    /** Validates: Requirements 5.5, 8.4 */
    fc.assert(
      fc.property(
        arbPatterns(arbMixedTurnContext),
        arbRole,
        fc.constantFrom<'first' | 'second'>('first', 'second'),
        (basePatterns, extraRole, extraTc) => {
          const patterns = [
            ...basePatterns,
            makePattern('asymmetric-rule', extraTc, extraRole, 'opening'),
          ]
          const cards = makeCards()
          const bs = baseState(cards)

          const firstSummary = calculateProbabilities({
            ...bs,
            patterns: selectPatternsForView(patterns, 'first'),
          }).summary
          const secondSummary = calculateProbabilities({
            ...bs,
            handSize: bs.handSize + 1,
            patterns: selectPatternsForView(patterns, 'second'),
          }).summary
          if (!firstSummary || !secondSummary) return

          const probFirst = cleanProbabilityOfSummary(firstSummary)
          const probSecond = cleanProbabilityOfSummary(secondSummary)

          const agg = aggregateKpiAcrossViews(patterns, bs)
          expect(agg.cleanProbability).toBeGreaterThanOrEqual(0)
          expect(agg.cleanProbability).toBeLessThanOrEqual(1)
          expect(agg.cleanProbability).toBeGreaterThanOrEqual(
            Math.min(probFirst, probSecond) - 1e-9,
          )
          expect(agg.cleanProbability).toBeLessThanOrEqual(
            Math.max(probFirst, probSecond) + 1e-9,
          )
        },
      ),
      { numRuns: 30 },
    )
  })

  it('5.3.4: patternResults covers exactly the set of input pattern ids', () => {
    /** Validates: Requirements 5.3 */
    fc.assert(
      fc.property(arbPatterns(arbMixedTurnContext), (patterns) => {
        const cards = makeCards()
        const bs = baseState(cards)
        const agg = aggregateKpiAcrossViews(patterns, bs)
        // Skip if validation failed for this sub-view combo.
        if (agg.summaryFirst === null || agg.summarySecond === null) return

        const inputIds = patterns.map((p) => p.id).sort()
        const outputIds = agg.patternResults.map((r) => r.patternId).sort()
        expect(outputIds).toEqual(inputIds)

        // No duplicates.
        expect(new Set(outputIds).size).toBe(outputIds.length)
      }),
      { numRuns: 30 },
    )
  })

  it('5.3.5: null sub-view summary produces a zeroed KPI without crashing', () => {
    /** Validates: Requirements 5.4 */
    const cards = makeCards()
    const patterns = [
      makePattern('opener-first', 'first', 'starter'),
      makePattern('opener-second', 'second', 'handtrap'),
    ]
    // Force validation errors on both sub-views: handSize > deckSize, deckSize
    // below the legal 40 minimum, and definedCopies mismatch. Any one of these
    // is blocking, so `calculateProbabilities(...).summary === null`.
    const bs: Omit<CalculatorState, 'patterns'> = {
      deckSize: 5,
      handSize: 40,
      cards,
    }
    const agg = aggregateKpiAcrossViews(patterns, bs)
    expect(agg.cleanProbability).toBe(0)
    expect(agg.cleanHands).toBe(0)
    expect(agg.totalHands).toBe(0)
    expect(agg.patternResults).toEqual([])
    // At least one raw summary is null — callers can surface the validation
    // failure through the same path they use for single-view errors.
    expect(agg.summaryFirst === null || agg.summarySecond === null).toBe(true)
  })
})
