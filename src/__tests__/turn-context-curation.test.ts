import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { curatePatterns, getPatternCollectionSignature } from '../app/pattern-curation'
import type {
  CardEntry,
  CardOrigin,
  CardRole,
  HandPattern,
  Matcher,
  PatternCondition,
  PatternKind,
  TurnContext,
} from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// A small fixed deck with a variety of roles and origins so role/origin
// matchers always resolve against something real. We use a single fixed
// deck (rather than generating it) because the focus of these tests is
// pattern-level turnContext behavior, not card generation.
function makeFixedDeck(): CardEntry[] {
  return [
    makeCard('c-starter', 'Starter A', 3, 'engine', ['starter']),
    makeCard('c-extender', 'Extender A', 3, 'engine', ['extender']),
    makeCard('c-handtrap', 'Handtrap A', 3, 'non_engine', ['handtrap']),
    makeCard('c-brick', 'Brick A', 1, 'engine', ['brick']),
  ]
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbValidTurnContext: fc.Arbitrary<TurnContext> = fc.constantFrom('first', 'second', 'either')

const arbPatternKind: fc.Arbitrary<PatternKind> = fc.constantFrom('opening', 'problem')

const arbRoleMatcher: fc.Arbitrary<Matcher> = fc.constantFrom<Matcher>(
  { type: 'role', value: 'starter' },
  { type: 'role', value: 'extender' },
  { type: 'role', value: 'handtrap' },
  { type: 'role', value: 'brick' },
)

const arbOriginMatcher: fc.Arbitrary<Matcher> = fc.constantFrom<Matcher>(
  { type: 'origin', value: 'engine' },
  { type: 'origin', value: 'non_engine' },
)

const arbRoleOrOriginMatcher: fc.Arbitrary<Matcher> = fc.oneof(arbRoleMatcher, arbOriginMatcher)

/**
 * Conditions backed by role / origin matchers always have a non-null matcher,
 * so curation will not discard them via the "empty pool" / null-matcher paths.
 */
function arbValidCondition(): fc.Arbitrary<PatternCondition> {
  return fc
    .tuple(
      fc.string({ minLength: 4, maxLength: 10 }).map((s) => `req-${s}`),
      arbRoleOrOriginMatcher,
      fc.integer({ min: 1, max: 3 }),
      fc.constantFrom('include' as const, 'exclude' as const),
      fc.boolean(),
    )
    .map(([id, matcher, quantity, kind, distinct]) => ({
      id,
      matcher,
      quantity,
      kind,
      distinct,
    }))
}

/**
 * A pattern that should always survive curation: non-empty name, real
 * conditions with non-null matchers, and a well-formed turnContext.
 */
function arbValidPattern(turnContext: fc.Arbitrary<unknown> = arbValidTurnContext): fc.Arbitrary<HandPattern> {
  return fc
    .tuple(
      fc.string({ minLength: 4, maxLength: 10 }).map((s) => `pattern-${s}`),
      fc.stringMatching(/^[A-Z][a-z]{2,10}$/),
      arbPatternKind,
      fc.array(arbValidCondition(), { minLength: 1, maxLength: 3 }),
      turnContext,
    )
    .map(([id, name, kind, conditions, tc]) => ({
      id,
      name,
      kind,
      // The cast is intentional: tests for 3.3.1 feed junk turnContext values
      // to curatePatterns to verify normalization; TS typing of HandPattern
      // requires TurnContext here but runtime normalization is what we test.
      turnContext: tc as TurnContext,
      logic: 'all' as const,
      minimumConditionMatches: 1,
      reusePolicy: 'forbid' as const,
      needsReview: false,
      conditions,
    }))
}

function arbValidPatterns(): fc.Arbitrary<HandPattern[]> {
  return fc
    .array(arbValidPattern(), { minLength: 1, maxLength: 4 })
    // Ensure unique ids across the collection so curation doesn't dedupe
    // via accidental id/signature collisions from the generator.
    .map((patterns) => patterns.map((p, i) => ({ ...p, id: `pattern-${i}-${p.id}` })))
}

/**
 * arbJunkTurnContext generates both valid turnContext values and arbitrary
 * junk (undefined, null, numbers, strings), so we can verify curation
 * normalizes every case.
 */
const arbJunkTurnContext: fc.Arbitrary<unknown> = fc.oneof(
  arbValidTurnContext,
  fc.constant(undefined),
  fc.constant(null),
  fc.integer(),
  fc.string(),
  fc.boolean(),
  fc.constant('FIRST'),
  fc.constant('Second'),
  fc.constant(''),
)

function arbPatternsWithJunkTurnContext(): fc.Arbitrary<HandPattern[]> {
  return fc
    .array(arbValidPattern(arbJunkTurnContext), { minLength: 1, maxLength: 4 })
    .map((patterns) => patterns.map((p, i) => ({ ...p, id: `pattern-${i}-${p.id}` })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Turn-context curation', () => {
  it('3.3.1: curatePatterns normalizes turnContext to valid values', () => {
    /** Validates: Requirements 1.2, 9.3 */
    fc.assert(
      fc.property(
        arbPatternsWithJunkTurnContext(),
        (patterns) => {
          const cards = makeFixedDeck()
          const curated = curatePatterns(patterns, cards, { includeDefaults: false })
          for (const p of curated) {
            expect(['first', 'second', 'either']).toContain(p.turnContext)
          }
        },
      ),
    )
  })

  it('3.3.2: curatePatterns is idempotent including turnContext normalization', () => {
    /** Validates: Requirements 8.6, 9.3 */
    fc.assert(
      fc.property(
        arbPatternsWithJunkTurnContext(),
        (patterns) => {
          const cards = makeFixedDeck()
          const once = curatePatterns(patterns, cards, { includeDefaults: false })
          const twice = curatePatterns(once, cards, { includeDefaults: false })
          expect(getPatternCollectionSignature(twice)).toBe(getPatternCollectionSignature(once))
        },
      ),
    )
  })

  it('3.3.3: getPatternCollectionSignature differs when one pattern\'s turnContext differs', () => {
    /** Validates: Requirements 9.2 */
    fc.assert(
      fc.property(
        arbValidPatterns(),
        fc.constantFrom<TurnContext>('first', 'second'),
        fc.constantFrom<TurnContext>('first', 'second'),
        (patterns, tc1, tc2) => {
          fc.pre(tc1 !== tc2)
          const a = patterns.map((p, i) => (i === 0 ? { ...p, turnContext: tc1 } : p))
          const b = patterns.map((p, i) => (i === 0 ? { ...p, turnContext: tc2 } : p))
          expect(getPatternCollectionSignature(a)).not.toBe(getPatternCollectionSignature(b))
        },
      ),
    )
  })

  it('3.3.4: patterns identical except for turnContext in {first, second} both survive curation', () => {
    /** Validates: Requirements 9.3 */
    fc.assert(
      fc.property(
        arbValidPattern(),
        (basePattern) => {
          const cards = makeFixedDeck()
          const patternFirst: HandPattern = {
            ...basePattern,
            id: 'p-first',
            turnContext: 'first',
          }
          const patternSecond: HandPattern = {
            ...basePattern,
            id: 'p-second',
            turnContext: 'second',
          }
          const curated = curatePatterns([patternFirst, patternSecond], cards, {
            includeDefaults: false,
          })
          const firstFound = curated.find((p) => p.turnContext === 'first')
          const secondFound = curated.find((p) => p.turnContext === 'second')
          expect(firstFound, 'first-context pattern should survive curation').toBeDefined()
          expect(secondFound, 'second-context pattern should survive curation').toBeDefined()
        },
      ),
    )
  })
})
