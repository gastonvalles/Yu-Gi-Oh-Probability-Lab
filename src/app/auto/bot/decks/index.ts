import type { Bot } from '../bot'
import { brandedBot } from '../executors/branded'
import { skyStrikerBot } from '../executors/sky-striker'
import type { CardFacts } from '../turn'
import { BRANDED_DECK } from './branded'
import { SKY_STRIKER_DECK, type BotDeckList } from './sky-striker'

/** Un mazo con ejecutor (el rival «Bot» de «Jugar solo automático»): su lista fija y su `Bot`. `ready`: pasó su goldfish y su fuzz (la fila de la interfaz ofrece sólo éstos). */
export interface BotDeck {
  id: string
  name: string
  ready: boolean
  list: BotDeckList
  bot: (facts: (code: number) => CardFacts | undefined, aliasOf?: (code: number) => number, attributeOf?: (code: number) => number) => Bot
}

export const BOT_DECKS: readonly BotDeck[] = [
  { id: SKY_STRIKER_DECK.id, name: SKY_STRIKER_DECK.name, ready: true, list: SKY_STRIKER_DECK, bot: skyStrikerBot },
  { id: BRANDED_DECK.id, name: BRANDED_DECK.name, ready: true, list: BRANDED_DECK, bot: brandedBot },
]

/** El mazo listo con ese `id` (`HandtrapConfig.botDeck`); `null` si no hay (un id guardado que ya no existe): entonces juega el rival de siempre. */
export const botDeckOf = (id: string | undefined): BotDeck | null => BOT_DECKS.find((deck) => deck.id === id && deck.ready) ?? null
