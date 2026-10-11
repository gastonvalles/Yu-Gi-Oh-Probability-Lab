import { describe, expect, it } from 'vitest'

import type { DeckBuilderState, DeckCardInstance } from '../app/model'
import { buildYdkeUrl } from '../app/ydke'

const card = (ygoprodeckId: number): DeckCardInstance =>
  ({ instanceId: String(ygoprodeckId), name: 'x', apiCard: { ygoprodeckId }, origin: null, roles: [], needsReview: false }) as unknown as DeckCardInstance

describe('link YDKE', () => {
  it('codifica cada zona como enteros de 32 bits little-endian en base64', () => {
    const deck = { deckName: 'Test', main: [card(1), card(2)], extra: [card(3)], side: [], isEditingDeck: false } as DeckBuilderState

    expect(buildYdkeUrl(deck)).toBe('ydke://AQAAAAIAAAA=!AwAAAA==!!')
    expect(buildYdkeUrl({ ...deck, main: [card(14558127)] })).toBe('ydke://ryPeAA==!AwAAAA==!!')
  })
})
