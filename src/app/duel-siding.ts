import { isCardAllowedInDeckZone } from './deck-builder'
import { deckFormatIssues } from './duel-format'
import type { ApiCardReference, DeckFormat } from '../types'

/**
 * El siding de un Match: entre un duelo y el siguiente cada uno cambia cartas entre su Main, su Extra y su Side, como en el builder, sin que el
 * rival vea nada. Todo es puro: la pantalla (`DuelSiding`) sólo muestra y mueve; esto dice qué se puede y si el deck queda bien.
 */

export type SideZone = 'main' | 'extra' | 'side'

export const SIDE_ZONES: readonly SideZone[] = ['main', 'extra', 'side']

/** Las copias de cada zona, con los ids que usa la mesa (`card-123-2`). */
export interface SideDeck {
  main: string[]
  extra: string[]
  side: string[]
}

/** Lo mínimo de cada copia: cómo se llama y sus datos (sin datos, no se sabe de qué zona es). */
export interface SideCard {
  name: string
  apiCard: ApiCardReference | null
}

/** Lo que cada zona deja como tope (el Main también tiene un mínimo, que depende del deck con que se empezó). */
export const SIDE_LIMITS = { main: 60, extra: 15, side: 15 } as const
export const MAIN_MINIMUM = 40

/** La carta de una copia puede ir a esa zona: un monstruo del Extra Deck no va al Main ni al revés; el Side acepta todo. Sin datos de la carta, cualquier zona. */
export function canGoTo(card: SideCard | undefined, zone: SideZone): boolean {
  return card?.apiCard ? isCardAllowedInDeckZone(card.apiCard, zone) : true
}

/**
 * A dónde va una carta al tocarla: del Main y del Extra, al Side; del Side, a la zona que le toca (el Main o, si es un monstruo del Extra Deck, el Extra).
 * Un toque en el mismo lugar la devuelve: así se hace siding sin arrastrar (en el celular, con el dedo).
 */
export function tapTarget(card: SideCard | undefined, from: SideZone): SideZone {
  if (from !== 'side') {
    return 'side'
  }

  return canGoTo(card, 'main') ? 'main' : 'extra'
}

/** La carta que hay detrás de un id de copia (`card-123-2` → `card-123`). */
const cardKeyOf = (id: string) => id.replace(/-\d+$/, '')

/** En qué lugar va cada carta (`card-123`) en el deck con que se empezó, Main, Extra y Side juntos: con eso las copias de una carta quedan juntas en su zona aunque pasen de una a otra. */
export function deckOrder(deck: SideDeck): Map<string, number> {
  const order = new Map<string, number>()

  for (const id of [...deck.main, ...deck.extra, ...deck.side]) {
    const key = cardKeyOf(id)

    if (!order.has(key)) {
      order.set(key, order.size)
    }
  }

  return order
}

/** Las copias de una zona en el orden del deck de partida (`deckOrder`); las que no estaban, al final. Estable: las copias de una misma carta conservan su orden. */
export function sortedZone(ids: readonly string[], order: ReadonlyMap<string, number>): string[] {
  const rank = (id: string) => order.get(cardKeyOf(id)) ?? order.size

  return ids.map((id, index) => ({ id, index })).sort((a, b) => rank(a.id) - rank(b.id) || a.index - b.index).map((entry) => entry.id)
}

/** El mismo deck con la copia `index` de `from` pasada a `to` (al final de esa zona). Un movimiento que no es posible devuelve el mismo deck. */
export function moveCopy(deck: SideDeck, from: SideZone, index: number, to: SideZone): SideDeck {
  const id = deck[from][index]

  if (id === undefined || from === to) {
    return deck
  }

  return { ...deck, [from]: deck[from].filter((_, position) => position !== index), [to]: [...deck[to], id] }
}

export type SidingProblem =
  | { kind: 'main-small'; min: number; count: number }
  | { kind: 'main-big'; max: number; count: number }
  | { kind: 'extra-big'; max: number; count: number }
  | { kind: 'side-big'; max: number; count: number }
  | { kind: 'format'; text: string }

/**
 * Lo que le falta al deck para poder jugar el siguiente duelo. El Main no baja de 40 (ni de las cartas con que se empezó, si eran menos: así un deck
 * de prueba también puede hacer siding) ni pasa de 60; el Extra y el Side, hasta 15; y las cartas, las reglas del formato de la sala.
 */
export function sidingProblems(deck: SideDeck, original: { main: number }, cardsById: ReadonlyMap<string, SideCard>, format: DeckFormat): SidingProblem[] {
  const problems: SidingProblem[] = []
  const min = Math.min(MAIN_MINIMUM, original.main)

  if (deck.main.length < min) problems.push({ kind: 'main-small', min, count: deck.main.length })
  if (deck.main.length > SIDE_LIMITS.main) problems.push({ kind: 'main-big', max: SIDE_LIMITS.main, count: deck.main.length })
  if (deck.extra.length > SIDE_LIMITS.extra) problems.push({ kind: 'extra-big', max: SIDE_LIMITS.extra, count: deck.extra.length })
  if (deck.side.length > SIDE_LIMITS.side) problems.push({ kind: 'side-big', max: SIDE_LIMITS.side, count: deck.side.length })

  for (const text of deckFormatIssues([...deck.main, ...deck.extra, ...deck.side], cardsById, format)) {
    problems.push({ kind: 'format', text })
  }

  return problems
}

/**
 * Los mismos zonas con ids de copia nuevos y seguidos (`card-123-1`, `card-123-2`…) contando el Main y el Extra juntos, y los datos de cada uno: al pasar
 * cartas de zona dos copias podrían quedar con el mismo id, y la mesa necesita que cada copia tenga uno propio.
 */
export function renumberDeck(deck: SideDeck, cardsById: ReadonlyMap<string, SideCard>): { deck: SideDeck; cardsById: Map<string, SideCard> } {
  const counts = new Map<string, number>()
  const data = new Map<string, SideCard>()
  const next = new Map<string, SideCard>()

  for (const [id, card] of cardsById) {
    data.set(cardKeyOf(id), card)
  }

  const renumber = (ids: readonly string[]) =>
    ids.map((id) => {
      const key = cardKeyOf(id)
      const copy = (counts.get(key) ?? 0) + 1
      const fresh = `${key}-${copy}`
      const card = cardsById.get(id) ?? data.get(key)

      counts.set(key, copy)

      if (card) {
        next.set(fresh, card)
      }

      return fresh
    })

  return { deck: { main: renumber(deck.main), extra: renumber(deck.extra), side: renumber(deck.side) }, cardsById: next }
}
