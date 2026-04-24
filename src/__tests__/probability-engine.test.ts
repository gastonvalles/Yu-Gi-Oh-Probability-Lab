import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { buildCalculationSummary } from '../probability-summary'
import { calculateProbabilities } from '../probability'
import { validateCalculationState } from '../probability-validation'
import { createMatcherPattern } from '../app/pattern-factory'
import type {
  CalculatorState,
  CardEntry,
  CardOrigin,
  CardRole,
  HandPattern,
} from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** BigInt-based C(n, k) — exact reference implementation free of floating-point error. */
function referenceCombination(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1
  const kk = Math.min(k, n - k)
  let result = 1n
  for (let i = 1; i <= kk; i++) {
    result = (result * BigInt(n - kk + i)) / BigInt(i)
  }
  return Number(result)
}

/** Pure BigInt C(n, k) for exact Pascal's rule verification. */
function referenceCombinationBigInt(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n
  if (k === 0 || k === n) return 1n
  const kk = Math.min(k, n - k)
  let result = 1n
  for (let i = 1; i <= kk; i++) {
    result = (result * BigInt(n - kk + i)) / BigInt(i)
  }
  return result
}

/** Minimal CardEntry factory. */
function makeCard(
  id: string,
  name: string,
  copies: number,
  origin: CardOrigin | null = 'engine',
  roles: CardRole[] = ['starter'],
): CardEntry {
  return {
    id,
    name,
    copies,
    source: 'manual',
    apiCard: null,
    origin,
    roles,
    needsReview: false,
  }
}

/** CalculatorState factory with sensible defaults. */
function makeState(overrides: Partial<CalculatorState> = {}): CalculatorState {
  const defaults: CalculatorState = {
    deckSize: 40,
    handSize: 5,
    cards: [makeCard('card-1', 'Test Card', 40)],
    patterns: [
      createMatcherPattern('Test Opening', 'opening', [
        { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
      ]),
    ],
  }
  return { ...defaults, ...overrides }
}

// ---------------------------------------------------------------------------
// fast-check Arbitraries
// ---------------------------------------------------------------------------

const arbCardOrigin: fc.Arbitrary<CardOrigin> = fc.constantFrom('engine', 'non_engine', 'hybrid')
const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
)

/**
 * Generates a valid CalculatorState with small deck/hand sizes for performance.
 * - deckSize: 40–50
 * - handSize: 1–min(deckSize, 7)
 * - 1–3 unique cards whose copies sum to deckSize
 * - 1–2 patterns with card_pool matchers referencing generated card IDs
 */
const arbValidCalculatorState: fc.Arbitrary<CalculatorState> = fc
  .integer({ min: 40, max: 50 })
  .chain((deckSize) =>
    fc
      .integer({ min: 1, max: Math.min(deckSize, 7) })
      .chain((handSize) =>
        fc
          .integer({ min: 1, max: 3 })
          .chain((cardCount) =>
            fc
              .tuple(
                // Generate unique card names
                fc.uniqueArray(
                  fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
                  { minLength: cardCount, maxLength: cardCount },
                ),
                // Distribute copies across cards summing to deckSize
                distributeCopies(deckSize, cardCount),
                // Origins and roles for each card
                fc.array(arbCardOrigin, { minLength: cardCount, maxLength: cardCount }),
                fc.array(
                  fc.array(arbCardRole, { minLength: 1, maxLength: 2 }),
                  { minLength: cardCount, maxLength: cardCount },
                ),
                // Number of patterns
                fc.integer({ min: 1, max: 2 }),
              )
              .chain(([names, copies, origins, rolesArr, patternCount]) => {
                const cards: CardEntry[] = names.map((name, i) =>
                  makeCard(`card-${i + 1}`, name, copies[i], origins[i], rolesArr[i]),
                )
                const cardIds = cards.map((c) => c.id)

                return fc
                  .array(
                    fc.tuple(
                      fc.constantFrom('opening' as const, 'problem' as const),
                      fc.integer({ min: 1, max: Math.min(handSize, 3) }),
                    ),
                    { minLength: patternCount, maxLength: patternCount },
                  )
                  .map((patternDefs) => {
                    const patterns: HandPattern[] = patternDefs.map(([kind, qty], pi) =>
                      createMatcherPattern(`Pattern ${pi + 1}`, kind, [
                        {
                          matcher: { type: 'card_pool', value: cardIds },
                          quantity: qty,
                          kind: 'include',
                        },
                      ]),
                    )
                    return { deckSize, handSize, cards, patterns } satisfies CalculatorState
                  })
              }),
          ),
      ),
  )

/** Distribute `total` into `count` positive integers. */
function distributeCopies(total: number, count: number): fc.Arbitrary<number[]> {
  if (count === 1) return fc.constant([total])
  // Generate count-1 cut points in [1, total-1], then derive bucket sizes
  return fc
    .uniqueArray(fc.integer({ min: 1, max: total - 1 }), {
      minLength: count - 1,
      maxLength: count - 1,
    })
    .map((cuts) => {
      const sorted = [...cuts].sort((a, b) => a - b)
      const result: number[] = []
      let prev = 0
      for (const cut of sorted) {
        result.push(cut - prev)
        prev = cut
      }
      result.push(total - prev)
      return result
    })
}

/**
 * Generates CalculatorStates that will produce blocking validation errors.
 */
const arbInvalidCalculatorState: fc.Arbitrary<CalculatorState> = fc.oneof(
  // deckSize < 40
  fc.integer({ min: 1, max: 39 }).map((deckSize) =>
    makeState({
      deckSize,
      handSize: Math.min(5, deckSize),
      cards: [makeCard('card-1', 'Test Card', deckSize)],
    }),
  ),
  // handSize > deckSize
  fc.integer({ min: 40, max: 50 }).map((deckSize) =>
    makeState({
      deckSize,
      handSize: deckSize + 1,
      cards: [makeCard('card-1', 'Test Card', deckSize)],
    }),
  ),
  // empty cards
  fc.constant(
    makeState({ cards: [] }),
  ),
  // empty patterns
  fc.constant(
    makeState({ patterns: [] }),
  ),
)

// ===========================================================================
// Tests
// ===========================================================================

describe('Probability Engine', () => {
  // -------------------------------------------------------------------------
  // Task 2: Combination identities (Req 1)
  // -------------------------------------------------------------------------
  describe('Combination identities (via totalHands)', () => {
    it('Property 1: boundary identities — C(n,n)=1 via totalHands, referenceCombination non-negative, 0 for invalid', () => {
      /** Feature: probability-engine-tests, Property 1: Combination boundary identities
       *  **Validates: Requirements 1.1, 1.2, 1.5, 1.6** */

      // C(n, 0) = 1 and C(n, n) = 1 for various n
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 200 }), (n) => {
          expect(referenceCombination(n, 0)).toBe(1)
          expect(referenceCombination(n, n)).toBe(1)
        }),
        { numRuns: 100 },
      )

      // Non-negative integer for valid inputs
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 200 }),
          fc.integer({ min: 0, max: 200 }),
          (n, k) => {
            const result = referenceCombination(n, k)
            expect(result).toBeGreaterThanOrEqual(0)
            expect(Number.isInteger(result)).toBe(true)
          },
        ),
        { numRuns: 100 },
      )

      // Returns 0 for invalid inputs
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 200 }), (n) => {
          expect(referenceCombination(n, -1)).toBe(0)
          expect(referenceCombination(n, n + 1)).toBe(0)
        }),
        { numRuns: 100 },
      )

      // Verify via buildCalculationSummary: when deckSize === handSize, totalHands === 1
      const state = makeState({ deckSize: 40, handSize: 40 })
      const summary = buildCalculationSummary(state)
      expect(summary.totalHands).toBe(1)
    })

    it('Property 2: symmetry — C(n,k) = C(n, n-k)', () => {
      /** Feature: probability-engine-tests, Property 2: Combination symmetry
       *  **Validates: Requirements 1.3** */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 200 }).chain((n) =>
            fc.integer({ min: 0, max: n }).map((k) => [n, k] as const),
          ),
          ([n, k]) => {
            expect(referenceCombination(n, k)).toBe(referenceCombination(n, n - k))
          },
        ),
        { numRuns: 200 },
      )
    })

    it("Property 3: Pascal's rule — C(n,k) = C(n-1,k-1) + C(n-1,k)", () => {
      /** Feature: probability-engine-tests, Property 3: Combination Pascal's rule
       *  **Validates: Requirements 1.4** */
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 200 }).chain((n) =>
            fc.integer({ min: 1, max: n - 1 }).map((k) => [n, k] as const),
          ),
          ([n, k]) => {
            expect(referenceCombinationBigInt(n, k)).toBe(
              referenceCombinationBigInt(n - 1, k - 1) + referenceCombinationBigInt(n - 1, k),
            )
          },
        ),
        { numRuns: 200 },
      )
    })
  })

  // -------------------------------------------------------------------------
  // Task 3: Engine invariants (Req 2–5, 8)
  // -------------------------------------------------------------------------
  describe('Hand count partition invariant', () => {
    it('Property 4: partition identity and bounds hold for any valid state', () => {
      /** Feature: probability-engine-tests, Property 4: Hand count partition and bounds
       *  **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6** */
      fc.assert(
        fc.property(arbValidCalculatorState, (state) => {
          const s = buildCalculationSummary(state)

          // totalHands = C(deckSize, handSize)
          expect(s.totalHands).toBe(referenceCombination(state.deckSize, state.handSize))

          // Partition identity
          expect(s.goodHands + s.badHands - s.overlapHands + s.neutralHands).toBe(s.totalHands)

          // Bounds
          expect(s.goodHands).toBeGreaterThanOrEqual(0)
          expect(s.goodHands).toBeLessThanOrEqual(s.totalHands)
          expect(s.badHands).toBeGreaterThanOrEqual(0)
          expect(s.badHands).toBeLessThanOrEqual(s.totalHands)
          expect(s.overlapHands).toBeGreaterThanOrEqual(0)
          expect(s.overlapHands).toBeLessThanOrEqual(Math.min(s.goodHands, s.badHands))
          expect(s.neutralHands).toBeGreaterThanOrEqual(0)
          expect(s.neutralHands).toBeLessThanOrEqual(s.totalHands)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Probability consistency', () => {
    it('Property 5: probability ratios and bounds', () => {
      /** Feature: probability-engine-tests, Property 5: Probability ratios and bounds
       *  **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6** */
      fc.assert(
        fc.property(arbValidCalculatorState, (state) => {
          const s = buildCalculationSummary(state)

          expect(s.totalProbability).toBeCloseTo(s.goodHands / s.totalHands, 10)
          expect(s.badProbability).toBeCloseTo(s.badHands / s.totalHands, 10)
          expect(s.neutralProbability).toBeCloseTo(s.neutralHands / s.totalHands, 10)
          expect(s.overlapProbability).toBeCloseTo(s.overlapHands / s.totalHands, 10)

          expect(s.totalProbability).toBeGreaterThanOrEqual(0)
          expect(s.totalProbability).toBeLessThanOrEqual(1)

          // Probability partition sums to 1
          const sum =
            s.totalProbability + s.badProbability - s.overlapProbability + s.neutralProbability
          expect(Math.abs(sum - 1)).toBeLessThan(1e-10)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Per-pattern result invariants', () => {
    it('Property 6: per-pattern consistency', () => {
      /** Feature: probability-engine-tests, Property 6: Per-pattern result consistency
       *  **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5** */
      fc.assert(
        fc.property(arbValidCalculatorState, (state) => {
          const s = buildCalculationSummary(state)

          // One result per pattern
          expect(s.patternResults.length).toBe(state.patterns.length)

          for (const pr of s.patternResults) {
            // matchingHands in [0, totalHands]
            expect(pr.matchingHands).toBeGreaterThanOrEqual(0)
            expect(pr.matchingHands).toBeLessThanOrEqual(s.totalHands)

            // probability = matchingHands / totalHands
            expect(pr.probability).toBeCloseTo(pr.matchingHands / s.totalHands, 10)

            // possible iff matchingHands > 0
            expect(pr.possible).toBe(pr.matchingHands > 0)
          }

          // If only opening patterns, goodHands >= max matchingHands
          const allOpening = state.patterns.every((p) => p.kind === 'opening')
          if (allOpening && s.patternResults.length > 0) {
            const maxMatching = Math.max(...s.patternResults.map((pr) => pr.matchingHands))
            expect(s.goodHands).toBeGreaterThanOrEqual(maxMatching)
          }
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Determinism', () => {
    it('Property 7: identical input produces identical output', () => {
      /** Feature: probability-engine-tests, Property 7: Determinism
       *  **Validates: Requirements 5.1, 5.2** */
      fc.assert(
        fc.property(arbValidCalculatorState, (state) => {
          const a = calculateProbabilities(state)
          const b = calculateProbabilities(state)
          expect(a).toEqual(b)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Blocking validation → null summary', () => {
    it('Property 8: invalid state produces null summary and non-empty blockingIssues', () => {
      /** Feature: probability-engine-tests, Property 8: Blocking validation errors produce null summary
       *  **Validates: Requirements 8.7** */
      fc.assert(
        fc.property(arbInvalidCalculatorState, (state) => {
          const result = calculateProbabilities(state)
          expect(result.summary).toBeNull()
          expect(result.blockingIssues.length).toBeGreaterThan(0)
        }),
        { numRuns: 100 },
      )
    })
  })

  // -------------------------------------------------------------------------
  // Task 4: Trivial/impossible cases and reuse policy (Req 6, 7)
  // -------------------------------------------------------------------------
  describe('Trivial and impossible cases', () => {
    it('4.1 guaranteed opening pattern returns totalProbability 1.0', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Only Card', 40)],
        patterns: [
          createMatcherPattern('Guaranteed', 'opening', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      expect(s.totalProbability).toBe(1.0)
    })

    it('4.2 impossible pattern (more copies than deck) returns totalProbability 0.0', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Some Card', 2), makeCard('card-2', 'Other Card', 38)],
        patterns: [
          createMatcherPattern('Impossible', 'opening', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 3, kind: 'include' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      expect(s.totalProbability).toBe(0.0)
    })

    it('4.3 impossible pattern (more copies than handSize) returns totalProbability 0.0', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Some Card', 40)],
        patterns: [
          createMatcherPattern('Impossible', 'opening', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 6, kind: 'include' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      expect(s.totalProbability).toBe(0.0)
    })

    it('4.4 no opening patterns returns goodHands 0 and totalProbability 0.0', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Some Card', 40)],
        patterns: [
          createMatcherPattern('Problem Only', 'problem', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      expect(s.goodHands).toBe(0)
      expect(s.totalProbability).toBe(0.0)
    })

    it('4.5 guaranteed problem pattern returns badProbability 1.0', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Only Card', 40)],
        patterns: [
          createMatcherPattern('Problem', 'problem', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      expect(s.badProbability).toBe(1.0)
    })
  })

  describe('Reuse policy enforcement', () => {
    // Deck: card-1 has 3 copies, card-2 has 37 copies (filler)
    // Pattern: two conditions each requiring 1 copy of card-1
    // With reusePolicy "forbid": needs 2 distinct copies in hand
    // With reusePolicy "allow": 1 copy can satisfy both

    it('4.6 reusePolicy "forbid" requires distinct card copies for overlapping conditions', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Key Card', 3), makeCard('card-2', 'Filler', 37)],
        patterns: [
          createMatcherPattern(
            'Forbid Reuse',
            'opening',
            [
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
            ],
            { matchMode: 'all', allowSharedCards: false },
          ),
        ],
      })
      const s = buildCalculationSummary(state)
      // With forbid, needs at least 2 copies of card-1 in hand
      // Hands with 2+ copies of card-1 out of 3 in a 40-card deck, hand of 5
      // This should be less than hands with 1+ copies
      const stateAllow = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Key Card', 3), makeCard('card-2', 'Filler', 37)],
        patterns: [
          createMatcherPattern(
            'Allow Reuse',
            'opening',
            [
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
            ],
            { matchMode: 'all', allowSharedCards: true },
          ),
        ],
      })
      const sAllow = buildCalculationSummary(stateAllow)
      // Forbid should match fewer hands than allow
      expect(s.goodHands).toBeLessThan(sAllow.goodHands)
      expect(s.goodHands).toBeGreaterThan(0) // still possible with 2+ copies
    })

    it('4.7 reusePolicy "allow" permits same card copy to satisfy multiple conditions', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Key Card', 3), makeCard('card-2', 'Filler', 37)],
        patterns: [
          createMatcherPattern(
            'Allow Reuse',
            'opening',
            [
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
            ],
            { matchMode: 'all', allowSharedCards: true },
          ),
        ],
      })
      const s = buildCalculationSummary(state)
      // With allow, 1 copy of card-1 satisfies both conditions
      // So matchingHands = hands with at least 1 copy of card-1
      // C(37,4) hands have 0 copies of card-1 → non-matching
      const handsWithZero = referenceCombination(37, 5)
      const totalHands = referenceCombination(40, 5)
      expect(s.goodHands).toBe(totalHands - handsWithZero)
    })

    it('4.8 reusePolicy "forbid" with insufficient copies reports pattern as not matching', () => {
      // Only 1 copy of card-1 in the entire deck — can never have 2 distinct copies
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Key Card', 1), makeCard('card-2', 'Filler', 39)],
        patterns: [
          createMatcherPattern(
            'Forbid Reuse',
            'opening',
            [
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
            ],
            { matchMode: 'all', allowSharedCards: false },
          ),
        ],
      })
      const s = buildCalculationSummary(state)
      // With only 1 copy in deck, can never satisfy two conditions needing distinct copies
      expect(s.goodHands).toBe(0)
      expect(s.totalProbability).toBe(0.0)
    })
  })

  // -------------------------------------------------------------------------
  // Task 5: Validation, pattern logic, edge cases (Req 8, 9, 10)
  // -------------------------------------------------------------------------
  describe('Input validation', () => {
    it('5.1 returns errors for various invalid states', () => {
      // deckSize < 40
      const issues1 = validateCalculationState(
        makeState({ deckSize: 30, handSize: 5, cards: [makeCard('card-1', 'Card', 30)] }),
      )
      expect(issues1.some((i) => i.level === 'error')).toBe(true)

      // handSize > deckSize
      const issues2 = validateCalculationState(
        makeState({ deckSize: 40, handSize: 41, cards: [makeCard('card-1', 'Card', 40)] }),
      )
      expect(issues2.some((i) => i.level === 'error')).toBe(true)

      // empty cards
      const issues3 = validateCalculationState(makeState({ cards: [] }))
      expect(issues3.some((i) => i.level === 'error')).toBe(true)

      // empty patterns
      const issues4 = validateCalculationState(makeState({ patterns: [] }))
      expect(issues4.some((i) => i.level === 'error')).toBe(true)

      // duplicate names
      const issues5 = validateCalculationState(
        makeState({
          cards: [
            makeCard('card-1', 'Same Name', 20),
            makeCard('card-2', 'Same Name', 20),
          ],
        }),
      )
      expect(issues5.some((i) => i.level === 'error')).toBe(true)

      // deckSize < 1
      const issues6 = validateCalculationState(
        makeState({ deckSize: 0, handSize: 0, cards: [makeCard('card-1', 'Card', 0)] }),
      )
      expect(issues6.some((i) => i.level === 'error')).toBe(true)

      // handSize < 1
      const issues7 = validateCalculationState(
        makeState({ deckSize: 40, handSize: 0, cards: [makeCard('card-1', 'Card', 40)] }),
      )
      expect(issues7.some((i) => i.level === 'error')).toBe(true)
    })
  })

  describe('Pattern logic modes', () => {
    // Two cards: card-1 (3 copies), card-2 (3 copies), filler (34 copies)
    // Pattern with two conditions: require 1 of card-1 AND/OR 1 of card-2

    it('5.2 logic "all" requires every condition to match', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [
          makeCard('card-1', 'Card A', 3),
          makeCard('card-2', 'Card B', 3),
          makeCard('card-3', 'Filler', 34),
        ],
        patterns: [
          createMatcherPattern(
            'All Logic',
            'opening',
            [
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
              { matcher: { type: 'card', value: 'card-2' }, quantity: 1, kind: 'include' },
            ],
            { matchMode: 'all' },
          ),
        ],
      })
      const s = buildCalculationSummary(state)
      // "all" means both card-1 AND card-2 must be in hand
      // This should be fewer hands than "any"
      const stateAny = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [
          makeCard('card-1', 'Card A', 3),
          makeCard('card-2', 'Card B', 3),
          makeCard('card-3', 'Filler', 34),
        ],
        patterns: [
          createMatcherPattern(
            'Any Logic',
            'opening',
            [
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
              { matcher: { type: 'card', value: 'card-2' }, quantity: 1, kind: 'include' },
            ],
            { matchMode: 'any' },
          ),
        ],
      })
      const sAny = buildCalculationSummary(stateAny)
      expect(s.goodHands).toBeLessThan(sAny.goodHands)
      expect(s.goodHands).toBeGreaterThan(0)
    })

    it('5.3 logic "any" requires at least one condition to match', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [
          makeCard('card-1', 'Card A', 3),
          makeCard('card-2', 'Card B', 3),
          makeCard('card-3', 'Filler', 34),
        ],
        patterns: [
          createMatcherPattern(
            'Any Logic',
            'opening',
            [
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
              { matcher: { type: 'card', value: 'card-2' }, quantity: 1, kind: 'include' },
            ],
            { matchMode: 'any' },
          ),
        ],
      })
      const s = buildCalculationSummary(state)
      // "any" means card-1 OR card-2 in hand
      // Hands with neither = C(34, 5)
      const handsWithNeither = referenceCombination(34, 5)
      const totalHands = referenceCombination(40, 5)
      expect(s.goodHands).toBe(totalHands - handsWithNeither)
    })

    it('5.4 logic "any" with minimumConditionMatches > 1 requires threshold', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [
          makeCard('card-1', 'Card A', 3),
          makeCard('card-2', 'Card B', 3),
          makeCard('card-3', 'Filler', 34),
        ],
        patterns: [
          createMatcherPattern(
            'At Least 2',
            'opening',
            [
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
              { matcher: { type: 'card', value: 'card-2' }, quantity: 1, kind: 'include' },
            ],
            { matchMode: 'at-least', minimumMatches: 2 },
          ),
        ],
      })
      const s = buildCalculationSummary(state)
      // minimumConditionMatches=2 with 2 conditions → effectively "all"
      const stateAll = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [
          makeCard('card-1', 'Card A', 3),
          makeCard('card-2', 'Card B', 3),
          makeCard('card-3', 'Filler', 34),
        ],
        patterns: [
          createMatcherPattern(
            'All Logic',
            'opening',
            [
              { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
              { matcher: { type: 'card', value: 'card-2' }, quantity: 1, kind: 'include' },
            ],
            { matchMode: 'all' },
          ),
        ],
      })
      const sAll = buildCalculationSummary(stateAll)
      expect(s.goodHands).toBe(sAll.goodHands)
    })

    it('5.5 exclude condition: hand containing excluded card does not match', () => {
      // Pattern: exclude card-1 (quantity 1). If hand has card-1, exclude fails.
      // Deck is all card-1 → every hand has card-1 → exclude never matches → 0 good hands
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Excluded Card', 40)],
        patterns: [
          createMatcherPattern('Exclude Test', 'opening', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'exclude' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      // Every hand has card-1, so exclude condition (require 0 of card-1) never matches
      expect(s.goodHands).toBe(0)
      expect(s.totalProbability).toBe(0.0)
    })
  })

  describe('Edge cases and boundary conditions', () => {
    it('5.6 deckSize equals handSize returns totalHands = 1', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 40,
        cards: [makeCard('card-1', 'Card', 40)],
        patterns: [
          createMatcherPattern('Opening', 'opening', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      expect(s.totalHands).toBe(1)
    })

    it('5.7 pattern referencing cards not in deck returns 0 matchingHands', () => {
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Real Card', 40)],
        patterns: [
          createMatcherPattern('Ghost Pattern', 'opening', [
            { matcher: { type: 'card', value: 'card-999' }, quantity: 1, kind: 'include' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      expect(s.patternResults[0].matchingHands).toBe(0)
    })

    it('5.8 multiple overlapping opening patterns count each hand once in goodHands', () => {
      // Both patterns match every hand (deck is all card-1, both require 1 copy)
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Only Card', 40)],
        patterns: [
          createMatcherPattern('Opening A', 'opening', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
          ]),
          createMatcherPattern('Opening B', 'opening', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      const totalHands = referenceCombination(40, 5)
      // Both patterns match all hands, but goodHands should be totalHands (not 2x)
      expect(s.goodHands).toBe(totalHands)
      expect(s.patternResults[0].matchingHands).toBe(totalHands)
      expect(s.patternResults[1].matchingHands).toBe(totalHands)
    })

    it('5.9 hand matching both opening and problem pattern increments overlapHands', () => {
      // Deck: all card-1. Opening requires card-1, problem requires card-1.
      // Every hand matches both → overlapHands = totalHands
      const state = makeState({
        deckSize: 40,
        handSize: 5,
        cards: [makeCard('card-1', 'Only Card', 40)],
        patterns: [
          createMatcherPattern('Opening', 'opening', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
          ]),
          createMatcherPattern('Problem', 'problem', [
            { matcher: { type: 'card', value: 'card-1' }, quantity: 1, kind: 'include' },
          ]),
        ],
      })
      const s = buildCalculationSummary(state)
      const totalHands = referenceCombination(40, 5)
      expect(s.goodHands).toBe(totalHands)
      expect(s.badHands).toBe(totalHands)
      expect(s.overlapHands).toBe(totalHands)
    })
  })
}) // end describe('Probability Engine')
