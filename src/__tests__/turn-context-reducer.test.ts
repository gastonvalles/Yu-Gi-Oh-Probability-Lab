import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { updatePatternTurnContext } from '../app/pattern-updates'
import type { HandPattern, TurnContext } from '../types'

const arbTurnContext: fc.Arbitrary<TurnContext> = fc.constantFrom('first', 'second', 'either')

// Build arbitraries for valid HandPattern objects.
// Use simple fixed matchers since we're only testing the reducer logic.
function arbPattern(): fc.Arbitrary<HandPattern> {
  return fc.record({
    id: fc.string({ minLength: 4, maxLength: 10 }).map((s) => `p-${s}`),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    kind: fc.constantFrom<'opening' | 'problem'>('opening', 'problem'),
    turnContext: arbTurnContext,
    logic: fc.constantFrom<'all' | 'any'>('all', 'any'),
    minimumConditionMatches: fc.integer({ min: 1, max: 3 }),
    reusePolicy: fc.constantFrom<'allow' | 'forbid'>('allow', 'forbid'),
    needsReview: fc.boolean(),
    conditions: fc.array(
      fc.record({
        id: fc.string({ minLength: 4, maxLength: 6 }).map((s) => `c-${s}`),
        matcher: fc.constant(null),
        quantity: fc.integer({ min: 1, max: 3 }),
        kind: fc.constantFrom<'include' | 'exclude'>('include', 'exclude'),
        distinct: fc.boolean(),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  })
}

function arbPatternsWithUniqueIds(): fc.Arbitrary<HandPattern[]> {
  return fc
    .array(arbPattern(), { minLength: 1, maxLength: 4 })
    .map((patterns) => patterns.map((p, i) => ({ ...p, id: `p-${i}-${p.id}` })))
}

describe('updatePatternTurnContext', () => {
  it("4.6.1: updates only the target pattern's turnContext and needsReview", () => {
    /** Validates: Requirements 2.3, 8.7 */
    fc.assert(
      fc.property(arbPatternsWithUniqueIds(), arbTurnContext, (patterns, newValue) => {
        fc.pre(patterns.length > 0)
        // Pick first as target for simplicity
        const target = patterns[0]
        const result = updatePatternTurnContext(patterns, target.id, newValue)

        // Result has same length
        expect(result.length).toBe(patterns.length)

        // Target pattern: turnContext changed, needsReview=false, everything else unchanged
        const updatedTarget = result[0]
        expect(updatedTarget.id).toBe(target.id)
        expect(updatedTarget.turnContext).toBe(newValue)
        expect(updatedTarget.needsReview).toBe(false)
        // All other fields unchanged
        expect(updatedTarget.name).toBe(target.name)
        expect(updatedTarget.kind).toBe(target.kind)
        expect(updatedTarget.logic).toBe(target.logic)
        expect(updatedTarget.minimumConditionMatches).toBe(target.minimumConditionMatches)
        expect(updatedTarget.reusePolicy).toBe(target.reusePolicy)
        expect(updatedTarget.conditions).toEqual(target.conditions)

        // Non-target patterns: deep equal
        for (let i = 1; i < patterns.length; i++) {
          expect(result[i]).toEqual(patterns[i])
        }
      }),
    )
  })

  it('4.6.2: returns equivalent array if patternId does not match any pattern', () => {
    /** Validates: Requirements 2.3, 8.7 */
    fc.assert(
      fc.property(
        arbPatternsWithUniqueIds(),
        arbTurnContext,
        fc.string({ minLength: 10, maxLength: 20 }).map((s) => `nonexistent-${s}`),
        (patterns, newValue, fakeId) => {
          const result = updatePatternTurnContext(patterns, fakeId, newValue)
          // Every pattern deep-equals its input
          expect(result.length).toBe(patterns.length)
          for (let i = 0; i < patterns.length; i++) {
            expect(result[i]).toEqual(patterns[i])
          }
        },
      ),
    )
  })
})
