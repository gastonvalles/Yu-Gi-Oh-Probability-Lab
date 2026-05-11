import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { computeKpiForView, selectPatternsForView } from '../app/turn-context'
import { calculateProbabilities } from '../probability'
import { createMatcherPattern } from '../app/pattern-factory'
import type {
  CalculatorState,
  CardEntry,
  HandPattern,
  TurnContext,
  TurnView,
} from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
//
// These property tests exercise the panel-level branching (the same logic the
// `result` useMemo in `ProbabilityPanel` runs) via the pure `computeKpiForView`
// helper in `turn-context.ts`. Keeping the test at the pipeline-function level
// means we assert the exact same `cleanProbability` the panel surfaces in
// `deckSummary.cleanProbability`, without standing up React.
//
// The deck fixture is a minimal 40-card deck with starter/extender/handtrap
// roles so role-matcher patterns always resolve against real cards.

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
const arbMixedTurnContext: fc.Arbitrary<TurnContext> = fc.constantFrom('first', 'second', 'either')
const arbView: fc.Arbitrary<TurnView> = fc.constantFrom('first', 'second', 'average')

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('turn-context pipeline integration', () => {
  it("8.4.1: all-'either' patterns produce the pre-feature cleanProbability in average view", () => {
    /** **Validates: Requirements 5.1, 8.3** */
    fc.assert(
      fc.property(
        arbPatterns(fc.constant<TurnContext>('either')),
        (patterns) => {
          const cards = makeCards()
          const bs = baseState(cards)

          // Pre-feature behavior: a single calculateProbabilities over every
          // pattern regardless of view — no filtering, no blending.
          // This only holds for the 'average' view when all patterns are 'either'
          // (the short-circuit path). For 'first'/'second' views, handSize differs.
          const preFeature = calculateProbabilities({ ...bs, patterns }).summary
          if (!preFeature) return
          const expected = cleanProbabilityOfSummary(preFeature)

          const kpi = computeKpiForView(patterns, bs, 'average')
          if (!kpi) return

          expect(Math.abs(kpi.cleanProbability - expected)).toBeLessThan(1e-9)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('8.4.2: mixed decks under Promedio lie in [min(subClean), max(subClean)]', () => {
    /** **Validates: Requirements 5.2, 8.4** */
    fc.assert(
      fc.property(
        arbPatterns(arbMixedTurnContext),
        arbRole,
        fc.constantFrom<'first' | 'second'>('first', 'second'),
        (basePatterns, extraRole, extraTc) => {
          // Guarantee at least one asymmetric rule so the Promedio branch goes
          // through `aggregateKpiAcrossViews`, not the all-`'either'`
          // short-circuit.
          const patterns = [
            ...basePatterns,
            makePattern('asymmetric-rule', extraTc, extraRole, 'opening'),
          ]
          const cards = makeCards()
          const bs = baseState(cards)

          // Going first uses base handSize; going second uses handSize + 1.
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
          const lo = Math.min(probFirst, probSecond)
          const hi = Math.max(probFirst, probSecond)

          const kpi = computeKpiForView(patterns, bs, 'average')
          if (!kpi) return

          expect(kpi.cleanProbability).toBeGreaterThanOrEqual(lo - 1e-9)
          expect(kpi.cleanProbability).toBeLessThanOrEqual(hi + 1e-9)
          expect(kpi.cleanProbability).toBeGreaterThanOrEqual(0)
          expect(kpi.cleanProbability).toBeLessThanOrEqual(1)
        },
      ),
      { numRuns: 30 },
    )
  })
})
