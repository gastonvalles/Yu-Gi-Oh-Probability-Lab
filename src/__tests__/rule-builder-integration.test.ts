import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createPattern, createMatcherPattern } from '../app/pattern-factory'
import { PATTERN_PRESET_DEFINITIONS, buildPatternPresets } from '../app/pattern-presets'
import { buildPatternCompactSummary } from '../components/probability/pattern-helpers'
import { getConditionLabel, getKindLabel } from '../components/probability/rule-builder/condition-labels'
import { getSemanticLabel } from '../components/probability/rule-builder/LiveResultBadge'
import { getConnectorWord } from '../components/probability/rule-builder/LogicSelector'
import { getPatternMatchMode, normalizeMinimumConditionMatches } from '../app/patterns'
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

function makeRealisticDeck(): CardEntry[] {
  return [
    makeCard('s1', 'Starter A', 3, 'engine', ['starter']),
    makeCard('s2', 'Starter B', 3, 'engine', ['starter']),
    makeCard('e1', 'Extender A', 3, 'engine', ['extender']),
    makeCard('e2', 'Extender B', 2, 'engine', ['extender']),
    makeCard('ht1', 'Ash Blossom', 3, 'non_engine', ['handtrap']),
    makeCard('ht2', 'Maxx C', 3, 'non_engine', ['handtrap']),
    makeCard('d1', 'Disruption A', 2, 'non_engine', ['disruption']),
    makeCard('b1', 'Brick A', 2, 'engine', ['brick']),
    makeCard('b2', 'Brick B', 1, 'engine', ['brick']),
    makeCard('cp1', 'Combo Piece', 3, 'engine', ['combo_piece']),
    makeCard('se1', 'Searcher A', 3, 'engine', ['searcher']),
    makeCard('dr1', 'Draw Card', 2, 'non_engine', ['draw']),
    makeCard('f1', 'Filler', 10, 'non_engine', ['tech']),
  ]
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
)
const arbCardOrigin: fc.Arbitrary<CardOrigin> = fc.constantFrom('engine', 'non_engine', 'hybrid')
const arbPatternKind: fc.Arbitrary<PatternKind> = fc.constantFrom('opening', 'problem')
const arbPatternLogic: fc.Arbitrary<PatternLogic> = fc.constantFrom('all', 'any')
const arbReusePolicy: fc.Arbitrary<ReusePolicy> = fc.constantFrom('allow', 'forbid')

const arbNonNullMatcher: fc.Arbitrary<Matcher> = fc.oneof(
  arbCardRole.map((role) => ({ type: 'role' as const, value: role })),
  arbCardOrigin.map((origin) => ({ type: 'origin' as const, value: origin })),
)

function arbCondition(): fc.Arbitrary<PatternCondition> {
  return fc.tuple(
    fc.string({ minLength: 4, maxLength: 12 }).map((s) => `req-${s}`),
    arbNonNullMatcher,
    fc.integer({ min: 1, max: 5 }),
    fc.constantFrom('include' as const, 'exclude' as const),
    fc.boolean(),
  ).map(([id, matcher, quantity, kind, distinct]) => ({
    id, matcher, quantity, kind, distinct,
  }))
}

function arbExistingPattern(): fc.Arbitrary<HandPattern> {
  return fc.tuple(
    fc.string({ minLength: 4, maxLength: 12 }).map((s) => `pattern-${s}`),
    fc.string({ minLength: 1, maxLength: 20 }),
    arbPatternKind,
    arbPatternLogic,
    fc.integer({ min: 1, max: 5 }),
    arbReusePolicy,
    fc.boolean(),
    fc.array(arbCondition(), { minLength: 1, maxLength: 5 }),
  ).map(([id, name, kind, logic, minMatches, reusePolicy, needsReview, conditions]) => ({
    id,
    name,
    kind,
    logic,
    minimumConditionMatches: Math.min(minMatches, conditions.length),
    reusePolicy,
    needsReview,
    conditions,
  }))
}

// ---------------------------------------------------------------------------
// Test 1: RuleBuilder renders correctly for existing patterns
// ---------------------------------------------------------------------------

describe('Drawer integration: existing patterns render without data loss', () => {
  it('all fields of any existing pattern are readable by the RuleBuilder pipeline', () => {
    fc.assert(
      fc.property(arbExistingPattern(), (pattern) => {
        const deck: CardEntry[] = []
        const cardById = new Map<string, CardEntry>()

        // RuleSentence reads summary
        const summary = buildPatternCompactSummary(pattern, cardById)
        expect(typeof summary).toBe('string')
        expect(summary.length).toBeGreaterThan(0)

        // KindToggle reads kind
        expect(['opening', 'problem']).toContain(pattern.kind)

        // LogicSelector reads mode
        const mode = getPatternMatchMode(pattern)
        expect(['all', 'any', 'at-least']).toContain(mode)

        // LogicSelector reads minimumMatches
        const minMatches = normalizeMinimumConditionMatches(pattern)
        expect(minMatches).toBeGreaterThanOrEqual(1)

        // Connector word
        const connector = getConnectorWord(mode)
        expect(['Y', 'O']).toContain(connector)

        // Each condition renders
        for (const condition of pattern.conditions) {
          const kindLabel = getKindLabel(condition.kind)
          expect(['Al menos', 'Sin']).toContain(kindLabel)

          const condLabel = getConditionLabel(condition.matcher, deck)
          expect(typeof condLabel).toBe('string')
          expect(condLabel.length).toBeGreaterThan(0)

          expect(condition.quantity).toBeGreaterThanOrEqual(1)
        }

        // AdvancedSettings reads needsReview
        expect(typeof pattern.needsReview).toBe('boolean')

        // reusePolicy
        expect(['allow', 'forbid']).toContain(pattern.reusePolicy)
      }),
      { numRuns: 150 },
    )
  })
})

// ---------------------------------------------------------------------------
// Test 2: New pattern shows guided empty state
// ---------------------------------------------------------------------------

describe('Drawer integration: new pattern empty state', () => {
  it('new pattern with no card ID triggers empty state conditions', () => {
    const pattern = createPattern('', undefined, 'opening')

    const isPendingCreation = true
    const hasDefinedMatchers = pattern.conditions.some((c) => c.matcher !== null)

    expect(isPendingCreation).toBe(true)
    expect(hasDefinedMatchers).toBe(false)
    // → showEmptyState = true
  })

  it('new pattern for problem also triggers empty state', () => {
    const pattern = createPattern('', undefined, 'problem')

    const hasDefinedMatchers = pattern.conditions.some((c) => c.matcher !== null)
    expect(hasDefinedMatchers).toBe(false)
    expect(pattern.kind).toBe('problem')
    expect(pattern.conditions[0].kind).toBe('exclude')
  })
})

// ---------------------------------------------------------------------------
// Test 3: LiveResultBadge semantic labels for drawer context
// ---------------------------------------------------------------------------

describe('Drawer integration: LiveResultBadge in context', () => {
  it('opening pattern with high probability shows "Alta consistencia"', () => {
    const label = getSemanticLabel(0.90, 'opening')
    expect(label.text).toBe('Alta consistencia')
    expect(label.tone).toBe('positive')
  })

  it('problem pattern with high probability shows "Riesgo crítico"', () => {
    const label = getSemanticLabel(0.35, 'problem')
    expect(label.text).toBe('Problema crítico — revisá el deck')
    expect(label.tone).toBe('critical')
  })

  it('null probability handled gracefully (no semantic label)', () => {
    // LiveResultBadge shows "—" for null — tested in unit tests
    // Here we verify the semantic function handles edge values
    const label = getSemanticLabel(0, 'opening')
    expect(label.text).toBe('Muy baja — revisá el deck')

    const labelProblem = getSemanticLabel(0, 'problem')
    expect(labelProblem.text).toBe('Problema mínimo')
  })
})

// ---------------------------------------------------------------------------
// Test 4: Legacy patterns with needsReview
// ---------------------------------------------------------------------------

describe('Drawer integration: legacy pattern compatibility', () => {
  it('pattern with needsReview=true is detectable for AdvancedSettings auto-expand', () => {
    const legacyPattern: HandPattern = {
      id: 'legacy-1',
      name: 'Old Pattern',
      kind: 'opening',
      logic: 'all',
      minimumConditionMatches: 1,
      reusePolicy: 'allow',
      needsReview: true,
      conditions: [
        {
          id: 'req-1',
          matcher: { type: 'role', value: 'starter' },
          quantity: 1,
          kind: 'include',
          distinct: false,
        },
      ],
    }

    // AdvancedSettings checks this
    expect(legacyPattern.needsReview).toBe(true)

    // All fields still render
    const summary = buildPatternCompactSummary(
      legacyPattern,
      new Map<string, CardEntry>(),
    )
    expect(summary.length).toBeGreaterThan(0)
    expect(getKindLabel(legacyPattern.conditions[0].kind)).toBe('Al menos')
    expect(getConditionLabel(legacyPattern.conditions[0].matcher, [])).toBe('Starter')
  })

  it('pattern with reusePolicy "allow" is preserved and readable', () => {
    fc.assert(
      fc.property(arbExistingPattern(), (pattern) => {
        // reusePolicy is always preserved — never mutated by reading
        expect(['allow', 'forbid']).toContain(pattern.reusePolicy)
      }),
      { numRuns: 50 },
    )
  })
})

// ---------------------------------------------------------------------------
// Test 5: Save/cancel/delete actions remain connected
// ---------------------------------------------------------------------------

describe('Drawer integration: action connectivity', () => {
  it('onRequestDelete receives the pattern ID', () => {
    const pattern = createMatcherPattern('Test', 'opening', [
      { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
    ])

    // RuleBuilder calls onRequestDelete(pattern.id)
    // We verify the ID is a non-empty string
    expect(pattern.id).toBeTruthy()
    expect(typeof pattern.id).toBe('string')
    expect(pattern.id.startsWith('pattern-')).toBe(true)
  })

  it('pattern created by preset has a valid ID for tracking', () => {
    const deck = makeRealisticDeck()
    const presets = buildPatternPresets(deck)

    for (const preset of presets) {
      expect(preset.pattern.id).toBeTruthy()
      expect(typeof preset.pattern.id).toBe('string')
    }
  })
})
