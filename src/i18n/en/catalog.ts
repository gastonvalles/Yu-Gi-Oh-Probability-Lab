import type { catalog as es } from '../es/catalog'
import type { Translated } from '../types'

export const catalog: Translated<typeof es> = {
  // Expansions
  'catalog.sets.title': 'Expansions',
  'catalog.sets.subtitle': 'The cards in each expansion, with their rarity and price.',
  'catalog.sets.help': 'These are the English TCG expansions, with TCGplayer market prices (up to a day old). Pick one to see its cards by code, filter them by name or rarity or sort them by price; tap a card for its details, and the price to open it on TCGplayer.',
  'catalog.sets.updated': 'Prices as of {date}',
  'catalog.sets.updatedTitle': 'When the TCGplayer prices were downloaded',
  'catalog.sets.loadError': "Couldn't load the expansions right now. Try again later.",
  'catalog.sets.cardsError': "Couldn't load this expansion's cards. Try again later.",
  'catalog.sets.listLabel': 'Expansions',
  'catalog.sets.searchLabel': 'Search expansions',
  'catalog.sets.noExpansion': 'No expansion matches “{query}”.',
  'catalog.sets.noDate': 'No date',
  'catalog.sets.back': 'Back to expansions',
  'catalog.sets.printings': { one: '{n} printing', other: '{n} printings' },
  'catalog.sets.distinct': { one: '{n} distinct card', other: '{n} distinct cards' },
  'catalog.sets.cardSearch': 'Search by name or code',
  'catalog.sets.sortLabel': 'Sort the cards',
  'catalog.sets.sortCode': 'By code',
  'catalog.sets.sortPrice': 'By price',
  'catalog.sets.rarityLabel': 'Rarity',
  'catalog.sets.rarityAll': 'All',
  'catalog.sets.noMatch': 'No card matches those filters.',
  'catalog.sets.showMore': 'Show {n} more',
  'catalog.sets.openCard': 'View details for {name}',
  'catalog.sets.openProduct': 'View {name} on TCGplayer',
}
