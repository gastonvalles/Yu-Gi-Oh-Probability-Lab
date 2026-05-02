import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getKpiDetailCards, type KpiRole } from '../components/comparison/kpi-detail-helpers'
import type { DeckCardInstance } from '../app/model'
import type { CardEditMap } from '../app/build-comparison-edits'
import type { ApiCardReference, CardRole, CardOrigin } from '../types'

// ── Helpers ──

const ALL_ROLES: CardRole[] = [
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
]

const KPI_ROLES: KpiRole[] = ['starter', 'handtrap', 'brick', 'boardbreaker']

function makeApiCard(id: number): ApiCardReference {
  return {
    ygoprodeckId: id,
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
  }
}

function makeDeckCardInstance(
  name: string,
  id: number,
  roles: CardRole[] = ['starter'],
  origin: CardOrigin | null = 'engine',
  needsReview = false,
): DeckCardInstance {
  return {
    instanceId: `${id}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    apiCard: makeApiCard(id),
    origin,
    roles,
    needsReview,
  }
}

// ── Arbitraries ──

const arbKpiRole: fc.Arbitrary<KpiRole> = fc.constantFrom(...KPI_ROLES)
const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(...ALL_ROLES)
const arbCardOrigin: fc.Arbitrary<CardOrigin> = fc.constantFrom('engine', 'non_engine', 'hybrid')

const arbDeckCardInstance: fc.Arbitrary<DeckCardInstance> = fc
  .tuple(
    fc.integer({ min: 1, max: 100 }),
    fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
    fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 }),
    arbCardOrigin,
    fc.boolean(),
  )
  .map(([id, name, roles, origin, needsReview]) =>
    makeDeckCardInstance(name, id, roles as CardRole[], origin, needsReview),
  )

/**
 * Generates a main deck with 1-15 cards where some ygoprodeckIds may repeat
 * (simulating multiple copies of the same card).
 */
const arbMainDeck: fc.Arbitrary<DeckCardInstance[]> = fc
  .uniqueArray(
    fc.tuple(
      fc.integer({ min: 1, max: 50 }),
      fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
      fc.subarray(ALL_ROLES, { minLength: 1, maxLength: 3 }),
      arbCardOrigin,
      fc.boolean(),
      fc.integer({ min: 1, max: 3 }),
    ),
    { minLength: 1, maxLength: 10, selector: (t) => t[0] },
  )
  .map((tuples) => {
    const deck: DeckCardInstance[] = []
    for (const [id, name, roles, origin, needsReview, copies] of tuples) {
      for (let i = 0; i < copies; i++) {
        deck.push(makeDeckCardInstance(name, id, roles as CardRole[], origin, needsReview))
      }
    }
    return deck
  })

/**
 * Generates a main deck paired with an EditsMap that overrides some cards' roles.
 */
const arbMainDeckWithEdits: fc.Arbitrary<{ deck: DeckCardInstance[]; editsMap: CardEditMap }> = fc
  .tuple(
    arbMainDeck,
    fc.float({ min: 0, max: 1, noNaN: true }),
  )
  .chain(([deck, editRatio]) => {
    // Collect unique ygoprodeckIds
    const uniqueIds = [...new Set(deck.map((c) => c.apiCard.ygoprodeckId))]
    const editCount = Math.max(1, Math.floor(uniqueIds.length * editRatio))
    const idsToEdit = uniqueIds.slice(0, editCount)

    return fc
      .tuple(
        ...idsToEdit.map(() =>
          fc.tuple(
            arbCardOrigin,
            fc.subarray(ALL_ROLES, { minLength: 0, maxLength: 3 }),
          ),
        ),
      )
      .map((edits) => {
        const editsMap: CardEditMap = new Map()
        for (let i = 0; i < idsToEdit.length; i++) {
          const [origin, roles] = edits[i]
          editsMap.set(idsToEdit[i], { origin, roles: roles as CardRole[] })
        }
        return { deck, editsMap }
      })
  })

// ══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('getKpiDetailCards — Property Tests', () => {
  describe('Property 1: Filter + Dedupe correctness', () => {
    it('results have unique ygoprodeckIds, only include matching cards, totalCopies is correct, and percentage is totalCopies/mainDeckSize', () => {
      /** Feature: comparison-kpi-detail-modal, Property 1: Filter + Dedupe correctness
       *  **Validates: Requirements 3.2, 3.3, 3.4, 3.6** */
      fc.assert(
        fc.property(arbMainDeck, arbKpiRole, (mainDeck, role) => {
          const result = getKpiDetailCards(mainDeck, role)

          // 1. Unique ygoprodeckIds
          const ids = result.cards.map((c) => c.ygoprodeckId)
          expect(new Set(ids).size).toBe(ids.length)

          // 2. Determine which roles to match
          const matchRoles: CardRole[] = role === 'brick' ? ['brick', 'garnet'] : [role]

          // 3. Every card in result matches the role filter
          for (const card of result.cards) {
            const instances = mainDeck.filter((c) => c.apiCard.ygoprodeckId === card.ygoprodeckId)
            const hasMatchingRole = instances.some((inst) =>
              matchRoles.some((r) => inst.roles.includes(r)),
            )
            expect(hasMatchingRole).toBe(true)
          }

          // 4. No matching card is omitted
          const matchingIds = new Set<number>()
          for (const card of mainDeck) {
            if (matchRoles.some((r) => card.roles.includes(r))) {
              matchingIds.add(card.apiCard.ygoprodeckId)
            }
          }
          for (const id of matchingIds) {
            expect(ids).toContain(id)
          }

          // 5. totalCopies = sum of copies
          const sumCopies = result.cards.reduce((s, c) => s + c.copies, 0)
          expect(result.totalCopies).toBe(sumCopies)

          // 6. totalCopies = count of matching instances in mainDeck
          let matchingInstanceCount = 0
          for (const card of mainDeck) {
            if (matchRoles.some((r) => card.roles.includes(r))) {
              matchingInstanceCount++
            }
          }
          expect(result.totalCopies).toBe(matchingInstanceCount)

          // 7. mainDeckSize = mainDeck.length
          expect(result.mainDeckSize).toBe(mainDeck.length)

          // 8. percentage = totalCopies / mainDeckSize (or 0)
          const expectedPct = mainDeck.length > 0 ? result.totalCopies / mainDeck.length : 0
          expect(result.percentage).toBeCloseTo(expectedPct, 10)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 2: EditsMap overrides roles for Build B', () => {
    it('uses editsMap roles when present, ignoring original roles', () => {
      /** Feature: comparison-kpi-detail-modal, Property 2: EditsMap overrides roles
       *  **Validates: Requirements 5.2** */
      fc.assert(
        fc.property(arbMainDeckWithEdits, arbKpiRole, ({ deck, editsMap }, role) => {
          const result = getKpiDetailCards(deck, role, editsMap)
          const matchRoles: CardRole[] = role === 'brick' ? ['brick', 'garnet'] : [role]

          // For each card in the result, verify it matches using effective roles
          for (const card of result.cards) {
            const edit = editsMap.get(card.ygoprodeckId)
            const instances = deck.filter((c) => c.apiCard.ygoprodeckId === card.ygoprodeckId)

            if (edit) {
              // If edit exists, the edit's roles must match
              const editMatches = matchRoles.some((r) => edit.roles.includes(r))
              expect(editMatches).toBe(true)
            } else {
              // If no edit, original roles must match
              const originalMatches = instances.some((inst) =>
                matchRoles.some((r) => inst.roles.includes(r)),
              )
              expect(originalMatches).toBe(true)
            }
          }

          // Verify cards whose original roles match but edit doesn't → NOT in result
          for (const card of deck) {
            const id = card.apiCard.ygoprodeckId
            const edit = editsMap.get(id)
            if (edit) {
              const editMatches = matchRoles.some((r) => edit.roles.includes(r))
              const inResult = result.cards.some((c) => c.ygoprodeckId === id)
              if (!editMatches) {
                expect(inResult).toBe(false)
              }
            }
          }

          // Verify cards whose original roles don't match but edit does → IN result
          for (const card of deck) {
            const id = card.apiCard.ygoprodeckId
            const edit = editsMap.get(id)
            if (edit) {
              const editMatches = matchRoles.some((r) => edit.roles.includes(r))
              const inResult = result.cards.some((c) => c.ygoprodeckId === id)
              if (editMatches) {
                expect(inResult).toBe(true)
              }
            }
          }
        }),
        { numRuns: 100 },
      )
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Example-Based Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('getKpiDetailCards — Example-Based Tests', () => {
  describe('1.4.1: Bricks incluye cartas con rol brick y garnet', () => {
    it('returns both brick and garnet cards when role is "brick"', () => {
      const mainDeck: DeckCardInstance[] = [
        makeDeckCardInstance('Brick Card A', 1, ['brick'], 'engine'),
        makeDeckCardInstance('Brick Card B', 2, ['brick'], 'engine'),
        makeDeckCardInstance('Garnet Card', 3, ['garnet'], 'engine'),
        makeDeckCardInstance('Starter Card', 4, ['starter'], 'engine'),
      ]

      const result = getKpiDetailCards(mainDeck, 'brick')

      expect(result.cards).toHaveLength(3)
      const ids = result.cards.map((c) => c.ygoprodeckId).sort()
      expect(ids).toEqual([1, 2, 3])
      expect(result.totalCopies).toBe(3)
      expect(result.percentage).toBeCloseTo(3 / 4, 10)
    })
  })

  describe('1.4.2: Build B usa EditsMap', () => {
    it('card with original starter role appears as handtrap when EditsMap changes it', () => {
      const mainDeck: DeckCardInstance[] = [
        makeDeckCardInstance('Flexible Card', 10, ['starter'], 'engine'),
        makeDeckCardInstance('Pure Starter', 20, ['starter'], 'engine'),
      ]

      const editsMap: CardEditMap = new Map([
        [10, { origin: 'non_engine', roles: ['handtrap'] }],
      ])

      // Searching for handtraps: should find card 10 (edited) but not card 20
      const handtrapResult = getKpiDetailCards(mainDeck, 'handtrap', editsMap)
      expect(handtrapResult.cards).toHaveLength(1)
      expect(handtrapResult.cards[0].ygoprodeckId).toBe(10)
      expect(handtrapResult.totalCopies).toBe(1)

      // Searching for starters: should find card 20 (original) but NOT card 10 (edited away)
      const starterResult = getKpiDetailCards(mainDeck, 'starter', editsMap)
      expect(starterResult.cards).toHaveLength(1)
      expect(starterResult.cards[0].ygoprodeckId).toBe(20)
      expect(starterResult.totalCopies).toBe(1)
    })
  })

  describe('1.4.3: EditsMap cambia roles y el resultado refleja los roles editados, no los originales', () => {
    it('edited roles fully replace original roles for filtering', () => {
      const mainDeck: DeckCardInstance[] = [
        // Card 1: original brick, EditsMap changes to starter
        makeDeckCardInstance('Was Brick', 1, ['brick'], 'engine'),
        // Card 2: original starter, no edits
        makeDeckCardInstance('Still Starter', 2, ['starter'], 'engine'),
        // Card 3: no roles originally, EditsMap marks as brick
        makeDeckCardInstance('Now Brick', 3, [], null),
      ]

      const editsMap: CardEditMap = new Map([
        [1, { origin: 'engine', roles: ['starter'] }],   // brick → starter
        [3, { origin: 'engine', roles: ['brick'] }],      // nothing → brick
      ])

      // Searching for bricks: should return ONLY card 3 (edited to brick)
      // Card 1 was originally brick but edit changed it to starter → excluded
      const brickResult = getKpiDetailCards(mainDeck, 'brick', editsMap)
      expect(brickResult.cards).toHaveLength(1)
      expect(brickResult.cards[0].ygoprodeckId).toBe(3)
      expect(brickResult.cards[0].name).toBe('Now Brick')
      expect(brickResult.totalCopies).toBe(1)

      // Searching for starters: should return card 1 (edited to starter) and card 2 (original starter)
      const starterResult = getKpiDetailCards(mainDeck, 'starter', editsMap)
      expect(starterResult.cards).toHaveLength(2)
      const starterIds = starterResult.cards.map((c) => c.ygoprodeckId).sort()
      expect(starterIds).toEqual([1, 2])
    })
  })

  describe('Edge cases', () => {
    it('empty main deck returns empty result with percentage 0', () => {
      const result = getKpiDetailCards([], 'starter')
      expect(result.cards).toEqual([])
      expect(result.totalCopies).toBe(0)
      expect(result.mainDeckSize).toBe(0)
      expect(result.percentage).toBe(0)
    })

    it('no matching cards returns empty cards with correct mainDeckSize', () => {
      const mainDeck: DeckCardInstance[] = [
        makeDeckCardInstance('Only Starter', 1, ['starter'], 'engine'),
      ]
      const result = getKpiDetailCards(mainDeck, 'handtrap')
      expect(result.cards).toEqual([])
      expect(result.totalCopies).toBe(0)
      expect(result.mainDeckSize).toBe(1)
      expect(result.percentage).toBe(0)
    })

    it('deduplicates by ygoprodeckId and sums copies', () => {
      const mainDeck: DeckCardInstance[] = [
        makeDeckCardInstance('Ash Blossom', 100, ['handtrap'], 'non_engine'),
        makeDeckCardInstance('Ash Blossom', 100, ['handtrap'], 'non_engine'),
        makeDeckCardInstance('Ash Blossom', 100, ['handtrap'], 'non_engine'),
      ]
      const result = getKpiDetailCards(mainDeck, 'handtrap')
      expect(result.cards).toHaveLength(1)
      expect(result.cards[0].copies).toBe(3)
      expect(result.totalCopies).toBe(3)
    })

    it('needsReview is true only when card has needsReview and no edit exists', () => {
      const mainDeck: DeckCardInstance[] = [
        makeDeckCardInstance('Review Card', 1, ['starter'], 'engine', true),
        makeDeckCardInstance('Edited Review Card', 2, ['starter'], 'engine', true),
      ]
      const editsMap: CardEditMap = new Map([
        [2, { origin: 'engine', roles: ['starter'] }],
      ])

      const result = getKpiDetailCards(mainDeck, 'starter', editsMap)
      const card1 = result.cards.find((c) => c.ygoprodeckId === 1)
      const card2 = result.cards.find((c) => c.ygoprodeckId === 2)

      expect(card1?.needsReview).toBe(true)  // no edit → keeps needsReview
      expect(card2?.needsReview).toBe(false)  // has edit → needsReview cleared
    })
  })
})
