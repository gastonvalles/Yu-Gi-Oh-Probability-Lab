import { rowOfApiCard, type CardRow } from '../../app/auto/auto-data'
import type { DeckList } from '../../app/auto/deck-map'
import { parseDerivedCardId } from '../../app/calculator-state'
import { cardIdOfDrawId } from '../probability/practice'
import type { MatCard } from '../probability/PracticeMat'

/** El deck como lo pide la sesión (`[passcode, copias]`), contando las copias del builder. */
export function deckListOf(ids: readonly string[]): [number, number][] {
  const copies = new Map<number, number>()

  for (const id of ids) {
    const code = parseDerivedCardId(cardIdOfDrawId(id))

    if (code !== null) copies.set(code, (copies.get(code) ?? 0) + 1)
  }

  return [...copies]
}

/** El deck entero para la sesión, con la fila de cada carta según nuestros datos (`rowOfApiCard`): la usa la que no esté en ninguna base, que juega sin efectos. */
export function deckOf(mainIds: readonly string[], extraIds: readonly string[], cardsById: ReadonlyMap<string, MatCard>): DeckList {
  const rows = new Map<number, CardRow>()

  for (const id of [...mainIds, ...extraIds]) {
    const code = parseDerivedCardId(cardIdOfDrawId(id))
    const card = cardsById.get(id)

    if (code !== null && card?.apiCard && !rows.has(code)) rows.set(code, rowOfApiCard(code, card.name, card.apiCard))
  }

  return { main: deckListOf(mainIds), extra: deckListOf(extraIds), rows: [...rows.values()] }
}
