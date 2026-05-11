import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { toPortableConfig, fromPortableConfig } from '../app/app-state-codec'
import { getPatternDefinitionKey, normalizeTurnContext } from '../app/patterns'
import { createMatcherPattern } from '../app/pattern-factory'
import type { AppState, DeckCardInstance } from '../app/model'
import type { CardRole, HandPattern, TurnContext } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeckCardInstance(instanceId: string, name: string): DeckCardInstance {
  return {
    instanceId,
    name,
    apiCard: {
      ygoprodeckId: 1,
      cardType: 'Effect Monster',
      frameType: 'effect',
      description: null,
      race: null,
      attribute: null,
      level: 4,
      linkValue: null,
      atk: '1800',
      def: '1200',
      archetype: null,
      ygoprodeckUrl: null,
      imageUrl: null,
      imageUrlSmall: null,
      banlist: { tcg: null, ocg: null, goat: null },
      genesys: { points: null },
    },
    origin: 'engine',
    roles: ['starter'] as CardRole[],
    needsReview: false,
  }
}

function buildPattern(name: string, turnContext: TurnContext): HandPattern {
  return createMatcherPattern(
    name,
    'opening',
    [
      {
        matcher: { type: 'role', value: 'starter' },
        quantity: 1,
        kind: 'include',
      },
    ],
    { turnContext },
  )
}

function makeAppState(patterns: Array<{ name: string; turnContext: TurnContext }>): AppState {
  return {
    handSize: 5,
    deckFormat: 'unlimited',
    patternsSeeded: true,
    patternsSeedVersion: 10,
    patterns: patterns.map((p) => buildPattern(p.name, p.turnContext)),
    deckBuilder: {
      deckName: 'Test Deck',
      main: [makeDeckCardInstance('inst-1', 'Starter Card')],
      extra: [],
      side: [],
      isEditingDeck: true,
    },
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbTurnContext: fc.Arbitrary<TurnContext> = fc.constantFrom('first', 'second', 'either')

const arbPatternName = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,12}$/)

const arbPatternEntries = fc.array(
  fc.record({
    name: arbPatternName,
    turnContext: arbTurnContext,
  }),
  { minLength: 1, maxLength: 4 },
)

/** Arbitrary junk values for turnContext including valid ones mixed in. */
const arbJunkTurnContext: fc.Arbitrary<unknown> = fc.oneof(
  arbTurnContext,
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(''),
  fc.constant('FIRST'),
  fc.constant('Second'),
  fc.constant('both'),
  fc.integer(),
  fc.boolean(),
  fc.constant({}),
)

// ---------------------------------------------------------------------------
// Reusable v15 / v16 config shapes (no `turnContext` in v15)
// ---------------------------------------------------------------------------

function makeV15Config(turnContextOnPattern?: unknown) {
  const pattern: Record<string, unknown> = {
    name: 'Legacy Opening',
    kind: 'opening',
    logic: 'all',
    minimumConditionMatches: 1,
    reusePolicy: 'forbid',
    needsReview: false,
    conditions: [
      {
        matcher: { type: 'role', value: 'starter' },
        quantity: 1,
        kind: 'include',
        distinct: false,
      },
    ],
  }

  if (turnContextOnPattern !== undefined) {
    pattern.turnContext = turnContextOnPattern
  }

  return {
    version: 15,
    handSize: 5,
    deckFormat: 'unlimited',
    patternsSeeded: true,
    patternsSeedVersion: 9,
    deckBuilder: {
      deckName: 'Legacy Deck',
      main: [],
      extra: [],
      side: [],
    },
    patterns: [pattern],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Turn-context codec', () => {
  it('9.4.1: round-trip preserves turnContext on every pattern', () => {
    /** Validates: Requirements 7.3 */
    fc.assert(
      fc.property(arbPatternEntries, (entries) => {
        const state = makeAppState(entries)
        const portable = toPortableConfig(state)
        const restored = fromPortableConfig(portable)

        expect(restored.patterns.length).toBe(state.patterns.length)
        for (let i = 0; i < state.patterns.length; i++) {
          expect(restored.patterns[i].turnContext).toBe(state.patterns[i].turnContext)
        }
      }),
      { numRuns: 30 },
    )
  })

  it('9.4.2: v15 config (no turnContext) loads with every pattern having turnContext = either', () => {
    /** Validates: Requirements 7.1, 7.2 */
    const v15Config = makeV15Config()
    const restored = fromPortableConfig(v15Config)
    expect(restored.patterns).toHaveLength(1)
    expect(restored.patterns[0].turnContext).toBe('either')
  })

  it('9.4.3: invalid turnContext values default to either, legal values are preserved', () => {
    /** Validates: Requirements 7.2, 7.4 */
    fc.assert(
      fc.property(arbJunkTurnContext, (junk) => {
        const config = makeV15Config(junk)
        // Flag as v16 so the test represents a "current" config with junk data.
        config.version = 16
        const restored = fromPortableConfig(config)
        const expected = normalizeTurnContext(junk)
        expect(restored.patterns[0].turnContext).toBe(expected)
        expect(['first', 'second', 'either']).toContain(restored.patterns[0].turnContext)
      }),
    )
  })

  it('9.4.4: v15 round-trip yields same getPatternDefinitionKey as the explicit either variant', () => {
    /** Validates: Requirements 7.1, 7.2 (no ghost duplicates after migration) */
    const v15Config = makeV15Config()
    // Build the key the engine would have computed for the legacy pattern
    // (legacy key is derived with turnContext normalized to 'either').
    const legacyKey = getPatternDefinitionKey({
      kind: 'opening',
      turnContext: 'either',
      logic: 'all',
      minimumConditionMatches: 1,
      reusePolicy: 'forbid',
      conditions: [
        {
          matcher: { type: 'role', value: 'starter' },
          quantity: 1,
          kind: 'include',
          distinct: false,
        },
      ],
    })

    const restored = fromPortableConfig(v15Config)
    const modernKey = getPatternDefinitionKey(restored.patterns[0])
    expect(modernKey).toBe(legacyKey)
  })

  it('9.4.5 (example): legacy WorkspaceSnapshot-shaped JSON loads with turnContext = either', () => {
    /** Validates: Requirements 7.1, 7.2 */
    const snapshotPayload = {
      version: 15,
      handSize: 5,
      deckFormat: 'tcg',
      patternsSeeded: true,
      patternsSeedVersion: 9,
      deckBuilder: {
        deckName: 'Snapshot Deck',
        main: [],
        extra: [],
        side: [],
      },
      patterns: [
        {
          name: 'Salida básica',
          kind: 'opening',
          logic: 'all',
          minimumConditionMatches: 1,
          reusePolicy: 'forbid',
          needsReview: false,
          conditions: [
            {
              matcher: { type: 'role', value: 'starter' },
              quantity: 1,
              kind: 'include',
              distinct: false,
            },
          ],
        },
        {
          name: 'Problema brick',
          kind: 'problem',
          logic: 'any',
          minimumConditionMatches: 1,
          reusePolicy: 'forbid',
          needsReview: false,
          conditions: [
            {
              matcher: { type: 'role', value: 'brick' },
              quantity: 2,
              kind: 'include',
              distinct: false,
            },
          ],
        },
      ],
    }

    const restored = fromPortableConfig(snapshotPayload)
    expect(restored.patterns).toHaveLength(2)
    for (const pattern of restored.patterns) {
      expect(pattern.turnContext).toBe('either')
    }
  })
})
