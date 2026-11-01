import type { Banlist } from './banlists'
import { statusIn } from './banlists'
import type { BotDeckList } from './bot-deck-lists'
import { BOT_SWAP_CARDS, botDeckMain, copiesByName, flexNameOf, MAX_COPIES, originalFlex, sameFlex, type HandtrapCard } from './handtraps'

/**
 * «Cambiar cartas» de un bot, puro: qué se le puede poner en su parte cambiable (`BotDeckList.flex`), hasta cuántas copias de cada una y si un cambio vale. El motor no se toca y el
 * Main no cambia de tamaño (`botDeckMain`). El banlist sólo frena lo que se agrega: lo que el mazo original ya traía siempre vale, así «Restaurar original» siempre vuelve.
 */

/** Cuántas copias deja cada estado del banlist. */
const ALLOWED = { forbidden: 0, limited: 1, 'semi-limited': 2, unlimited: MAX_COPIES } as const

/** Las cartas de la hoja: las cambiables del bot (en su orden) y las de `BOT_SWAP_CARDS` que no tiene (una por nombre: su Droll & Lock Bird, no el otro arte). */
export function flexOptions(list: BotDeckList): HandtrapCard[] {
  const own = originalFlex(list).map(([id]) => ({ id, name: flexNameOf(list, id) }))

  return [...own, ...BOT_SWAP_CARDS.filter((card) => !own.some((mine) => mine.name === card.name))]
}

/** El estado de una carta en el banlist: el más estricto entre sus passcodes (los artes alternativos figuran con uno solo). */
function allowedOf(list: BotDeckList, banlist: Banlist | null, code: number): number {
  const name = flexNameOf(list, code)
  const codes = [code, ...flexOptions(list).filter((card) => card.name === name).map((card) => card.id), ...BOT_SWAP_CARDS.filter((card) => card.name === name).map((card) => card.id)]

  return Math.min(...codes.map((one) => ALLOWED[statusIn(banlist, one)]))
}

/** Hasta cuántas copias por nombre deja el banlist con ese nombre: lo que permite o, si el original traía más, lo del original. */
const limitOf = (list: BotDeckList, banlist: Banlist | null, code: number) =>
  Math.max(Math.min(MAX_COPIES, allowedOf(list, banlist, code)), copiesByName(list, list.main).get(flexNameOf(list, code)) ?? 0)

/** El Main con la parte cambiable de la hoja (`copies`, por passcode; 0 o sin anotar: no va), sin validar. */
const mainOf = (list: BotDeckList, copies: Readonly<Record<number, number>>) => [...list.main.filter(([code]) => !(code in list.flex)), ...flexPairs(copies)]

/** La parte cambiable como se guarda: los pares con al menos una copia. */
export const flexPairs = (copies: Readonly<Record<number, number>>): [number, number][] =>
  Object.entries(copies).flatMap(([code, count]) => (count > 0 ? [[Number(code), count] as [number, number]] : []))

/** Las ranuras libres: cuántas copias de la parte cambiable faltan para completar el Main. */
export const freeSlots = (list: BotDeckList, copies: Readonly<Record<number, number>>) =>
  originalFlex(list).reduce((sum, [, count]) => sum + count, 0) - flexPairs(copies).reduce((sum, [, count]) => sum + count, 0)

/** Hasta cuántas copias de `code` se pueden poner (el tope del contador): por nombre hasta 3 y lo del banlist, y nunca más que las ranuras libres. */
export function capOf(list: BotDeckList, copies: Readonly<Record<number, number>>, code: number, banlist: Banlist | null): number {
  const mine = copies[code] ?? 0
  const others = (copiesByName(list, mainOf(list, copies)).get(flexNameOf(list, code)) ?? 0) - mine

  return Math.max(mine, Math.min(limitOf(list, banlist, code) - others, mine + Math.max(0, freeSlots(list, copies))))
}

/** Si el cambio vale: el original, o un Main completo y legal (`botDeckMain`) en el que nada de lo agregado pasa el banlist. */
export function isValidFlex(list: BotDeckList, flex: readonly (readonly [number, number])[], banlist: Banlist | null): boolean {
  if (sameFlex(flex, originalFlex(list))) return true
  const main = botDeckMain(list, flex)

  return (
    main !== list.main &&
    [...copiesByName(list, main)].every(([name, count]) => {
      const code = flex.find(([one]) => flexNameOf(list, one) === name)?.[0]

      return code === undefined || count <= limitOf(list, banlist, code)
    })
  )
}
