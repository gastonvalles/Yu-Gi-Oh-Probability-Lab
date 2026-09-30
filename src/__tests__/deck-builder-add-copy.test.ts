import { describe, expect, it } from 'vitest'

import { addSearchResultToZone } from '../app/deck-builder'
import type { DeckBuilderState, DeckCardInstance } from '../app/model'
import type { ApiCardSearchResult } from '../ygoprodeck'

const ASH = {
  ygoprodeckId: 14558127,
  name: 'Ash Blossom & Joyous Spring',
  cardType: 'Tuner Monster',
  frameType: 'effect',
  description: null,
  race: 'Zombie',
  attribute: 'FIRE',
  level: 3,
  linkValue: null,
  atk: '0',
  def: '1800',
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: null,
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
} satisfies ApiCardSearchResult

function deckWith(card: Partial<DeckCardInstance>): DeckBuilderState {
  return {
    deckName: 'Test',
    main: [{ instanceId: 'a', name: ASH.name, apiCard: ASH, origin: 'non_engine', roles: ['handtrap', 'disruption'], needsReview: false, ...card }],
    extra: [],
    side: [],
    isEditingDeck: false,
  }
}

describe('agregar otra copia de una carta', () => {
  it('hereda la clasificación que ya le diste (no queda pendiente de revisión)', () => {
    const next = addSearchResultToZone(deckWith({}), [ASH], ASH.ygoprodeckId, 'main', 1)
    expect(next.main[1]).toMatchObject({ origin: 'non_engine', roles: ['handtrap', 'disruption'], needsReview: false })
  })

  it('si la copia existente todavía no se revisó, usa la sugerencia automática', () => {
    const next = addSearchResultToZone(deckWith({ needsReview: true }), [ASH], ASH.ygoprodeckId, 'main', 1)
    expect(next.main[1]!.needsReview).toBe(true)
  })
})
