import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { selectPatternsForView } from '../app/turn-context'
import type { HandPattern, TurnContext, TurnView } from '../types'

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbTurnContext: fc.Arbitrary<TurnContext> = fc.constantFrom('first', 'second', 'either')
const arbTurnView: fc.Arbitrary<TurnView> = fc.constantFrom('first', 'second', 'average')
const arbSingleViewOnly: fc.Arbitrary<Exclude<TurnView, 'average'>> = fc.constantFrom(
  'first',
  'second',
)

/**
 * Minimal pattern arbitrary. `selectPatternsForView` only reads
 * `turnContext` and preserves references, so the other fields can stay
 * simple. We do ensure unique ids via the index mapping below so the
 * "subsequence" check can walk input vs. output reliably.
 */
function arbMinimalPattern(tc: fc.Arbitrary<TurnContext>): fc.Arbitrary<HandPattern> {
  return fc.record({
    id: fc.string({ minLength: 4, maxLength: 10 }).map((s) => `p-${s}`),
    name: fc.string({ minLength: 1, maxLength: 10 }),
    kind: fc.constantFrom<'opening' | 'problem'>('opening', 'problem'),
    turnContext: tc,
    logic: fc.constantFrom<'all' | 'any'>('all', 'any'),
    minimumConditionMatches: fc.integer({ min: 1, max: 3 }),
    reusePolicy: fc.constantFrom<'allow' | 'forbid'>('allow', 'forbid'),
    needsReview: fc.constant(false),
    conditions: fc.array(
      fc.record({
        id: fc.string({ minLength: 4, maxLength: 6 }).map((s) => `c-${s}`),
        matcher: fc.constant(null),
        quantity: fc.integer({ min: 1, max: 3 }),
        kind: fc.constantFrom<'include' | 'exclude'>('include', 'exclude'),
        distinct: fc.boolean(),
      }),
      { minLength: 1, maxLength: 2 },
    ),
  })
}

function arbPatternList(tc: fc.Arbitrary<TurnContext>): fc.Arbitrary<HandPattern[]> {
  return fc
    .array(arbMinimalPattern(tc), { minLength: 0, maxLength: 6 })
    // Guarantee unique ids across the list so subsequence / membership
    // checks do not accidentally collide.
    .map((patterns) => patterns.map((p, i) => ({ ...p, id: `p-${i}-${p.id}` })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectPatternsForView', () => {
  it('5.2.1: when every pattern is "either", selection is the identity for all three views', () => {
    /** Validates: Requirements 4.1, 4.2, 4.3, 8.1 */
    fc.assert(
      fc.property(
        arbPatternList(fc.constant<TurnContext>('either')),
        arbTurnView,
        (patterns, view) => {
          const result = selectPatternsForView(patterns, view)
          expect(result).toEqual(patterns)
        },
      ),
    )
  })

  it('5.2.2: membership matches the turnContext rule for first/second views', () => {
    /** Validates: Requirements 4.1, 4.2, 8.2 */
    fc.assert(
      fc.property(arbPatternList(arbTurnContext), arbSingleViewOnly, (patterns, view) => {
        const result = selectPatternsForView(patterns, view)
        const resultIds = new Set(result.map((p) => p.id))
        for (const p of patterns) {
          const shouldInclude = p.turnContext === view || p.turnContext === 'either'
          expect(resultIds.has(p.id)).toBe(shouldInclude)
        }
      }),
    )
  })

  it('5.2.3: result is a subsequence of input (order preserved, no duplicates)', () => {
    /** Validates: Requirements 4.3, 8.2 */
    fc.assert(
      fc.property(arbPatternList(arbTurnContext), arbTurnView, (patterns, view) => {
        const result = selectPatternsForView(patterns, view)
        // Walk the input in order; every result pattern must appear at some
        // later position in the input (i.e., the result is an in-order subset).
        let j = 0
        for (const p of patterns) {
          if (j < result.length && result[j].id === p.id) {
            j++
          }
        }
        expect(j).toBe(result.length)

        // No duplicates in the result.
        const uniqueIds = new Set(result.map((p) => p.id))
        expect(uniqueIds.size).toBe(result.length)
      }),
    )
  })
})
