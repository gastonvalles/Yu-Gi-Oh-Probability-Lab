import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { parseMode } from '../app/utils'

/**
 * Bug Condition Exploration Test
 *
 * **Validates: Requirements 1.5, 2.5**
 *
 * Property 1: Bug Condition — Dead Modes Accepted by parseMode and CalculatorMode Type
 *
 * The parseMode function currently accepts 'manual' and 'gambling' as valid CalculatorMode
 * values and returns them. The expected behavior is that parseMode should return 'deck'
 * for these dead mode inputs (backward compatibility fallback).
 *
 * This test is EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 */
describe('Bug Condition Exploration: Dead Modes Accepted by parseMode', () => {
  it('Property 1: for all dead mode inputs, parseMode should return "deck" (not the dead mode value)', () => {
    const deadModes = fc.constantFrom('manual', 'gambling')

    fc.assert(
      fc.property(deadModes, (input) => {
        const result = parseMode(input)
        expect(result).toBe('deck')
      }),
      { verbose: 2 }
    )
  })
})

import { toPortableConfig, fromPortableConfig } from '../app/app-state-codec'
import type { AppState } from '../app/model'
import type {
  ApiCardReference,
  HandPattern,
  PatternCondition,
  CardOrigin,
  CardRole,
  DeckFormat,
} from '../types'
import type { DeckCardInstance } from '../app/model'

/* ------------------------------------------------------------------ */
/*  Observation Tests — confirm baseline behavior on UNFIXED code     */
/* ------------------------------------------------------------------ */

describe('Observation: parseMode baseline behavior on unfixed code', () => {
  it('parseMode("deck") returns "deck"', () => {
    expect(parseMode('deck')).toBe('deck')
  })

  it('parseMode(undefined) returns "deck"', () => {
    expect(parseMode(undefined)).toBe('deck')
  })

  it('parseMode(null) returns "deck"', () => {
    expect(parseMode(null)).toBe('deck')
  })

  it('parseMode(42) returns "deck"', () => {
    expect(parseMode(42)).toBe('deck')
  })

  it('parseMode("anything-else") returns "deck"', () => {
    expect(parseMode('anything-else')).toBe('deck')
  })
})

/* ------------------------------------------------------------------ */
/*  Arbitraries for property-based tests                              */
/* ------------------------------------------------------------------ */

const arbCardOrigin: fc.Arbitrary<CardOrigin> = fc.constantFrom('engine', 'non_engine', 'hybrid')

const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
)

const arbDeckFormat: fc.Arbitrary<DeckFormat> = fc.constantFrom(
  'unlimited', 'tcg', 'ocg', 'goat', 'edison', 'genesys',
)

const arbApiCardReference: fc.Arbitrary<ApiCardReference> = fc.record({
  ygoprodeckId: fc.integer({ min: 1, max: 99999999 }),
  cardType: fc.constantFrom('Effect Monster', 'Spell Card', 'Trap Card', 'Normal Monster'),
  frameType: fc.constantFrom('effect', 'spell', 'trap', 'normal'),
  description: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
  race: fc.option(fc.constantFrom('Warrior', 'Spellcaster', 'Dragon'), { nil: null }),
  attribute: fc.option(fc.constantFrom('DARK', 'LIGHT', 'FIRE', 'WATER', 'EARTH', 'WIND'), { nil: null }),
  level: fc.option(fc.integer({ min: 1, max: 12 }), { nil: null }),
  linkValue: fc.option(fc.integer({ min: 1, max: 6 }), { nil: null }),
  atk: fc.option(fc.integer({ min: 0, max: 5000 }).map(String), { nil: null }),
  def: fc.option(fc.integer({ min: 0, max: 5000 }).map(String), { nil: null }),
  archetype: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  ygoprodeckUrl: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
  imageUrl: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
  imageUrlSmall: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
  banlist: fc.record({
    tcg: fc.option(fc.constantFrom('forbidden' as const, 'limited' as const, 'semi-limited' as const, 'unlimited' as const), { nil: null }),
    ocg: fc.option(fc.constantFrom('forbidden' as const, 'limited' as const, 'semi-limited' as const, 'unlimited' as const), { nil: null }),
    goat: fc.option(fc.constantFrom('forbidden' as const, 'limited' as const, 'semi-limited' as const, 'unlimited' as const), { nil: null }),
  }),
  genesys: fc.record({
    points: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  }),
})

const arbDeckCardInstance: fc.Arbitrary<DeckCardInstance> = fc.record({
  instanceId: fc.string({ minLength: 5, maxLength: 20 }).map((s) => `deck-card-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  apiCard: arbApiCardReference,
  origin: fc.option(arbCardOrigin, { nil: null }),
  roles: fc.array(arbCardRole, { maxLength: 3 }),
  needsReview: fc.boolean(),
})

const arbPatternCondition: fc.Arbitrary<PatternCondition> = fc.record({
  id: fc.string({ minLength: 3, maxLength: 15 }).map((s) => `req-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  matcher: fc.constantFrom(
    { type: 'origin' as const, value: 'engine' as CardOrigin },
    { type: 'role' as const, value: 'starter' as CardRole },
  ),
  quantity: fc.integer({ min: 1, max: 5 }),
  kind: fc.constantFrom('include' as const, 'exclude' as const),
  distinct: fc.boolean(),
})

const arbHandPattern: fc.Arbitrary<HandPattern> = fc.record({
  id: fc.string({ minLength: 3, maxLength: 15 }).map((s) => `pattern-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  kind: fc.constantFrom('opening' as const, 'problem' as const),
  logic: fc.constantFrom('all' as const, 'any' as const),
  minimumConditionMatches: fc.integer({ min: 1, max: 5 }),
  reusePolicy: fc.constantFrom('allow' as const, 'forbid' as const),
  needsReview: fc.boolean(),
  conditions: fc.array(arbPatternCondition, { minLength: 0, maxLength: 3 }),
})

const arbAppState: fc.Arbitrary<AppState> = fc.record({
  handSize: fc.integer({ min: 1, max: 15 }),
  deckFormat: arbDeckFormat,
  patternsSeeded: fc.boolean(),
  patternsSeedVersion: fc.integer({ min: 0, max: 10 }),
  patterns: fc.array(arbHandPattern, { minLength: 0, maxLength: 3 }),
  deckBuilder: fc.record({
    deckName: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    main: fc.array(arbDeckCardInstance, { minLength: 0, maxLength: 5 }),
    extra: fc.array(arbDeckCardInstance, { minLength: 0, maxLength: 3 }),
    side: fc.array(arbDeckCardInstance, { minLength: 0, maxLength: 3 }),
    isEditingDeck: fc.boolean(),
  }),
})

/* ------------------------------------------------------------------ */
/*  Property 2: Preservation — Deck Mode Behavior Unchanged           */
/* ------------------------------------------------------------------ */

/**
 * Preservation Property Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * Property 2: Preservation — Deck Mode Behavior Unchanged
 *
 * For all inputs where the mode is NOT a dead mode ('manual' or 'gambling'),
 * parseMode should return 'deck'. For valid AppState objects with mode: 'deck',
 * the toPortableConfig → fromPortableConfig round-trip should preserve key fields.
 *
 * These tests are EXPECTED TO PASS on unfixed code — they confirm baseline behavior.
 */
describe('Preservation: Deck Mode Behavior Unchanged', () => {
  it('Property 2a: for all non-dead-mode inputs, parseMode returns "deck"', () => {
    /**
     * **Validates: Requirements 3.1, 3.2**
     *
     * For any input that is NOT 'manual' and NOT 'gambling',
     * parseMode should always return 'deck'.
     */
    const nonDeadModeInputs = fc.oneof(
      fc.constant('deck'),
      fc.constant(undefined),
      fc.constant(null),
      fc.integer(),
      fc.boolean(),
      fc.string().filter((s) => s !== 'manual' && s !== 'gambling'),
      fc.constant({}),
      fc.constant([]),
    )

    fc.assert(
      fc.property(nonDeadModeInputs, (input) => {
        const result = parseMode(input)
        expect(result).toBe('deck')
      }),
      { verbose: 2, numRuns: 200 }
    )
  })

  it('Property 2b: toPortableConfig → fromPortableConfig round-trips key fields for deck mode AppState', () => {
    /**
     * **Validates: Requirements 3.2, 3.3, 3.4**
     *
     * For random valid AppState objects with mode: 'deck',
     * serializing via toPortableConfig and deserializing via fromPortableConfig
     * should preserve handSize, deckFormat, deckBuilder.deckName, and patterns.
     */
    fc.assert(
      fc.property(arbAppState, (appState) => {
        const portable = toPortableConfig(appState)
        const restored = fromPortableConfig(portable)

        // handSize preserved
        expect(restored.handSize).toBe(appState.handSize)

        // deckFormat preserved
        expect(restored.deckFormat).toBe(appState.deckFormat)

        // deckBuilder.deckName preserved
        expect(restored.deckBuilder.deckName).toBe(appState.deckBuilder.deckName)

        // patterns count preserved
        expect(restored.patterns.length).toBe(appState.patterns.length)

        // Each pattern name and kind preserved
        for (let i = 0; i < appState.patterns.length; i++) {
          expect(restored.patterns[i].name).toBe(appState.patterns[i].name)
          expect(restored.patterns[i].kind).toBe(appState.patterns[i].kind)
          expect(restored.patterns[i].logic).toBe(appState.patterns[i].logic)
          expect(restored.patterns[i].conditions.length).toBe(appState.patterns[i].conditions.length)
        }

        // Deck card counts preserved
        expect(restored.deckBuilder.main.length).toBe(appState.deckBuilder.main.length)
        expect(restored.deckBuilder.extra.length).toBe(appState.deckBuilder.extra.length)
        expect(restored.deckBuilder.side.length).toBe(appState.deckBuilder.side.length)

        // Deck card names preserved
        for (let i = 0; i < appState.deckBuilder.main.length; i++) {
          expect(restored.deckBuilder.main[i].name).toBe(appState.deckBuilder.main[i].name)
        }
      }),
      { verbose: 2, numRuns: 50 }
    )
  })
})
