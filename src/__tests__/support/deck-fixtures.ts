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

type Row = [id: number, name: string, count: number, roles: CardRole[], origin?: CardOrigin]

const zone = (rows: Row[]) => rows.flatMap(([id, name, count, roles, origin = 'engine']) => copies(id, name, count, roles, { origin }))

/**
 * Un deck de verdad: el Fire King / Jurrac con el que se prueba la app en el navegador (`pane-storage.json`), con los roles que sugiere la app ya confirmados.
 * Main 40 (10 Starters: Ponix y Ulcanix ×3, Sanctuary e Island ×2; muchos Extenders que no son Starter), Extra 15 y Side 15.
 */
export function fireKingDeck(): DeckBuilderState {
  const main = zone([
    [90681088, 'Legendary Fire King Ponix', 3, ['handtrap', 'searcher', 'starter', 'recovery', 'enabler', 'disruption', 'extender']],
    [44455560, 'Fire King Courtier Ulcanix', 3, ['searcher', 'starter', 'enabler', 'extender']],
    [2526224, 'Fire King High Avatar Kirin', 3, ['handtrap', 'recovery', 'disruption', 'extender']],
    [66431519, 'Sacred Fire King Garunix', 3, ['handtrap', 'recovery', 'disruption', 'extender']],
    [23015896, 'Fire King High Avatar Garunix', 1, ['searcher', 'recovery', 'extender']],
    [18621798, 'Fire King Avatar Arvata', 1, ['disruption', 'recovery', 'enabler', 'extender']],
    [96594609, 'Fire King Avatar Kirin', 1, ['handtrap', 'recovery', 'enabler', 'disruption', 'extender']],
    [38572779, 'Miscellaneousaurus', 1, ['handtrap', 'searcher', 'recovery', 'disruption', 'extender']],
    [93170499, 'Jurrac Megalo', 3, ['draw', 'extender']],
    [14558127, 'Ash Blossom & Joyous Spring', 3, ['handtrap', 'disruption'], 'non_engine'],
    [42141493, 'Mulcharmy Fuwalos', 3, ['handtrap', 'draw', 'floodgate', 'disruption', 'payoff'], 'non_engine'],
    [84192580, 'Mulcharmy Purulia', 3, ['handtrap', 'draw', 'floodgate', 'disruption', 'payoff'], 'non_engine'],
    [65305978, 'Fire King Sanctuary', 2, ['starter', 'enabler', 'extender']],
    [57554544, 'Fire King Island', 2, ['searcher', 'starter', 'enabler', 'payoff', 'extender']],
    [91703676, 'Fire King Sky Burn', 2, ['disruption', 'extender']],
    [10045474, 'Infinite Impermanence', 3, ['handtrap', 'disruption'], 'non_engine'],
    [40366667, 'Dominus Impulse', 3, ['handtrap', 'disruption'], 'non_engine'],
  ])
  const extra = zone([
    [64182380, 'Garunix Eternity, Hyang of the Fire Kings', 1, ['payoff', 'recovery']],
    [52553102, 'Jurrac Astero', 2, ['payoff', 'disruption', 'recovery']],
    [17548456, 'Jurrac Meteor', 2, ['payoff', 'recovery']],
    [11765832, 'Garura, Wings of Resonant Life', 1, ['payoff', 'draw']],
    [54757758, 'Mudragon of the Swamp', 1, ['payoff', 'floodgate']],
    [17412721, 'Elder Entity Norden', 1, ['payoff', 'disruption', 'recovery']],
    [60303245, 'Salamangreat Almiraj', 1, ['payoff', 'recovery']],
    [48815792, 'Hiita the Fire Charmer, Ablaze', 1, ['payoff', 'searcher']],
    [87871125, 'Salamangreat Sunlight Wolf', 1, ['payoff', 'recovery']],
    [2772337, 'Promethean Princess, Bestower of Flames', 1, ['payoff', 'recovery']],
    [57134592, 'Salamangreat Raging Phoenix', 1, ['payoff', 'searcher', 'recovery']],
    [94259633, 'Relinquished Anima', 1, ['payoff']],
    [29301450, 'S:P Little Knight', 1, ['boardbreaker', 'disruption'], 'non_engine'],
  ])
  const side = zone([
    [27204311, 'Nibiru, the Primal Being', 2, ['handtrap', 'boardbreaker', 'disruption'], 'non_engine'],
    [59438930, 'Ghost Ogre & Snow Rabbit', 2, ['handtrap', 'disruption'], 'non_engine'],
    [94145021, 'Droll & Lock Bird', 1, ['handtrap', 'floodgate', 'disruption', 'payoff'], 'non_engine'],
    [38910263, 'Fire King Avatar Rangbali', 1, ['handtrap', 'disruption', 'recovery', 'enabler', 'extender']],
    [59388357, 'Circle of the Fire Kings', 1, ['recovery', 'extender']],
    [48130397, 'Super Polymerization', 2, ['boardbreaker'], 'non_engine'],
    [14532163, 'Lightning Storm', 2, ['boardbreaker'], 'non_engine'],
    [18144507, "Harpie's Feather Duster", 1, ['boardbreaker'], 'non_engine'],
    [41420027, 'Solemn Judgment', 1, ['disruption'], 'non_engine'],
    [78114463, 'Solemn Accusation', 2, ['disruption'], 'non_engine'],
  ])

  return deckState({ main, extra, side }, 'fire-king-jurrac')
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
