import { configureStore } from '@reduxjs/toolkit'

import { deckBeforeMiddleware } from '../../app/deck-before'
import { deckBuilderReducer } from '../../app/deck-builder-slice'
import type { DeckBuilderState, DeckCardInstance } from '../../app/model'
import { patternsReducer } from '../../app/patterns-slice'
import { settingsReducer } from '../../app/settings-slice'
import type { ApiCardReference, CardOrigin, CardRole } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'

export function apiCard(id: number, overrides: Partial<ApiCardReference> = {}): ApiCardReference {
  return {
    ygoprodeckId: id,
    cardType: 'Effect Monster',
    frameType: 'effect',
    description: null,
    race: 'Zombie',
    attribute: 'FIRE',
    level: 4,
    linkValue: null,
    atk: '1000',
    def: '1000',
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall: null,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
    ...overrides,
  }
}

export const searchResult = (id: number, name: string, overrides: Partial<ApiCardReference> = {}): ApiCardSearchResult => ({ ...apiCard(id, overrides), name })

let serial = 0

/** `count` copias de una carta (cada una con su `instanceId`). */
export function copies(
  id: number,
  name: string,
  count: number,
  roles: CardRole[],
  options: { origin?: CardOrigin | null; api?: Partial<ApiCardReference> } = {},
): DeckCardInstance[] {
  return Array.from({ length: count }, () => {
    serial += 1

    return {
      instanceId: `i-${id}-${serial}`,
      name,
      apiCard: apiCard(id, options.api),
      origin: options.origin === undefined ? 'engine' : options.origin,
      roles: [...roles],
      needsReview: false,
    }
  })
}

/** Relleno sin rol de las reglas: `count` cartas distintas (ids 900+). */
export const fillerCards = (count: number, from = 900) =>
  Array.from({ length: count }, (_, index) => copies(from + index, `Relleno ${index}`, 1, ['enabler'], { origin: 'non_engine' })).flat()

/** Un Main de 40: Starter Uno ×2 (id 1, con lugar para una más), Starter Dos y Tres ×3 (ids 2 y 3), Handtrap ×3 (id 10), Brick ×3 (id 20) y 26 de relleno (900-925). */
export function fortyCardMain(): DeckCardInstance[] {
  return [
    ...copies(1, 'Starter Uno', 2, ['starter']),
    ...copies(2, 'Starter Dos', 3, ['starter']),
    ...copies(3, 'Starter Tres', 3, ['starter']),
    ...copies(10, 'Handtrap', 3, ['handtrap'], { origin: 'non_engine' }),
    ...copies(20, 'Brick', 3, ['brick'], { origin: 'non_engine' }),
    ...fillerCards(26),
  ]
}

export function deckState(zones: Partial<Pick<DeckBuilderState, 'main' | 'extra' | 'side'>> = {}, deckName = 'Mi deck'): DeckBuilderState {
  return { deckName, main: zones.main ?? [], extra: zones.extra ?? [], side: zones.side ?? [], isEditingDeck: false }
}

/** Un store como el de la app (con el enganche de «Tu deck de antes») y el deck que se le pase. */
export function storeWith(deckBuilder: DeckBuilderState) {
  return configureStore({
    reducer: { settings: settingsReducer, deckBuilder: deckBuilderReducer, patterns: patternsReducer },
    preloadedState: { deckBuilder },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(deckBeforeMiddleware),
  })
}
