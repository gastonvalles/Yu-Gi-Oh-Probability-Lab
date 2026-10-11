import type { DeckBuilderState, DeckCardInstance } from './model'

/**
 * Link `ydke://main!extra!side!`: cada zona son los ids de las cartas como enteros de 32 bits
 * little-endian, en base64. Lo leen los simuladores y la extensión que importa decks a Neuron.
 */
export function buildYdkeUrl(deckBuilder: DeckBuilderState): string {
  return `ydke://${[deckBuilder.main, deckBuilder.extra, deckBuilder.side].map(encodeZone).join('!')}!`
}

function encodeZone(cards: DeckCardInstance[]): string {
  const bytes = new Uint8Array(cards.length * 4)
  const view = new DataView(bytes.buffer)

  cards.forEach((card, index) => view.setUint32(index * 4, card.apiCard.ygoprodeckId, true))

  return btoa(String.fromCharCode(...bytes))
}
