import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { curatePatterns } from '../app/pattern-curation'
import type { CardEntry, HandPattern, Matcher, PatternCondition } from '../types'

/**
 * Bug Condition Exploration Test
 *
 * This test demonstrates the bug where `curatePattern` removes unconfigured
 * conditions (matcher === null) when a pattern has a mix of configured and
 * unconfigured conditions.
 *
 * Bug Condition: isBugCondition(pattern) =
 *   EXISTS c WHERE c.matcher === null AND EXISTS c WHERE c.matcher !== null
 *
 * EXPECTED OUTCOME: Test FAILS on unfixed code (this proves the bug exists)
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */

// ── Helpers ──

function makeCardEntry(id: string, name: string = `Card ${id}`): CardEntry {
  return {
    id,
    name,
    copies: 3,
    source: 'manual',
    apiCard: null,
    origin: 'engine',
    roles: ['starter'],
    needsReview: false,
  }
}

function makeConditionId(): fc.Arbitrary<string> {
  return fc.uuid()
}

function makeConfiguredCondition(cardIds: string[]): fc.Arbitrary<PatternCondition> {
  return fc.record({
    id: makeConditionId(),
    matcher: fc.oneof(
      // Card matcher referencing a valid card
      fc.constantFrom(...cardIds).map((id): Matcher => ({ type: 'card', value: id })),
      // Card pool matcher referencing valid cards
      fc.subarray(cardIds, { minLength: 1 }).map((ids): Matcher => ({
        type: 'card_pool',
        value: ids,
      })),
      // Origin matcher (always valid, doesn't need card reference)
      fc.constantFrom('engine', 'non_engine', 'hybrid' as const).map((value): Matcher => ({
        type: 'origin',
        value,
      })),
      // Role matcher (always valid)
      fc.constantFrom(
        'starter', 'extender', 'enabler', 'handtrap', 'disruption',
        'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
        'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
      ).map((value): Matcher => ({ type: 'role', value })),
    ),
    quantity: fc.integer({ min: 1, max: 3 }),
    kind: fc.constantFrom('include' as const, 'exclude' as const),
    distinct: fc.boolean(),
  })
}

function makeUnconfiguredCondition(index: number): fc.Arbitrary<PatternCondition> {
  // Use the index to ensure each unconfigured condition has a unique signature
  // (unique combination of quantity, kind, distinct) so deduplication doesn't
  // conflate the preservation property with the deduplication property.
  const quantity = (index % 3) + 1 // cycles through 1, 2, 3
  const kind = index % 2 === 0 ? 'include' as const : 'exclude' as const
  const distinct = index % 4 < 2

  return fc.record({
    id: makeConditionId(),
    matcher: fc.constant(null),
    quantity: fc.constant(quantity),
    kind: fc.constant(kind),
    distinct: fc.constant(distinct),
  })
}

/**
 * Generates a pattern that satisfies the bug condition:
 * - At least 1 configured condition (matcher !== null)
 * - At least 1 unconfigured condition (matcher === null)
 */
function makeBugConditionPattern(cardIds: string[]): fc.Arbitrary<{
  pattern: HandPattern
  unconfiguredCount: number
}> {
  // Generate 1-4 unconfigured conditions, each with a unique signature
  // to avoid conflating the preservation property with deduplication behavior.
  return fc.integer({ min: 1, max: 4 }).chain((unconfiguredSize) => {
    const unconfiguredConditions = Array.from(
      { length: unconfiguredSize },
      (_, i) => makeUnconfiguredCondition(i),
    )

    return fc.record({
      configuredConditions: fc.array(makeConfiguredCondition(cardIds), { minLength: 1, maxLength: 4 }),
      unconfiguredConditions: fc.tuple(...unconfiguredConditions as [fc.Arbitrary<PatternCondition>, ...fc.Arbitrary<PatternCondition>[]]),
      patternId: fc.uuid(),
      // Empty name to also test the auto-rename bug
      name: fc.constantFrom('', ''),
      kind: fc.constantFrom('opening' as const, 'problem' as const),
    }).map(({ configuredConditions, unconfiguredConditions: unconfigured, patternId, name, kind }) => {
      const conditions = [...configuredConditions, ...unconfigured]
      const pattern: HandPattern = {
        id: patternId,
        name,
        kind,
        turnContext: 'first',
        logic: 'all',
        minimumConditionMatches: conditions.length,
        reusePolicy: 'allow',
        needsReview: false,
        conditions,
      }
      return {
        pattern,
        unconfiguredCount: unconfigured.length,
      }
    })
  })
}

// ── Test Suite ──

describe('Bug Condition Exploration: Unconfigured conditions removed during active editing', () => {
  // Set up a small deck of cards that matchers can reference
  const cards: CardEntry[] = [
    makeCardEntry('card-1', 'Ash Blossom'),
    makeCardEntry('card-2', 'Effect Veiler'),
    makeCardEntry('card-3', 'Nibiru'),
    makeCardEntry('card-4', 'Called by the Grave'),
    makeCardEntry('card-5', 'Maxx C'),
  ]
  const cardIds = cards.map((c) => c.id)

  it('Property 1: unconfigured conditions are preserved when pattern has mixed configured/unconfigured conditions', () => {
    /**
     * **Validates: Requirements 1.1, 1.3**
     *
     * For any pattern where the bug condition holds (has at least one configured
     * condition AND at least one unconfigured condition), curatePattern should
     * return a non-null result that preserves all unconfigured conditions.
     *
     * Assert: COUNT(result.conditions WHERE matcher === null) === COUNT(input.conditions WHERE matcher === null)
     */
    fc.assert(
      fc.property(
        makeBugConditionPattern(cardIds),
        ({ pattern, unconfiguredCount }) => {
          // Run through curatePatterns with includeDefaults: false to isolate our pattern
          const result = curatePatterns([pattern], cards, { includeDefaults: false })

          // The pattern should not be removed entirely
          expect(result.length).toBe(1)

          const curatedPattern = result[0]

          // Count unconfigured conditions in the output
          const resultUnconfiguredCount = curatedPattern.conditions.filter(
            (c) => c.matcher === null,
          ).length

          // The number of unconfigured conditions should be preserved
          expect(resultUnconfiguredCount).toBe(unconfiguredCount)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 1b: pattern name remains empty when pattern has unconfigured conditions (no auto-rename)', () => {
    /**
     * **Validates: Requirements 1.2**
     *
     * When a pattern has an empty name and contains unconfigured conditions
     * (indicating active editing), the system should preserve the empty name
     * without auto-renaming to "Salida sin nombre" / "Problema sin nombre".
     */
    fc.assert(
      fc.property(
        makeBugConditionPattern(cardIds),
        ({ pattern }) => {
          // Ensure the pattern has an empty name
          const patternWithEmptyName: HandPattern = { ...pattern, name: '' }

          const result = curatePatterns([patternWithEmptyName], cards, { includeDefaults: false })

          // The pattern should not be removed entirely
          expect(result.length).toBe(1)

          const curatedPattern = result[0]

          // The name should remain empty (no auto-rename during active editing)
          expect(curatedPattern.name).toBe('')
        },
      ),
      { numRuns: 100 },
    )
  })
})
