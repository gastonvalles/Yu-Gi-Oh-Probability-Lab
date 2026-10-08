import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  getMatchedRequirementCount,
  matchesResolvedPattern,
  type CountOperations,
  type ResolvedRequirement,
} from '../app/pattern-engine'

const OPERATIONS: CountOperations<number[], number> = {
  cloneCounts: (counts) => [...counts],
  consumeCount: (counts, key, amount) => {
    counts[key] = Math.max(0, (counts[key] ?? 0) - amount)
  },
  getCount: (counts, key) => counts[key] ?? 0,
  serializeCounts: (counts) => counts.join(','),
}

const CLASSES = 6

const requirementArb = (index: number): fc.Arbitrary<ResolvedRequirement<number>> =>
  fc.record({
    keys: fc.uniqueArray(fc.integer({ min: 0, max: CLASSES - 1 }), { minLength: 0, maxLength: 4 }),
    quantity: fc.integer({ min: 1, max: 3 }),
    kind: fc.constantFrom('include', 'exclude'),
    distinct: fc.boolean(),
  }).map(({ keys, quantity, kind, distinct }) => ({
    id: `r${index}`,
    sourceLabel: `r${index}`,
    source: 'cards' as const,
    cardIds: [],
    quantity,
    kind,
    distinct,
    keys,
    names: [],
    possible: true,
  }))

describe('matchesResolvedPattern', () => {
  it('da lo mismo que contar condiciones cumplidas y comparar con las que se piden', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }).chain((count) => fc.tuple(...Array.from({ length: count }, (_, index) => requirementArb(index)))),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: CLASSES, maxLength: CLASSES }),
        fc.boolean(),
        fc.integer({ min: 0, max: 4 }),
        (requirements, counts, allowSharedCards, required) => {
          const requiredMatches = Math.min(required, requirements.length)
          const expected = getMatchedRequirementCount(requirements, counts, allowSharedCards, OPERATIONS) >= requiredMatches

          expect(matchesResolvedPattern({ requirements, allowSharedCards, requiredMatches }, counts, OPERATIONS)).toBe(expected)
        },
      ),
      { numRuns: 3000 },
    )
  })
})
