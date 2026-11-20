import type { ApiCardReference, DeckFormat } from '../types'
import { BOT_DECK_LISTS, type BotDeckList } from './bot-deck-lists'
import { getDerivedCardId } from './calculator-state'
import { deckFormatIssues } from './duel-format'

/**
 * El mazo prestado: sin un deck propio completo (`mainMissing`), Online y Solo juegan con uno de los mazos de los bots (`bot-deck-lists.ts`), así quien entra por primera vez
 * juega ya. Es sólo con qué se juega: no toca el deck del builder, el Lab, Roles ni lo guardado del deck. Cuál, lo recuerda `loaner` de `auto-prefs`.
 */

type Card = ApiCardReference & { name: string }

export interface LoanerDeck {
  list: BotDeckList
  /** Las copias, con los ids de la mesa (`card-123-2`), como las del builder. */
  mainIds: string[]
  extraIds: string[]
  cardsById: Map<string, { name: string; apiCard: ApiCardReference | null }>
}

/**
 * En Online se presta con menos de esto en el Main: el mínimo de un duelo (`MAIN_MINIMUM` de `duel-siding.ts`, lo vigila su prueba). Copiado y no importado: el menú
 * (`DeckModeScreen`) lee este módulo y `duel-siding` es del duelo, que baja aparte.
 */
export const LOAN_BELOW = 40
export const needsLoan = (ownMain: number) => ownMain < LOAN_BELOW

/** Los que se prestan, en su orden (Sky Striker primero): los mazos listos de los bots. */
export const LOANER_LISTS = BOT_DECK_LISTS.filter((list) => list.ready)

/** Todas las cartas de los prestados, sin repetir: se piden juntas, en un solo pedido. */
export const loanerPasscodes = (): number[] => [...new Set(LOANER_LISTS.flatMap((list) => [...list.main, ...list.extra].map(([code]) => code)))]

const copiesOf = (rows: BotDeckList['main']) => rows.flatMap(([code, count]) => Array.from({ length: count }, (_, index) => `${getDerivedCardId(code)}-${index + 1}`))

/** Los prestados con los datos de sus cartas (los que trae YGOPRODeck por passcode). Una carta que no vino queda sin datos: el núcleo la juega igual por su passcode. */
export function buildLoanerDecks(cards: readonly Card[]): LoanerDeck[] {
  const byCode = new Map(cards.map((card) => [card.ygoprodeckId, card]))

  return LOANER_LISTS.map((list) => {
    const mainIds = copiesOf(list.main)
    const extraIds = copiesOf(list.extra)
    const entry = (id: string) => {
      const card = byCode.get(Number(/^card-(\d+)-/.exec(id)?.[1]))
      return [id, { name: card?.name ?? '', apiCard: card ?? null }] as const
    }

    return { list, mainIds, extraIds, cardsById: new Map([...mainIds, ...extraIds].map(entry)) }
  })
}

/** Pasa los chequeos de la sala para ese formato (los mismos que `DuelRoom`): si no, no se ofrece. */
export const loanerFits = (deck: LoanerDeck, format: DeckFormat, genesysCap?: number): boolean => deckFormatIssues([...deck.mainIds, ...deck.extraIds], deck.cardsById, format, genesysCap).length === 0

/** El que se presta: el que elegiste, si se puede; si no, el primero que se pueda (`usable`: que valga en el formato, que no sea el del bot rival). */
export function pickLoaner(decks: readonly LoanerDeck[], chosen: string, usable: (deck: LoanerDeck) => boolean = () => true): LoanerDeck | null {
  const open = decks.filter(usable)

  return open.find((deck) => deck.list.id === chosen) ?? open[0] ?? null
}

/**
 * El prestado de Solo (lo muestra la pantalla y con él reparte la mesa). Se presta sólo si tu deck no alcanza para lo que vas a hacer: en Solo, repartir la mano (`handSize`, lo
 * que Solo pedía siempre); un deck a medio armar que reparte es con el que practicás. Nunca el del bot rival (un espejo). `null` también si todavía no llegaron: vale tu deck.
 */
export const soloLoaner = (decks: readonly LoanerDeck[], chosen: string, ownMain: number, handSize: number, rivalBot: string | null): LoanerDeck | null =>
  ownMain >= handSize ? null : pickLoaner(decks, chosen, (deck) => deck.list.id !== rivalBot)
