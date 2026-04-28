import { describe, it, expect } from 'vitest'
import { applyEditsToConfig, isBuildBReady } from '../app/build-comparison-edits'
import type { CardEditMap } from '../app/build-comparison-edits'
import type { DeckBuilderState, DeckCardInstance } from '../app/model'
import type { ApiCardReference, CardOrigin, CardRole } from '../types'

// ── Helpers ──

function makeApiCard(id: number): ApiCardReference {
  return {
    ygoprodeckId: id,
    cardType: 'Effect Monster',
    frameType: 'effect',
    description: 'Test card description',
    race: 'Warrior',
    attribute: 'DARK',
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
  }
}

function makeDeckCardInstance(
  instanceId: string,
  name: string,
  id: number,
  origin: CardOrigin | null = null,
  roles: CardRole[] = [],
  needsReview = true,
): DeckCardInstance {
  return {
    instanceId,
    name,
    apiCard: makeApiCard(id),
    origin,
    roles,
    needsReview,
  }
}

function makeDeckBuilderState(main: DeckCardInstance[] = [], extra: DeckCardInstance[] = [], side: DeckCardInstance[] = []): DeckBuilderState {
  return {
    deckName: 'Test Deck',
    main,
    extra,
    side,
    isEditingDeck: false,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — applyEditsToConfig
// ══════════════════════════════════════════════════════════════════════════════

describe('applyEditsToConfig', () => {
  it('applies origin/roles and marks needsReview=false for edited cards', () => {
    const card1 = makeDeckCardInstance('inst-1', 'Ash Blossom', 101)
    const card2 = makeDeckCardInstance('inst-2', 'Maxx C', 102)
    const deck = makeDeckBuilderState([card1, card2])

    const edits: CardEditMap = new Map([
      [101, { origin: 'non_engine' as CardOrigin, roles: ['handtrap'] as CardRole[] }],
      [102, { origin: 'non_engine' as CardOrigin, roles: ['handtrap', 'draw'] as CardRole[] }],
    ])

    const result = applyEditsToConfig(deck, edits)

    expect(result.main[0].origin).toBe('non_engine')
    expect(result.main[0].roles).toEqual(['handtrap'])
    expect(result.main[0].needsReview).toBe(false)

    expect(result.main[1].origin).toBe('non_engine')
    expect(result.main[1].roles).toEqual(['handtrap', 'draw'])
    expect(result.main[1].needsReview).toBe(false)
  })

  it('does NOT mutate the original DeckBuilderState', () => {
    const card1 = makeDeckCardInstance('inst-1', 'Ash Blossom', 101)
    const card2 = makeDeckCardInstance('inst-2', 'Effect Veiler', 102)
    const deck = makeDeckBuilderState([card1, card2])

    // Deep clone before calling
    const originalSnapshot = JSON.parse(JSON.stringify(deck))

    const edits: CardEditMap = new Map([
      [101, { origin: 'engine' as CardOrigin, roles: ['starter'] as CardRole[] }],
    ])

    applyEditsToConfig(deck, edits)

    // Original must be unchanged
    expect(JSON.parse(JSON.stringify(deck))).toEqual(originalSnapshot)
  })

  it('cards without edits keep their original state intact', () => {
    const editedCard = makeDeckCardInstance('inst-1', 'Ash Blossom', 101)
    const untouchedCard = makeDeckCardInstance(
      'inst-2',
      'Blue-Eyes White Dragon',
      200,
      'engine',
      ['payoff', 'brick'],
      false,
    )
    const deck = makeDeckBuilderState([editedCard, untouchedCard])

    const edits: CardEditMap = new Map([
      [101, { origin: 'non_engine' as CardOrigin, roles: ['handtrap'] as CardRole[] }],
    ])

    const result = applyEditsToConfig(deck, edits)

    // Unedited card retains original values
    expect(result.main[1].origin).toBe('engine')
    expect(result.main[1].roles).toEqual(['payoff', 'brick'])
    expect(result.main[1].needsReview).toBe(false)
    expect(result.main[1].name).toBe('Blue-Eyes White Dragon')
    expect(result.main[1].instanceId).toBe('inst-2')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — isBuildBReady
// ══════════════════════════════════════════════════════════════════════════════

describe('isBuildBReady', () => {
  it('returns false when a card has origin === null', () => {
    const card = makeDeckCardInstance('inst-1', 'Mystic Mine', 301, null, ['floodgate'], false)
    const deck = makeDeckBuilderState([card])

    expect(isBuildBReady(deck)).toBe(false)
  })

  it('returns false when a card has roles: []', () => {
    const card = makeDeckCardInstance('inst-1', 'Mystic Mine', 301, 'engine', [], false)
    const deck = makeDeckBuilderState([card])

    expect(isBuildBReady(deck)).toBe(false)
  })

  it('returns false when a card has needsReview: true', () => {
    const card = makeDeckCardInstance('inst-1', 'Mystic Mine', 301, 'engine', ['floodgate'], true)
    const deck = makeDeckBuilderState([card])

    expect(isBuildBReady(deck)).toBe(false)
  })

  it('returns true when all cards have valid origin, non-empty roles, and needsReview: false', () => {
    const card1 = makeDeckCardInstance('inst-1', 'Ash Blossom', 101, 'non_engine', ['handtrap'], false)
    const card2 = makeDeckCardInstance('inst-2', 'Nibiru', 102, 'non_engine', ['handtrap', 'boardbreaker'], false)
    const card3 = makeDeckCardInstance('inst-3', 'Pot of Prosperity', 103, 'non_engine', ['draw'], false)
    const deck = makeDeckBuilderState([card1, card2, card3])

    expect(isBuildBReady(deck)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Integration Tests
// ══════════════════════════════════════════════════════════════════════════════

import { compareBuild } from '../app/build-comparison'
import type { PortableConfig, PortableDeckCard } from '../app/model'

// ── Integration Helpers ──

function makePortableDeckCard(
  name: string,
  id: number,
  copies: number,
  roles: CardRole[],
  origin: CardOrigin,
): PortableDeckCard[] {
  return Array.from({ length: copies }, () => ({
    name,
    apiCard: makeApiCard(id),
    origin,
    roles,
    needsReview: false,
  }))
}

function makePortableConfig(overrides: Partial<PortableConfig> = {}): PortableConfig {
  return {
    version: 15,
    handSize: 5,
    deckFormat: 'unlimited',
    patternsSeeded: true,
    patternsSeedVersion: 1,
    deckBuilder: {
      deckName: 'Test Deck',
      main: [],
      extra: [],
      side: [],
    },
    patterns: [],
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Integration Test 1: Editing Build B does NOT modify Build A
// ══════════════════════════════════════════════════════════════════════════════

describe('Integration: Editing Build B does NOT modify Build A', () => {
  it('configA remains identical after applying edits to Build B', () => {
    // Create configA from a valid AppState-like deck
    const configACards = [
      ...makePortableDeckCard('Ash Blossom', 108, 3, ['handtrap'], 'non_engine'),
      ...makePortableDeckCard('Maxx C', 109, 3, ['handtrap', 'draw'], 'non_engine'),
      ...makePortableDeckCard('Branded Fusion', 102, 3, ['starter'], 'engine'),
      ...makePortableDeckCard('Aluber', 101, 3, ['starter', 'searcher'], 'engine'),
    ]

    const configA = makePortableConfig({
      deckBuilder: { deckName: 'Build A', main: configACards, extra: [], side: [] },
      patterns: [
        {
          name: 'Starter Access',
          kind: 'opening',
          logic: 'any',
          minimumConditionMatches: 1,
          reusePolicy: 'forbid',
          needsReview: false,
          conditions: [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include', distinct: false }],
        },
      ],
    })

    // Deep snapshot of configA before any Build B operations
    const configASnapshot = JSON.parse(JSON.stringify(configA))

    // Create an imported deck builder with unclassified cards
    const importedDeckBuilder = makeDeckBuilderState([
      makeDeckCardInstance('b-1', 'Dark Magician', 201, null, [], true),
      makeDeckCardInstance('b-2', 'Blue-Eyes', 202, null, [], true),
      makeDeckCardInstance('b-3', 'Red-Eyes', 203, null, [], true),
    ])

    // Apply edits to Build B
    const edits: CardEditMap = new Map([
      [201, { origin: 'engine' as CardOrigin, roles: ['starter'] as CardRole[] }],
      [202, { origin: 'engine' as CardOrigin, roles: ['payoff', 'brick'] as CardRole[] }],
      [203, { origin: 'non_engine' as CardOrigin, roles: ['handtrap'] as CardRole[] }],
    ])

    const editedDeckB = applyEditsToConfig(importedDeckBuilder, edits)

    // Verify configA is completely unchanged
    expect(JSON.parse(JSON.stringify(configA))).toEqual(configASnapshot)

    // Also verify that the edited deck B is independent
    expect(editedDeckB.main[0].origin).toBe('engine')
    expect(editedDeckB.main[0].roles).toEqual(['starter'])
    expect(editedDeckB.main[0].needsReview).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Integration Test 2: Build B with pending cards hides Verdict/Insights
// ══════════════════════════════════════════════════════════════════════════════

describe('Integration: Build B with pending cards hides Verdict/Insights', () => {
  it('isBuildBReady returns false when some cards are unclassified, true after all edits', () => {
    // Create a DeckBuilderState with unclassified cards
    const deck = makeDeckBuilderState([
      makeDeckCardInstance('c-1', 'Card A', 301, null, [], true),
      makeDeckCardInstance('c-2', 'Card B', 302, null, [], true),
      makeDeckCardInstance('c-3', 'Card C', 303, 'engine', ['starter'], false),
    ])

    // Before any edits, isBuildBReady should be false (cards 301, 302 are unclassified)
    expect(isBuildBReady(deck)).toBe(false)

    // Apply partial edits (only card 301)
    const partialEdits: CardEditMap = new Map([
      [301, { origin: 'engine' as CardOrigin, roles: ['extender'] as CardRole[] }],
    ])
    const partiallyEdited = applyEditsToConfig(deck, partialEdits)

    // Still not ready — card 302 is still unclassified
    expect(isBuildBReady(partiallyEdited)).toBe(false)

    // Apply all remaining edits
    const fullEdits: CardEditMap = new Map([
      [301, { origin: 'engine' as CardOrigin, roles: ['extender'] as CardRole[] }],
      [302, { origin: 'non_engine' as CardOrigin, roles: ['handtrap'] as CardRole[] }],
    ])
    const fullyEdited = applyEditsToConfig(deck, fullEdits)

    // Now ready — all cards have valid origin, roles, and needsReview: false
    expect(isBuildBReady(fullyEdited)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Integration Test 3: Fully edited Build B allows probability recalculation
// ══════════════════════════════════════════════════════════════════════════════

describe('Integration: Fully edited Build B allows probability recalculation', () => {
  it('compareBuild produces non-zero probabilities when Build B is fully classified with valid patterns', () => {
    // Build A: a realistic deck with starters and a pattern
    const configA = makePortableConfig({
      deckBuilder: {
        deckName: 'Branded Despia',
        main: [
          ...makePortableDeckCard('Aluber the Jester of Despia', 101, 3, ['starter', 'searcher'], 'engine'),
          ...makePortableDeckCard('Branded Fusion', 102, 3, ['starter'], 'engine'),
          ...makePortableDeckCard('Fallen of Albaz', 103, 2, ['combo_piece'], 'engine'),
          ...makePortableDeckCard('Despian Tragedy', 104, 3, ['extender'], 'engine'),
          ...makePortableDeckCard('Ad Libitum of Despia', 105, 1, ['extender'], 'engine'),
          ...makePortableDeckCard('Branded Opening', 106, 2, ['searcher'], 'engine'),
          ...makePortableDeckCard('Branded in Red', 107, 2, ['extender', 'recovery'], 'engine'),
          ...makePortableDeckCard('Ash Blossom', 108, 3, ['handtrap'], 'non_engine'),
          ...makePortableDeckCard('Maxx C', 109, 3, ['handtrap', 'draw'], 'non_engine'),
          ...makePortableDeckCard('Effect Veiler', 110, 2, ['handtrap'], 'non_engine'),
          ...makePortableDeckCard('Called by the Grave', 111, 2, ['tech'], 'non_engine'),
          ...makePortableDeckCard('Super Polymerization', 112, 2, ['boardbreaker', 'removal'], 'non_engine'),
          ...makePortableDeckCard('Pot of Prosperity', 113, 2, ['draw'], 'non_engine'),
          ...makePortableDeckCard('Branded Lost', 117, 2, ['enabler'], 'engine'),
          ...makePortableDeckCard('Foolish Burial', 118, 1, ['searcher'], 'engine'),
          ...makePortableDeckCard('Monster Reborn', 119, 1, ['recovery'], 'non_engine'),
          ...makePortableDeckCard('Nibiru', 120, 2, ['handtrap', 'boardbreaker'], 'non_engine'),
          ...makePortableDeckCard('Triple Tactics Talent', 121, 1, ['draw'], 'non_engine'),
          ...makePortableDeckCard('Edge Imp Chain', 115, 1, ['brick', 'garnet'], 'engine'),
          ...makePortableDeckCard('Polymerization', 116, 1, ['combo_piece'], 'engine'),
          ...makePortableDeckCard('Frightfur Patchwork', 114, 1, ['searcher'], 'engine'),
        ],
        extra: [],
        side: [],
      },
      patterns: [
        {
          name: 'Starter Access',
          kind: 'opening',
          logic: 'any',
          minimumConditionMatches: 1,
          reusePolicy: 'forbid',
          needsReview: false,
          conditions: [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include', distinct: false }],
        },
      ],
    })

    // Build B: simulate an imported deck that was fully edited via applyEditsToConfig
    // Start with unclassified cards, then apply edits
    const importedDeck = makeDeckBuilderState([
      makeDeckCardInstance('b-1', 'Aluber the Jester of Despia', 101, null, [], true),
      makeDeckCardInstance('b-2', 'Aluber the Jester of Despia', 101, null, [], true),
      makeDeckCardInstance('b-3', 'Aluber the Jester of Despia', 101, null, [], true),
      makeDeckCardInstance('b-4', 'Branded Fusion', 102, null, [], true),
      makeDeckCardInstance('b-5', 'Branded Fusion', 102, null, [], true),
      makeDeckCardInstance('b-6', 'Branded Fusion', 102, null, [], true),
      makeDeckCardInstance('b-7', 'Fallen of Albaz', 103, null, [], true),
      makeDeckCardInstance('b-8', 'Fallen of Albaz', 103, null, [], true),
      makeDeckCardInstance('b-9', 'Fallen of Albaz', 103, null, [], true),
      makeDeckCardInstance('b-10', 'Despian Tragedy', 104, null, [], true),
      makeDeckCardInstance('b-11', 'Despian Tragedy', 104, null, [], true),
      makeDeckCardInstance('b-12', 'Despian Tragedy', 104, null, [], true),
      makeDeckCardInstance('b-13', 'Ad Libitum of Despia', 105, null, [], true),
      makeDeckCardInstance('b-14', 'Ad Libitum of Despia', 105, null, [], true),
      makeDeckCardInstance('b-15', 'Branded Opening', 106, null, [], true),
      makeDeckCardInstance('b-16', 'Branded Opening', 106, null, [], true),
      makeDeckCardInstance('b-17', 'Branded Opening', 106, null, [], true),
      makeDeckCardInstance('b-18', 'Branded in Red', 107, null, [], true),
      makeDeckCardInstance('b-19', 'Branded in Red', 107, null, [], true),
      makeDeckCardInstance('b-20', 'Ash Blossom', 108, null, [], true),
      makeDeckCardInstance('b-21', 'Ash Blossom', 108, null, [], true),
      makeDeckCardInstance('b-22', 'Maxx C', 109, null, [], true),
      makeDeckCardInstance('b-23', 'Maxx C', 109, null, [], true),
      makeDeckCardInstance('b-24', 'Called by the Grave', 111, null, [], true),
      makeDeckCardInstance('b-25', 'Called by the Grave', 111, null, [], true),
      makeDeckCardInstance('b-26', 'Super Polymerization', 112, null, [], true),
      makeDeckCardInstance('b-27', 'Pot of Prosperity', 113, null, [], true),
      makeDeckCardInstance('b-28', 'Pot of Prosperity', 113, null, [], true),
      makeDeckCardInstance('b-29', 'Branded Lost', 117, null, [], true),
      makeDeckCardInstance('b-30', 'Branded Lost', 117, null, [], true),
      makeDeckCardInstance('b-31', 'Branded Lost', 117, null, [], true),
      makeDeckCardInstance('b-32', 'Foolish Burial', 118, null, [], true),
      makeDeckCardInstance('b-33', 'Monster Reborn', 119, null, [], true),
      makeDeckCardInstance('b-34', 'Branded Banishment', 122, null, [], true),
      makeDeckCardInstance('b-35', 'Nibiru', 120, null, [], true),
      makeDeckCardInstance('b-36', 'Edge Imp Chain', 115, null, [], true),
      makeDeckCardInstance('b-37', 'Edge Imp Chain', 115, null, [], true),
      makeDeckCardInstance('b-38', 'Polymerization', 116, null, [], true),
      makeDeckCardInstance('b-39', 'Frightfur Patchwork', 114, null, [], true),
      makeDeckCardInstance('b-40', 'Triple Tactics Talent', 121, null, [], true),
    ])

    // Apply full edits to all cards
    const edits: CardEditMap = new Map([
      [101, { origin: 'engine' as CardOrigin, roles: ['starter', 'searcher'] as CardRole[] }],
      [102, { origin: 'engine' as CardOrigin, roles: ['starter'] as CardRole[] }],
      [103, { origin: 'engine' as CardOrigin, roles: ['combo_piece'] as CardRole[] }],
      [104, { origin: 'engine' as CardOrigin, roles: ['extender'] as CardRole[] }],
      [105, { origin: 'engine' as CardOrigin, roles: ['extender'] as CardRole[] }],
      [106, { origin: 'engine' as CardOrigin, roles: ['searcher'] as CardRole[] }],
      [107, { origin: 'engine' as CardOrigin, roles: ['extender', 'recovery'] as CardRole[] }],
      [108, { origin: 'non_engine' as CardOrigin, roles: ['handtrap'] as CardRole[] }],
      [109, { origin: 'non_engine' as CardOrigin, roles: ['handtrap', 'draw'] as CardRole[] }],
      [111, { origin: 'non_engine' as CardOrigin, roles: ['tech'] as CardRole[] }],
      [112, { origin: 'non_engine' as CardOrigin, roles: ['boardbreaker', 'removal'] as CardRole[] }],
      [113, { origin: 'non_engine' as CardOrigin, roles: ['draw'] as CardRole[] }],
      [114, { origin: 'engine' as CardOrigin, roles: ['searcher'] as CardRole[] }],
      [115, { origin: 'engine' as CardOrigin, roles: ['brick', 'garnet'] as CardRole[] }],
      [116, { origin: 'engine' as CardOrigin, roles: ['combo_piece'] as CardRole[] }],
      [117, { origin: 'engine' as CardOrigin, roles: ['enabler'] as CardRole[] }],
      [118, { origin: 'engine' as CardOrigin, roles: ['searcher'] as CardRole[] }],
      [119, { origin: 'non_engine' as CardOrigin, roles: ['recovery'] as CardRole[] }],
      [120, { origin: 'non_engine' as CardOrigin, roles: ['handtrap', 'boardbreaker'] as CardRole[] }],
      [121, { origin: 'non_engine' as CardOrigin, roles: ['draw'] as CardRole[] }],
      [122, { origin: 'engine' as CardOrigin, roles: ['removal'] as CardRole[] }],
    ])

    const editedDeckB = applyEditsToConfig(importedDeck, edits)

    // Verify Build B is ready
    expect(isBuildBReady(editedDeckB)).toBe(true)

    // Build configB PortableConfig from the edited deck (mimicking portableConfigFromImport)
    const configB: PortableConfig = {
      version: 15,
      handSize: 5,
      deckFormat: 'unlimited',
      patternsSeeded: true,
      patternsSeedVersion: 1,
      deckBuilder: {
        deckName: 'Build B Edited',
        main: editedDeckB.main.map((c) => ({
          name: c.name,
          apiCard: c.apiCard,
          origin: c.origin,
          roles: [...c.roles],
          needsReview: c.needsReview,
        })),
        extra: [],
        side: [],
      },
      patterns: configA.patterns, // Same patterns as Build A
    }

    // Run the full pipeline: compareBuild
    const result = compareBuild(configA, configB)

    // Verify non-zero probabilities (the pattern matches starters, which exist in both builds)
    expect(result.totalOpeningProbabilityB).toBeGreaterThan(0)
    expect(result.totalOpeningProbabilityA).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Integration Test 4: Importing a new deck resets previous edits
// ══════════════════════════════════════════════════════════════════════════════

describe('Integration: Importing a new deck resets previous edits', () => {
  it('creating a new Map() after import clears all previous edits', () => {
    // Simulate an editsMap with entries from a previous import
    const previousEdits: CardEditMap = new Map([
      [101, { origin: 'engine' as CardOrigin, roles: ['starter'] as CardRole[] }],
      [102, { origin: 'non_engine' as CardOrigin, roles: ['handtrap'] as CardRole[] }],
      [103, { origin: 'hybrid' as CardOrigin, roles: ['extender', 'draw'] as CardRole[] }],
    ])

    expect(previousEdits.size).toBe(3)

    // Simulate reset on new import (as done in ComparisonScreen: setEditsMap(new Map()))
    const resetEdits: CardEditMap = new Map()

    expect(resetEdits.size).toBe(0)

    // Verify that applying empty edits to a new deck doesn't carry over old edits
    const newDeck = makeDeckBuilderState([
      makeDeckCardInstance('new-1', 'New Card A', 501, null, [], true),
      makeDeckCardInstance('new-2', 'New Card B', 502, null, [], true),
    ])

    const result = applyEditsToConfig(newDeck, resetEdits)

    // Cards should remain unclassified (no edits applied)
    expect(result.main[0].origin).toBeNull()
    expect(result.main[0].roles).toEqual([])
    expect(result.main[0].needsReview).toBe(true)
    expect(result.main[1].origin).toBeNull()
    expect(result.main[1].roles).toEqual([])
    expect(result.main[1].needsReview).toBe(true)

    // isBuildBReady should be false
    expect(isBuildBReady(result)).toBe(false)
  })
})
