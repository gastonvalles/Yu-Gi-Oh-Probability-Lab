import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
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
/*  Arbitraries for property-based tests                              */
/* ------------------------------------------------------------------ */

const arbCardOrigin: fc.Arbitrary<CardOrigin> = fc.constantFrom('engine', 'non_engine')

const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'disruption', 'boardbreaker', 'searcher', 'draw',
  'recovery', 'enabler', 'payoff', 'brick', 'garnet',
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
  // Sólo sobreviven al codec las URLs del CDN de YGOPRODeck (el resto se descarta a propósito).
  imageUrl: fc.option(fc.integer({ min: 1, max: 99999999 }).map((id) => `https://images.ygoprodeck.com/images/cards/${id}.jpg`), { nil: null }),
  imageUrlSmall: fc.option(fc.integer({ min: 1, max: 99999999 }).map((id) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`), { nil: null }),
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
  turnContext: fc.constant('either' as const),
  logic: fc.constantFrom('all' as const, 'any' as const),
  minimumConditionMatches: fc.integer({ min: 1, max: 5 }),
  reusePolicy: fc.constantFrom('allow' as const, 'forbid' as const),
  needsReview: fc.boolean(),
  conditions: fc.array(arbPatternCondition, { minLength: 0, maxLength: 3 }),
})

const arbAppState: fc.Arbitrary<AppState> = fc.record({
  // El codec acota la mano a 1..10.
  handSize: fc.integer({ min: 1, max: 10 }),
  deckFormat: arbDeckFormat,
  patternsSeeded: fc.boolean(),
  patternsSeedVersion: fc.integer({ min: 0, max: 10 }),
  patterns: fc.array(arbHandPattern, { minLength: 0, maxLength: 3 }),
  disabledGenericRuleIds: fc.subarray(['starter_extender_opening', 'no_answer_second_problem']),
  systemRuleNames: fc.constant({}),
  deckBuilder: fc.record({
    deckName: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    main: fc.array(arbDeckCardInstance, { minLength: 0, maxLength: 5 }),
    extra: fc.array(arbDeckCardInstance, { minLength: 0, maxLength: 3 }),
    side: fc.array(arbDeckCardInstance, { minLength: 0, maxLength: 3 }),
    isEditingDeck: fc.boolean(),
  }),
})

/** El estado de la app sobrevive a pasar por la configuración portable (exportar e importar). */
describe('Codec: toPortableConfig → fromPortableConfig', () => {
  it('conserva el formato, la mano, el nombre del deck, las reglas y las cartas de cualquier estado válido', () => {
    // Para cualquier AppState válido, pasar por toPortableConfig y volver con fromPortableConfig
    // conserva handSize, deckFormat, el nombre del deck, las reglas y las cartas.
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
