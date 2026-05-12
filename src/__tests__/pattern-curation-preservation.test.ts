import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { curatePatterns } from '../app/pattern-curation'
import type { CardEntry, HandPattern, Matcher, PatternCondition } from '../types'

/**
 * Preservation Property Tests
 *
 * These tests verify that existing curation behavior for NON-BUGGY patterns
 * works correctly on the UNFIXED code. They establish the baseline behavior
 * that must be preserved after the fix is applied.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
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

// ── Generators for Non-Buggy Patterns ──

/**
 * Generates a valid matcher that references cards in the deck.
 */
function makeValidMatcher(cardIds: string[]): fc.Arbitrary<Matcher> {
  return fc.oneof(
    // Card matcher referencing a valid card
    fc.constantFrom(...cardIds).map((id): Matcher => ({ type: 'card', value: id })),
    // Card pool matcher referencing valid cards
    fc.subarray(cardIds, { minLength: 1 }).map((ids): Matcher => ({
      type: 'card_pool',
      value: ids,
    })),
    // Origin matcher (always valid)
    fc.constantFrom('engine' as const, 'non_engine' as const, 'hybrid' as const).map((value): Matcher => ({
      type: 'origin',
      value,
    })),
    // Role matcher (always valid)
    fc.constantFrom(
      'starter' as const, 'extender' as const, 'enabler' as const, 'handtrap' as const,
      'disruption' as const, 'boardbreaker' as const, 'floodgate' as const, 'removal' as const,
      'searcher' as const, 'draw' as const, 'recovery' as const, 'combo_piece' as const,
      'payoff' as const, 'brick' as const, 'garnet' as const, 'tech' as const,
    ).map((value): Matcher => ({ type: 'role', value })),
    // Card type matcher
    fc.constantFrom('monster' as const, 'spell' as const, 'trap' as const).map((value): Matcher => ({
      type: 'card_type',
      value,
    })),
  )
}

/**
 * Generates a fully configured condition (matcher !== null) with valid card references.
 */
function makeConfiguredCondition(cardIds: string[]): fc.Arbitrary<PatternCondition> {
  return fc.record({
    id: makeConditionId(),
    matcher: makeValidMatcher(cardIds),
    quantity: fc.integer({ min: 1, max: 3 }),
    kind: fc.constantFrom('include' as const, 'exclude' as const),
    distinct: fc.boolean(),
  })
}

/**
 * Generates an unconfigured condition (matcher === null).
 */
function makeUnconfiguredCondition(): fc.Arbitrary<PatternCondition> {
  return fc.record({
    id: makeConditionId(),
    matcher: fc.constant(null),
    quantity: fc.integer({ min: 1, max: 3 }),
    kind: fc.constantFrom('include' as const, 'exclude' as const),
    distinct: fc.boolean(),
  })
}

/**
 * Generates a condition with an INVALID card reference (card not in deck).
 */
function makeInvalidCardCondition(): fc.Arbitrary<PatternCondition> {
  return fc.record({
    id: makeConditionId(),
    matcher: fc.oneof(
      fc.uuid().map((id): Matcher => ({ type: 'card', value: `invalid-${id}` })),
      fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }).map((ids): Matcher => ({
        type: 'card_pool',
        value: ids.map((id) => `invalid-${id}`),
      })),
    ),
    quantity: fc.integer({ min: 1, max: 3 }),
    kind: fc.constantFrom('include' as const, 'exclude' as const),
    distinct: fc.boolean(),
  })
}

/**
 * Generates a fully configured pattern (all matchers non-null).
 * This is a NON-BUGGY pattern.
 */
function makeFullyConfiguredPattern(cardIds: string[]): fc.Arbitrary<HandPattern> {
  return fc.record({
    id: fc.uuid(),
    name: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 30 })),
    kind: fc.constantFrom('opening' as const, 'problem' as const),
    turnContext: fc.constantFrom('first' as const, 'second' as const, 'either' as const),
    logic: fc.constantFrom('all' as const, 'any' as const),
    reusePolicy: fc.constantFrom('allow' as const, 'forbid' as const),
    needsReview: fc.constant(false),
    conditions: fc.array(makeConfiguredCondition(cardIds), { minLength: 1, maxLength: 5 }),
  }).map(({ id, name, kind, turnContext, logic, reusePolicy, needsReview, conditions }) => ({
    id,
    name,
    kind,
    turnContext,
    logic,
    minimumConditionMatches: conditions.length,
    reusePolicy,
    needsReview,
    conditions,
  }))
}

/**
 * Generates a fully unconfigured pattern (all matchers null, empty name).
 * This is a NON-BUGGY pattern protected by `isJustCreated`.
 */
function makeFullyUnconfiguredPattern(): fc.Arbitrary<HandPattern> {
  return fc.record({
    id: fc.uuid(),
    kind: fc.constantFrom('opening' as const, 'problem' as const),
    turnContext: fc.constantFrom('first' as const, 'second' as const, 'either' as const),
    logic: fc.constantFrom('all' as const, 'any' as const),
    reusePolicy: fc.constantFrom('allow' as const, 'forbid' as const),
    conditions: fc.array(makeUnconfiguredCondition(), { minLength: 1, maxLength: 5 }),
  }).map(({ id, kind, turnContext, logic, reusePolicy, conditions }) => ({
    id,
    name: '',
    kind,
    turnContext,
    logic,
    minimumConditionMatches: conditions.length,
    reusePolicy,
    needsReview: false,
    conditions,
  }))
}

// ── Test Data ──

const cards: CardEntry[] = [
  makeCardEntry('card-1', 'Ash Blossom'),
  makeCardEntry('card-2', 'Effect Veiler'),
  makeCardEntry('card-3', 'Nibiru'),
  makeCardEntry('card-4', 'Called by the Grave'),
  makeCardEntry('card-5', 'Maxx C'),
]
const cardIds = cards.map((c) => c.id)

// ── Test Suite ──

describe('Preservation Property Tests: Non-Buggy Patterns Curate Correctly', () => {
  describe('Fully configured patterns', () => {
    it('Property 2a: fully configured patterns produce valid curation output (removes invalid refs, deduplicates, auto-renames empty names)', () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * For any pattern where ALL conditions have non-null matchers referencing
       * valid cards, curatePatterns produces a non-empty result with:
       * - All conditions having non-null matchers
       * - Empty names auto-renamed to default
       * - Pattern kind preserved
       */
      fc.assert(
        fc.property(
          makeFullyConfiguredPattern(cardIds),
          (pattern) => {
            const result = curatePatterns([pattern], cards, { includeDefaults: false })

            // Pattern should not be removed (it has valid conditions)
            expect(result.length).toBe(1)

            const curated = result[0]

            // All conditions in output should have non-null matchers
            for (const condition of curated.conditions) {
              expect(condition.matcher).not.toBeNull()
            }

            // If input name was empty, output should be auto-renamed
            if (pattern.name.trim() === '') {
              const expectedName = curated.kind === 'opening'
                ? 'Salida sin nombre'
                : 'Problema sin nombre'
              expect(curated.name).toBe(expectedName)
            }

            // Pattern kind should be preserved
            expect(curated.kind).toBe(pattern.kind)

            // No duplicate conditions in output (by signature)
            const signatures = curated.conditions.map((c) =>
              JSON.stringify({ matcher: c.matcher, quantity: c.quantity, kind: c.kind, distinct: c.distinct }),
            )
            const uniqueSignatures = new Set(signatures)
            expect(signatures.length).toBe(uniqueSignatures.size)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Fully unconfigured patterns (isJustCreated)', () => {
    it('Property 2b: fully unconfigured patterns pass through unchanged', () => {
      /**
       * **Validates: Requirements 3.5**
       *
       * For any pattern where ALL conditions have null matchers and name is empty,
       * the `isJustCreated` guard preserves the pattern as-is.
       */
      fc.assert(
        fc.property(
          makeFullyUnconfiguredPattern(),
          (pattern) => {
            const result = curatePatterns([pattern], cards, { includeDefaults: false })

            // Pattern should be preserved
            expect(result.length).toBe(1)

            const curated = result[0]

            // The pattern should be returned as-is
            expect(curated.id).toBe(pattern.id)
            expect(curated.name).toBe('')
            expect(curated.conditions.length).toBe(pattern.conditions.length)

            // All conditions should still have null matchers
            for (const condition of curated.conditions) {
              expect(condition.matcher).toBeNull()
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Patterns with needsReview: true', () => {
    it('Property 2c: patterns with needsReview true are removed (return null)', () => {
      /**
       * **Validates: Requirements 3.2 (regression prevention)**
       *
       * Patterns with `needsReview: true` are always filtered out by curatePattern.
       */
      fc.assert(
        fc.property(
          makeFullyConfiguredPattern(cardIds).map((p) => ({ ...p, needsReview: true })),
          (pattern) => {
            const result = curatePatterns([pattern], cards, { includeDefaults: false })

            // Pattern should be removed
            expect(result.length).toBe(0)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Invalid card references', () => {
    it('Property 2d: conditions referencing cards not in deck are removed', () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * For patterns with conditions that reference card IDs not present in
       * the cardById map, those conditions are removed during curation.
       * If all conditions are invalid, the entire pattern is removed.
       */
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            name: fc.constant('Test Pattern'),
            kind: fc.constantFrom('opening' as const, 'problem' as const),
            turnContext: fc.constant('first' as const),
            logic: fc.constant('all' as const),
            reusePolicy: fc.constant('allow' as const),
            needsReview: fc.constant(false),
            invalidConditions: fc.array(makeInvalidCardCondition(), { minLength: 1, maxLength: 3 }),
          }).map(({ id, name, kind, turnContext, logic, reusePolicy, needsReview, invalidConditions }) => ({
            id,
            name,
            kind,
            turnContext,
            logic,
            minimumConditionMatches: invalidConditions.length,
            reusePolicy,
            needsReview,
            conditions: invalidConditions,
          })),
          (pattern) => {
            const result = curatePatterns([pattern], cards, { includeDefaults: false })

            // Pattern with only invalid conditions should be removed entirely
            expect(result.length).toBe(0)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('Property 2e: mixed valid and invalid card conditions - invalid ones are removed, valid ones kept', () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * When a fully configured pattern has a mix of valid and invalid card
       * references, only the invalid ones are removed.
       */
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            name: fc.constant('Mixed Pattern'),
            kind: fc.constantFrom('opening' as const, 'problem' as const),
            turnContext: fc.constant('first' as const),
            logic: fc.constant('all' as const),
            reusePolicy: fc.constant('allow' as const),
            needsReview: fc.constant(false),
            validConditions: fc.array(makeConfiguredCondition(cardIds), { minLength: 1, maxLength: 3 }),
            invalidConditions: fc.array(makeInvalidCardCondition(), { minLength: 1, maxLength: 3 }),
          }).map(({ id, name, kind, turnContext, logic, reusePolicy, needsReview, validConditions, invalidConditions }) => ({
            pattern: {
              id,
              name,
              kind,
              turnContext,
              logic,
              minimumConditionMatches: validConditions.length + invalidConditions.length,
              reusePolicy,
              needsReview,
              conditions: [...validConditions, ...invalidConditions],
            } as HandPattern,
            validCount: validConditions.length,
          })),
          ({ pattern, validCount }) => {
            const result = curatePatterns([pattern], cards, { includeDefaults: false })

            // Pattern should still exist (has valid conditions)
            expect(result.length).toBe(1)

            const curated = result[0]

            // All remaining conditions should have non-null matchers
            for (const condition of curated.conditions) {
              expect(condition.matcher).not.toBeNull()
            }

            // The number of conditions should be <= validCount
            // (could be less due to deduplication)
            expect(curated.conditions.length).toBeLessThanOrEqual(validCount)
            expect(curated.conditions.length).toBeGreaterThanOrEqual(1)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Duplicate conditions', () => {
    it('Property 2f: duplicate conditions are deduplicated', () => {
      /**
       * **Validates: Requirements 3.3**
       *
       * When a pattern has duplicate conditions (same matcher, quantity, kind,
       * distinct), curation deduplicates them so only one copy remains.
       */
      fc.assert(
        fc.property(
          makeConfiguredCondition(cardIds).chain((baseCondition) =>
            fc.record({
              id: fc.uuid(),
              name: fc.constant('Dedup Pattern'),
              kind: fc.constantFrom('opening' as const, 'problem' as const),
              turnContext: fc.constant('first' as const),
              logic: fc.constant('all' as const),
              reusePolicy: fc.constant('allow' as const),
              repeatCount: fc.integer({ min: 2, max: 5 }),
            }).map(({ id, name, kind, turnContext, logic, reusePolicy, repeatCount }) => {
              // Create duplicate conditions with different IDs but same matcher/quantity/kind/distinct
              const duplicates: PatternCondition[] = Array.from({ length: repeatCount }, (_, i) => ({
                ...baseCondition,
                id: `dup-${id}-${i}`,
              }))
              return {
                pattern: {
                  id,
                  name,
                  kind,
                  turnContext,
                  logic,
                  minimumConditionMatches: duplicates.length,
                  reusePolicy,
                  needsReview: false,
                  conditions: duplicates,
                } as HandPattern,
                repeatCount,
              }
            }),
          ),
          ({ pattern, repeatCount }) => {
            const result = curatePatterns([pattern], cards, { includeDefaults: false })

            // Pattern should exist
            expect(result.length).toBe(1)

            const curated = result[0]

            // Duplicates should be deduplicated to exactly 1
            expect(curated.conditions.length).toBe(1)

            // The remaining condition should have a non-null matcher
            expect(curated.conditions[0].matcher).not.toBeNull()
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
