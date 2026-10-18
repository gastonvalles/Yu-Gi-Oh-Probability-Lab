import type { DeckCardInstance } from './model'

/** Los vecinos de un elemento dentro de una lista ordenada: `null` donde no hay (en las puntas no se da la vuelta). */
export interface Neighbors<T> {
  previous: T | null
  next: T | null
}

/**
 * De dónde se pasa a la carta anterior y a la siguiente del detalle: el elemento de `list` que está antes y después de `list[index]`.
 * Salta lo que `same` dice que es "lo mismo" que el actual: en una zona del deck, tres copias de una carta cuentan como una sola parada
 * (si no, «siguiente» mostraría tres veces la misma carta). Sin `same`, cada elemento es una parada.
 */
export function neighborsAt<T>(list: readonly T[], index: number, same: (a: T, b: T) => boolean = Object.is): Neighbors<T> {
  const current = list[index]

  if (current === undefined) {
    return { previous: null, next: null }
  }

  let previous: T | null = null
  let next: T | null = null

  for (let i = index - 1; i >= 0 && previous === null; i--) {
    previous = same(list[i]!, current) ? null : list[i]!
  }

  for (let i = index + 1; i < list.length && next === null; i++) {
    next = same(list[i]!, current) ? null : list[i]!
  }

  return { previous, next }
}

/** Lo que el detalle de una carta necesita para pasar de una a otra: `null` en una punta (la flecha queda apagada). */
export interface CardNavigation {
  onPrevious: (() => void) | null
  onNext: (() => void) | null
}

/**
 * Arma la navegación del detalle desde los vecinos de la carta abierta. `onOpen` abre la carta pedida; en la última de una lista que todavía
 * tiene más por cargar (`loadMore`), «siguiente» pide más y deja la flecha prendida.
 */
export function buildCardNavigation<T>(neighbors: Neighbors<T>, onOpen: (item: T) => void, loadMore: (() => void) | null = null): CardNavigation {
  const { previous, next } = neighbors

  return {
    onPrevious: previous === null ? null : () => onOpen(previous),
    onNext: next !== null ? () => onOpen(next) : loadMore,
  }
}

/** La navegación del detalle de una carta abierta desde una zona del deck: sus cartas en el orden de la zona, y las copias de una misma carta son una sola parada. */
export function buildZoneNavigation(cards: readonly DeckCardInstance[], instanceId: string, onOpen: (card: DeckCardInstance) => void): CardNavigation {
  const index = cards.findIndex((card) => card.instanceId === instanceId)

  return buildCardNavigation(neighborsAt(cards, index, (a, b) => a.apiCard.ygoprodeckId === b.apiCard.ygoprodeckId), onOpen)
}
