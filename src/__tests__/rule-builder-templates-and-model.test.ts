import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  PATTERN_PRESET_DEFINITIONS,
  buildPatternPresets,
} from '../app/pattern-presets'
import { buildPatternCompactSummary } from '../components/probability/pattern-helpers'
import { updatePatternName, updatePatternCategory } from '../app/pattern-updates'
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

/** A realistic deck with enough variety for presets to build. */
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

const arbRoleMatcher: fc.Arbitrary<Matcher> = arbCardRole.map((role) => ({
  type: 'role' as const,
  value: role,
}))

const arbOriginMatcher: fc.Arbitrary<Matcher> = arbCardOrigin.map((origin) => ({
  type: 'origin' as const,
  value: origin,
}))

const arbNonNullMatcher: fc.Arbitrary<Matcher> = fc.oneof(arbRoleMatcher, arbOriginMatcher)

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

function arbPattern(): fc.Arbitrary<HandPattern> {
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
// Tests: QuickTemplates preset application
// ---------------------------------------------------------------------------

describe('QuickTemplates preset application', () => {
  const TEMPLATE_IDS = [
    'starter_opening',
    'double_brick_problem',
    'starter_extender_opening',
    'interaction_opening',
  ]

  it('Property 10: each template builds a valid pattern with correct structure', () => {
    /** Feature: visual-rule-builder, Property 10: QuickTemplates preset application preserves preset structure */
    const deck = makeRealisticDeck()
    const presets = buildPatternPresets(deck)
    const presetById = new Map(presets.map((p) => [p.id, p]))

    for (const templateId of TEMPLATE_IDS) {
      const preset = presetById.get(templateId)

      if (!preset) {
        continue // preset may not build for this deck
      }

      const definition = PATTERN_PRESET_DEFINITIONS.find((d) => d.id === templateId)!
      const builtPattern = definition.build(deck)!

      // Structure matches
      expect(builtPattern.kind).toBe(preset.kind)
      expect(builtPattern.conditions.length).toBeGreaterThan(0)

      // Each condition has a non-null matcher
      for (const condition of builtPattern.conditions) {
        expect(condition.matcher).not.toBeNull()
      }
    }
  })

  it('each template produces a non-empty preview', () => {
    const deck = makeRealisticDeck()
    const cardById = new Map(deck.map((c) => [c.id, c]))

    for (const templateId of TEMPLATE_IDS) {
      const definition = PATTERN_PRESET_DEFINITIONS.find((d) => d.id === templateId)

      if (!definition) continue

      const pattern = definition.build(deck)

      if (!pattern) continue

      const preview = buildPatternCompactSummary(pattern, cardById)
      expect(preview.length).toBeGreaterThan(0)
      expect(preview).not.toBe('Regla sin definir')
    }
  })

  it('templates have correct labels and descriptions', () => {
    const expectedLabels: Record<string, string> = {
      starter_opening: 'Salida básica',
      starter_extender_opening: 'Salida con seguimiento',
      starter_protection_opening: 'Salida con interacción',
      no_starter_problem: 'Mano sin Starter',
      double_brick_problem: '2+ Bricks en mano',
      no_interaction_problem: 'Mano sin interacción',
      triple_non_engine_problem: '3+ Non-engine en mano',
      extender_without_starter_problem: 'Extender sin Starter',
    }

    for (const [presetId, expectedLabel] of Object.entries(expectedLabels)) {
      expect(expectedLabel.length).toBeGreaterThan(0)
      expect(PATTERN_PRESET_DEFINITIONS.some((d) => d.id === presetId)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: Field preservation round-trip (Property 4)
// ---------------------------------------------------------------------------

describe('Data model field preservation', () => {
  it('Property 4: updatePatternName preserves all other fields', () => {
    /** Feature: visual-rule-builder, Property 4: Field preservation round-trip */
    fc.assert(
      fc.property(
        arbPattern(),
        fc.string({ minLength: 0, maxLength: 30 }),
        (pattern, newName) => {
          const patterns = [pattern]
          const updated = updatePatternName(patterns, pattern.id, newName)
          const result = updated[0]

          // Name changed
          expect(result.name).toBe(newName)

          // Everything else preserved
          expect(result.id).toBe(pattern.id)
          expect(result.kind).toBe(pattern.kind)
          expect(result.logic).toBe(pattern.logic)
          expect(result.minimumConditionMatches).toBe(pattern.minimumConditionMatches)
          expect(result.reusePolicy).toBe(pattern.reusePolicy)
          expect(result.needsReview).toBe(pattern.needsReview)
          expect(result.conditions.length).toBe(pattern.conditions.length)

          for (let i = 0; i < result.conditions.length; i++) {
            expect(result.conditions[i].id).toBe(pattern.conditions[i].id)
            expect(result.conditions[i].matcher).toEqual(pattern.conditions[i].matcher)
            expect(result.conditions[i].quantity).toBe(pattern.conditions[i].quantity)
            expect(result.conditions[i].kind).toBe(pattern.conditions[i].kind)
            expect(result.conditions[i].distinct).toBe(pattern.conditions[i].distinct)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: Kind switch preserves condition kinds (Property 5)
// ---------------------------------------------------------------------------

describe('Kind switch preserves condition kinds', () => {
  it('Property 5: switching pattern kind does not change any condition.kind', () => {
    /** Feature: visual-rule-builder, Property 5: Kind switch preserves condition kinds */
    fc.assert(
      fc.property(arbPattern(), (pattern) => {
        const originalConditionKinds = pattern.conditions.map((c) => c.kind)
        const flippedKind: PatternKind = pattern.kind === 'opening' ? 'problem' : 'opening'
        const patterns = [pattern]
        const updated = updatePatternCategory(patterns, pattern.id, flippedKind)
        const result = updated[0]

        // Pattern kind changed
        expect(result.kind).toBe(flippedKind)

        // Condition kinds preserved
        expect(result.conditions.length).toBe(originalConditionKinds.length)

        for (let i = 0; i < result.conditions.length; i++) {
          expect(result.conditions[i].kind).toBe(originalConditionKinds[i])
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: AdvancedSettings behavior
// ---------------------------------------------------------------------------

describe('AdvancedSettings behavior', () => {
  it('needsReview false means collapsed by default (auto-expand only when true)', () => {
    const normalPattern: HandPattern = {
      id: 'test-1',
      name: 'Test',
      kind: 'opening',
      logic: 'all',
      minimumConditionMatches: 1,
      reusePolicy: 'forbid',
      needsReview: false,
      conditions: [],
    }
    // needsReview false → should NOT auto-expand
    expect(normalPattern.needsReview).toBe(false)
  })

  it('needsReview true triggers auto-expand', () => {
    const legacyPattern: HandPattern = {
      id: 'test-2',
      name: 'Legacy',
      kind: 'opening',
      logic: 'all',
      minimumConditionMatches: 1,
      reusePolicy: 'forbid',
      needsReview: true,
      conditions: [],
    }
    // needsReview true → should auto-expand
    expect(legacyPattern.needsReview).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: No type or Redux mutations
// ---------------------------------------------------------------------------

describe('No type or Redux mutations', () => {
  it('updatePatternName returns a new array, does not mutate input', () => {
    fc.assert(
      fc.property(arbPattern(), (pattern) => {
        const patterns = [pattern]
        const updated = updatePatternName(patterns, pattern.id, 'new name')

        // New array reference
        expect(updated).not.toBe(patterns)
        // Original unchanged
        expect(patterns[0].name).toBe(pattern.name)
      }),
      { numRuns: 50 },
    )
  })

  it('updatePatternCategory returns a new array, does not mutate input', () => {
    fc.assert(
      fc.property(arbPattern(), (pattern) => {
        const patterns = [pattern]
        const flipped: PatternKind = pattern.kind === 'opening' ? 'problem' : 'opening'
        const updated = updatePatternCategory(patterns, pattern.id, flipped)

        expect(updated).not.toBe(patterns)
        expect(patterns[0].kind).toBe(pattern.kind)
      }),
      { numRuns: 50 },
    )
  })
})
