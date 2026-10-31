import { BRANDED_DECK, ELFNOTE_DECK, SKY_STRIKER_DECK, type BotDeckList } from '../../../bot-deck-lists'
import type { Bot } from '../bot'
import { brandedBot } from '../executors/branded'
import { elfnoteBot } from '../executors/elfnote'
import { skyStrikerBot } from '../executors/sky-striker'
import type { CardFacts } from '../turn'

/** Un mazo con ejecutor (el rival «Bot» de «Jugar solo automático»): su lista fija (`bot-deck-lists.ts`, de donde sale también `ready`) y su `Bot`. */
export interface BotDeck {
  id: string
  name: string
  ready: boolean
  list: BotDeckList
  bot: (facts: (code: number) => CardFacts | undefined, aliasOf?: (code: number) => number, attributeOf?: (code: number) => number) => Bot
}

const deck = (list: BotDeckList, bot: BotDeck['bot']): BotDeck => ({ id: list.id, name: list.name, ready: list.ready, list, bot })

export const BOT_DECKS: readonly BotDeck[] = [deck(SKY_STRIKER_DECK, skyStrikerBot), deck(BRANDED_DECK, brandedBot), deck(ELFNOTE_DECK, elfnoteBot)]

/** El mazo listo con ese `id` (`HandtrapConfig.botDeck`); `null` si no hay (un id guardado que ya no existe): entonces juega el rival de siempre. */
export const botDeckOf = (id: string | undefined): BotDeck | null => BOT_DECKS.find((deck) => deck.id === id && deck.ready) ?? null
