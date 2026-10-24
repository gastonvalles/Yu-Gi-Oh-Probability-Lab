import { parseDerivedCardId } from '../../app/calculator-state'
import { cardIdOfDrawId } from '../probability/practice'

/** El deck como lo pide la sesión (`[passcode, copias]`), contando las copias del builder. */
export function deckListOf(ids: readonly string[]): [number, number][] {
  const copies = new Map<number, number>()

  for (const id of ids) {
    const code = parseDerivedCardId(cardIdOfDrawId(id))

    if (code !== null) copies.set(code, (copies.get(code) ?? 0) + 1)
  }

  return [...copies]
}
