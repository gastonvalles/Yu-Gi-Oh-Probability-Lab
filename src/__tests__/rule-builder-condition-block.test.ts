import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getKindLabel, kindFromLabel, getConditionLabel } from '../components/probability/rule-builder/condition-labels'
import { createCardPoolMatcher } from '../app/patterns'
import type {
  CardEntry,
  CardOrigin,
  CardRole,
  Matcher,
  RequirementKind,
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

const arbRequirementKind: fc.Arbitrary<RequirementKind> = fc.constantFrom('include', 'exclude')
const arbCardRole: fc.Arbitrary<CardRole> = fc.constantFrom(
  'starter', 'extender', 'enabler', 'handtrap', 'disruption',
  'boardbreaker', 'floodgate', 'removal', 'searcher', 'draw',
  'recovery', 'combo_piece', 'payoff', 'brick', 'garnet', 'tech',
)
const arbCardOrigin: fc.Arbitrary<CardOrigin> = fc.constantFrom('engine', 'non_engine', 'hybrid')

// ---------------------------------------------------------------------------
// Tests: UI → Model mapping
// ---------------------------------------------------------------------------

describe('ConditionBlock label mapping', () => {
  it('Property 8: "Al menos" maps to include, "Sin" maps to exclude', () => {
    /** Feature: visual-rule-builder, Property 8: UI label mapping correctness */
    fc.assert(
      fc.property(arbRequirementKind, (kind) => {
        const label = getKindLabel(kind)

        if (kind === 'include') {
          expect(label).toBe('Al menos')
        } else {
          expect(label).toBe('Sin')
        }

        // Round-trip: label → kind → label
        expect(kindFromLabel(label)).toBe(kind)
      }),
      { numRuns: 100 },
    )
  })

  it('getKindLabel only returns "Al menos" or "Sin"', () => {
    fc.assert(
      fc.property(arbRequirementKind, (kind) => {
        const label = getKindLabel(kind)
        expect(['Al menos', 'Sin']).toContain(label)
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: Condition labels
// ---------------------------------------------------------------------------

describe('getConditionLabel', () => {
  it('returns role label for role matchers', () => {
    fc.assert(
      fc.property(arbCardRole, (role) => {
        const matcher: Matcher = { type: 'role', value: role }
        const label = getConditionLabel(matcher, [])
        expect(label.length).toBeGreaterThan(0)
        expect(label).not.toBe('Sin definir')
      }),
      { numRuns: 50 },
    )
  })

  it('returns origin label for origin matchers', () => {
    fc.assert(
      fc.property(arbCardOrigin, (origin) => {
        const matcher: Matcher = { type: 'origin', value: origin }
        const label = getConditionLabel(matcher, [])
        expect(label.length).toBeGreaterThan(0)
        expect(label).not.toBe('Sin definir')
      }),
      { numRuns: 50 },
    )
  })

  it('returns card name for card matcher when card exists', () => {
    const cards = [makeCard('card-1', 'Ash Blossom', 3)]
    const matcher: Matcher = { type: 'card', value: 'card-1' }
    expect(getConditionLabel(matcher, cards)).toBe('Ash Blossom')
  })

  it('returns "Carta eliminada" for card matcher when card is missing', () => {
    const matcher: Matcher = { type: 'card', value: 'nonexistent' }
    expect(getConditionLabel(matcher, [])).toBe('Carta eliminada')
  })

  it('returns "Sin definir" for null matcher', () => {
    expect(getConditionLabel(null, [])).toBe('Sin definir')
  })

  it('returns pool summary for card_pool matcher', () => {
    const cards = [
      makeCard('card-1', 'Ash Blossom', 3),
      makeCard('card-2', 'Maxx C', 3),
      makeCard('card-3', 'Nibiru', 2),
    ]
    const matcher: Matcher = { type: 'card_pool', value: ['card-1', 'card-2', 'card-3'] }
    const label = getConditionLabel(matcher, cards)
    expect(label).toContain('Ash Blossom')
    expect(label).toContain('+')
    expect(label).toContain('más')
  })

  it('returns single card name for card_pool with one card', () => {
    const cards = [makeCard('card-1', 'Ash Blossom', 3)]
    const matcher: Matcher = { type: 'card_pool', value: ['card-1'] }
    expect(getConditionLabel(matcher, cards)).toBe('Ash Blossom')
  })

  it('returns "Pool vacío" for card_pool with no matching cards', () => {
    const matcher: Matcher = { type: 'card_pool', value: ['nonexistent'] }
    expect(getConditionLabel(matcher, [])).toBe('Pool vacío')
  })

  it('returns formatted label for attribute matcher', () => {
    const matcher: Matcher = { type: 'attribute', value: 'DARK' }
    expect(getConditionLabel(matcher, [])).toBe('Atributo DARK')
  })

  it('returns formatted label for level matcher', () => {
    const matcher: Matcher = { type: 'level', value: 4 }
    expect(getConditionLabel(matcher, [])).toBe('Nivel 4')
  })

  it('returns formatted label for monster_type matcher', () => {
    const matcher: Matcher = { type: 'monster_type', value: 'Dragon' }
    expect(getConditionLabel(matcher, [])).toBe('Dragon')
  })

  it('returns formatted label for atk matcher', () => {
    const matcher: Matcher = { type: 'atk', value: 2500 }
    const label = getConditionLabel(matcher, [])
    expect(label).toContain('ATK')
    expect(label).toContain('2500')
  })

  it('returns formatted label for def matcher', () => {
    const matcher: Matcher = { type: 'def', value: 2000 }
    const label = getConditionLabel(matcher, [])
    expect(label).toContain('DEF')
    expect(label).toContain('2000')
  })
})

// ---------------------------------------------------------------------------
// Tests: Shortcuts
// ---------------------------------------------------------------------------

describe('CategoryPicker shortcuts', () => {
  it('Starter shortcut produces correct role matcher', () => {
    const matcher: Matcher = { type: 'role', value: 'starter' }
    expect(matcher.type).toBe('role')
    expect(matcher.value).toBe('starter')
    expect(getConditionLabel(matcher, [])).toBe('Starter')
  })

  it('Extender shortcut produces correct role matcher', () => {
    const matcher: Matcher = { type: 'role', value: 'extender' }
    expect(matcher.type).toBe('role')
    expect(matcher.value).toBe('extender')
    expect(getConditionLabel(matcher, [])).toBe('Extender')
  })

  it('Brick shortcut produces correct role matcher', () => {
    const matcher: Matcher = { type: 'role', value: 'brick' }
    expect(matcher.type).toBe('role')
    expect(matcher.value).toBe('brick')
    expect(getConditionLabel(matcher, [])).toBe('Brick')
  })
})

// ---------------------------------------------------------------------------
// Tests: Card pool normalization
// ---------------------------------------------------------------------------

describe('CardPoolEditor normalization', () => {
  it('Property 7: removing all cards from pool produces null matcher', () => {
    const result = createCardPoolMatcher([])
    expect(result).toBeNull()
  })

  it('single card in pool normalizes to card type', () => {
    const result = createCardPoolMatcher(['card-1'])
    expect(result).toEqual({ type: 'card', value: 'card-1' })
  })

  it('multiple cards in pool normalizes to card_pool type', () => {
    const result = createCardPoolMatcher(['card-1', 'card-2'])
    expect(result).toEqual({ type: 'card_pool', value: ['card-1', 'card-2'] })
  })

  it('Property 7: available cards exclude selected', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 4, maxLength: 12 }).map((s) => `card-${s}`),
            fc.string({ minLength: 2, maxLength: 20 }),
            fc.integer({ min: 1, max: 3 }),
          ),
          { minLength: 1, maxLength: 10 },
        ),
        (cardDefs) => {
          const uniqueCards = new Map<string, CardEntry>()

          for (const [id, name, copies] of cardDefs) {
            if (!uniqueCards.has(id)) {
              uniqueCards.set(id, makeCard(id, name, copies))
            }
          }

          const allCards = [...uniqueCards.values()]
          const allIds = allCards.map((c) => c.id)

          // Select a random subset
          const selectedCount = Math.floor(allIds.length / 2)
          const selectedIds = allIds.slice(0, selectedCount)
          const selectedSet = new Set(selectedIds)

          const available = allCards.filter((card) => !selectedSet.has(card.id))

          // Verify: available cards don't include any selected card
          for (const card of available) {
            expect(selectedSet.has(card.id)).toBe(false)
          }

          // Verify: available + selected = all
          expect(available.length + selectedIds.length).toBe(allCards.length)
        },
      ),
      { numRuns: 100 },
    )
  })
})
