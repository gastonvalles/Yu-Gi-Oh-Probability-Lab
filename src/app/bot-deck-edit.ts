import type { BotDeckList } from './bot-deck-lists'
import { BOT_SWAP_CARDS, botBanlistIssues, botCopyLimit, botDeckMain, copiesByName, flexNameOf, originalFlex, sameFlex, type HandtrapCard } from './handtraps'

/**
 * «Cambiar cartas» de un bot, puro: qué se le puede poner en su parte cambiable (`BotDeckList.flex`), hasta cuántas copias de cada una y si un cambio vale. El motor no se toca y el
 * Main no cambia de tamaño (`botDeckMain`). El banlist es el del jugador (`botCopyLimit`, la lista TCG que rige) y se mira sobre el Main entero, como el de un deck.
 */

/** Las cartas de la hoja: las cambiables del bot (en su orden) y las de `BOT_SWAP_CARDS` que no tiene (una por nombre: su Droll & Lock Bird, no el otro arte). */
export function flexOptions(list: BotDeckList): HandtrapCard[] {
  const own = originalFlex(list).map(([id]) => ({ id, name: flexNameOf(list, id) }))

  return [...own, ...BOT_SWAP_CARDS.filter((card) => !own.some((mine) => mine.name === card.name))]
}

/** El Main con la parte cambiable de la hoja (`copies`, por passcode; 0 o sin anotar: no va), sin validar. */
const mainOf = (list: BotDeckList, copies: Readonly<Record<number, number>>) => [...list.main.filter(([code]) => !(code in list.flex)), ...flexPairs(copies)]

/** La parte cambiable como se guarda: los pares con al menos una copia. */
export const flexPairs = (copies: Readonly<Record<number, number>>): [number, number][] =>
  Object.entries(copies).flatMap(([code, count]) => (count > 0 ? [[Number(code), count] as [number, number]] : []))

/** Las ranuras libres: cuántas copias de la parte cambiable faltan para completar el Main. */
export const freeSlots = (list: BotDeckList, copies: Readonly<Record<number, number>>) =>
  originalFlex(list).reduce((sum, [, count]) => sum + count, 0) - flexPairs(copies).reduce((sum, [, count]) => sum + count, 0)

/** Hasta cuántas copias de `code` se pueden poner (el tope del contador): lo que deja el banlist por nombre (3 sin límite) y nunca más que las ranuras libres. */
export function capOf(list: BotDeckList, copies: Readonly<Record<number, number>>, code: number): number {
  const mine = copies[code] ?? 0
  const others = (copiesByName(list, mainOf(list, copies)).get(flexNameOf(list, code)) ?? 0) - mine

  return Math.max(mine, Math.min(botCopyLimit(list, code) - others, mine + Math.max(0, freeSlots(list, copies))))
}

/** Si el cambio vale: un Main completo (`botDeckMain`) que pasa entero el banlist de hoy, también el original (las listas de fábrica son legales: `bot-decks-banlist.test.ts`). */
export function isValidFlex(list: BotDeckList, flex: readonly (readonly [number, number])[]): boolean {
  const main = botDeckMain(list, flex)

  return (main !== list.main || sameFlex(flex, originalFlex(list))) && botBanlistIssues(list, main).length === 0
}
