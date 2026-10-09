import { afterEach, describe, expect, it } from 'vitest'

import { setCardRulesForTests } from '../app/card-rules'
import { CARD_RULE } from '../app/card-script-rules'
import { resuggestAll } from '../app/deck-builder'
import type { DeckBuilderState } from '../app/model'
import type { ApiCardSearchResult } from '../ygoprodeck'

const card = (ygoprodeckId: number, name: string): ApiCardSearchResult => ({
  ygoprodeckId, name, cardType: 'Effect Monster', frameType: 'effect', description: null, race: null, attribute: null, level: 4,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
})

const deck: DeckBuilderState = {
  deckName: 'Test',
  main: [
    { instanceId: 'a', name: 'Buscadora', apiCard: card(1, 'Buscadora'), origin: 'non_engine', roles: ['disruption'], needsReview: false },
    { instanceId: 'b', name: 'Ash Blossom & Joyous Spring', apiCard: card(14558127, 'Ash Blossom & Joyous Spring'), origin: 'engine', roles: ['starter'], needsReview: false },
  ],
  extra: [{ instanceId: 'c', name: 'Jefa', apiCard: { ...card(2, 'Jefa'), cardType: 'Synchro Monster', frameType: 'synchro' }, origin: null, roles: [], needsReview: true }],
  side: [],
  isEditingDeck: false,
}

afterEach(() => setCardRulesForTests(null))

describe('reclasificar todo el deck con las reglas de hoy', () => {
  it('pisa lo confirmado con la sugerencia nueva y deja todo pendiente de revisión', () => {
    setCardRulesForTests(new Map([[1, CARD_RULE.search | CARD_RULE.starts], [2, CARD_RULE.negate | CARD_RULE.quickFromField]]))

    const next = resuggestAll(deck)

    expect(next.main[0]).toMatchObject({ origin: 'engine', roles: ['searcher', 'starter'], needsReview: true })
    // La lista conocida sigue mandando.
    expect(next.main[1]).toMatchObject({ origin: 'non_engine', roles: ['handtrap'], needsReview: true })
    expect(next.extra[0]).toMatchObject({ origin: 'engine', roles: ['payoff', 'disruption'], needsReview: true })
    // No toca el estado original.
    expect(deck.main[0]!.roles).toEqual(['disruption'])
  })
})
