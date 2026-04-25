import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { buildPatternCompactSummary } from '../components/probability/pattern-helpers'
import type {
  CardEntry,
  CardOrigin,
  CardRole,
  HandPattern,
  Matcher,
  PatternCondition,
  PatternKind,
  PatternLogic,
  ReusePolicy,
} from '../types'

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbCardOrigin: fc.Arbitrary<CardOrigin> = fc.constantFrom('engine', 'non_engine', 'hybrid')
const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
)
const arbPatternKind: fc.Arbitrary<PatternKind> = fc.constantFrom('opening', 'problem')
const arbPatternLogic: fc.Arbitrary<PatternLogic> = fc.constantFrom('all', 'any')
const arbReusePolicy: fc.Arbitrary<ReusePolicy> = fc.constantFrom('allow', 'forbid')

const arbRoleMatcher: fc.Arbitrary<Matcher> = arbCardRole.map((role) => ({
  type: 'role' as const,
  value: role,
}))

const arbOriginMatcher: fc.Arbitrary<Matcher> = arbCardOrigin.map((origin) => ({
  type: 'origin' as const,
  value: origin,
}))

const arbNonNullMatcher: fc.Arbitrary<Matcher> = fc.oneof(arbRoleMatcher, arbOriginMatcher)

function arbConditionWithMatcher(): fc.Arbitrary<PatternCondition> {
  return fc.tuple(
    fc.string({ minLength: 8, maxLength: 16 }).map((s) => `req-${s}`),
    arbNonNullMatcher,
    fc.integer({ min: 1, max: 5 }),
    fc.constantFrom('include' as const, 'exclude' as const),
    fc.boolean(),
  ).map(([id, matcher, quantity, kind, distinct]) => ({
    id,
    matcher,
    quantity,
    kind,
    distinct,
  }))
}

function arbPatternWithConditions(): fc.Arbitrary<HandPattern> {
  return fc.tuple(
    fc.string({ minLength: 8, maxLength: 16 }).map((s) => `pattern-${s}`),
    fc.string({ minLength: 0, maxLength: 20 }),
    arbPatternKind,
    arbPatternLogic,
    fc.integer({ min: 1, max: 5 }),
    arbReusePolicy,
    fc.array(arbConditionWithMatcher(), { minLength: 1, maxLength: 5 }),
  ).map(([id, name, kind, logic, minimumConditionMatches, reusePolicy, conditions]) => ({
    id,
    name,
    kind,
    logic,
    minimumConditionMatches: Math.min(minimumConditionMatches, conditions.length),
    reusePolicy,
    needsReview: false,
    conditions,
  }))
}

function makeCardById(conditions: PatternCondition[]): Map<string, CardEntry> {
  const map = new Map<string, CardEntry>()

  for (const condition of conditions) {
    if (condition.matcher?.type === 'card') {
      map.set(condition.matcher.value, {
        id: condition.matcher.value,
        name: `Card ${condition.matcher.value}`,
        copies: 3,
        source: 'manual',
        apiCard: null,
        origin: 'engine',
        roles: ['starter'],
        needsReview: false,
      })
    }
  }

  return map
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RuleSentence summary', () => {
  it('Property 3: summary is non-empty for patterns with conditions that have non-null matchers', () => {
    /** Feature: visual-rule-builder, Property 3: Summary is non-empty for patterns with conditions */
    fc.assert(
      fc.property(arbPatternWithConditions(), (pattern) => {
        const cardById = makeCardById(pattern.conditions)
        const summary = buildPatternCompactSummary(pattern, cardById)
        expect(summary.length).toBeGreaterThan(0)
      }),
      { numRuns: 200 },
    )
  })

  it('summary returns "Regla sin definir" for pattern with zero conditions', () => {
    const emptyPattern: HandPattern = {
      id: 'test-empty',
      name: '',
      kind: 'opening',
      logic: 'all',
      minimumConditionMatches: 1,
      reusePolicy: 'forbid',
      needsReview: false,
      conditions: [],
    }
    const summary = buildPatternCompactSummary(emptyPattern, new Map())
    expect(summary).toBe('Regla sin definir')
  })

  it('summary for single-condition pattern produces a single-part output', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 8, maxLength: 16 }).map((s) => `pattern-${s}`),
          arbPatternKind,
          arbConditionWithMatcher(),
        ),
        ([id, kind, condition]) => {
          const pattern: HandPattern = {
            id,
            name: '',
            kind,
            logic: 'all',
            minimumConditionMatches: 1,
            reusePolicy: 'forbid',
            needsReview: false,
            conditions: [condition],
          }
          const summary = buildPatternCompactSummary(pattern, makeCardById([condition]))
          // Single condition with "all" logic should not have the " + " multi-condition connector
          expect(summary).not.toContain(' + ')
          // Should not start with "Una de estas:" prefix used for "any" mode
          expect(summary.startsWith('Una de estas:')).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('summary for multi-condition "all" pattern contains " + " connector', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 8, maxLength: 16 }).map((s) => `pattern-${s}`),
          arbPatternKind,
          fc.array(arbConditionWithMatcher(), { minLength: 2, maxLength: 4 }),
        ),
        ([id, kind, conditions]) => {
          const pattern: HandPattern = {
            id,
            name: '',
            kind,
            logic: 'all',
            minimumConditionMatches: conditions.length,
            reusePolicy: 'forbid',
            needsReview: false,
            conditions,
          }
          const summary = buildPatternCompactSummary(pattern, makeCardById(conditions))
          expect(summary).toContain(' + ')
        },
      ),
      { numRuns: 100 },
    )
  })
})
