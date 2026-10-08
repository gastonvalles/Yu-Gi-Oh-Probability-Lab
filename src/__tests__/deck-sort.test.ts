import { describe, expect, it } from 'vitest'

import { sortDeckCards } from '../app/deck-sort'
import type { DeckCardInstance } from '../app/model'

function card(id: number, name: string, cardType: string, frameType: string, level: number | null = null): DeckCardInstance {
  return {
    instanceId: `i${id}-${name}`,
    name,
    apiCard: { ygoprodeckId: id, name, cardType, frameType, level, linkValue: null },
    origin: null,
    roles: [],
    needsReview: false,
  } as unknown as DeckCardInstance
}

describe('sortDeckCards', () => {
  it('Main: monstruos (nivel de mayor a menor), magias y trampas; copias juntas', () => {
    const sorted = sortDeckCards([
      card(5, 'Trampa B', 'Trap Card', 'trap'),
      card(3, 'Magia A', 'Spell Card', 'spell'),
      card(1, 'Monstruo bajo', 'Effect Monster', 'effect', 3),
      card(2, 'Monstruo alto', 'Effect Monster', 'effect', 8),
      card(1, 'Monstruo bajo', 'Effect Monster', 'effect', 3),
      card(4, 'Trampa A', 'Trap Card', 'trap'),
    ])

    expect(sorted.map((entry) => entry.name)).toEqual([
      'Monstruo alto',
      'Monstruo bajo',
      'Monstruo bajo',
      'Magia A',
      'Trampa A',
      'Trampa B',
    ])
  })

  it('Extra: fusión, sincro, xyz y link', () => {
    const sorted = sortDeckCards([
      card(4, 'Link', 'Link Monster', 'link'),
      card(3, 'Xyz', 'XYZ Monster', 'xyz', 4),
      card(2, 'Sincro', 'Synchro Monster', 'synchro', 6),
      card(1, 'Fusión', 'Fusion Monster', 'fusion', 8),
    ])

    expect(sorted.map((entry) => entry.name)).toEqual(['Fusión', 'Sincro', 'Xyz', 'Link'])
  })

  it('no modifica la lista original', () => {
    const original = [card(2, 'B', 'Spell Card', 'spell'), card(1, 'A', 'Effect Monster', 'effect', 4)]

    sortDeckCards(original)

    expect(original.map((entry) => entry.name)).toEqual(['B', 'A'])
  })
})
