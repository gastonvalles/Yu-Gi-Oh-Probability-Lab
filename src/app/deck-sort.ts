import type { DeckCardInstance } from './model'
import { getMainDeckCardKind } from './deck-presentation'

/**
 * Orden de una zona: Main → monstruos, magias, trampas; Extra → fusión, sincro, xyz, link.
 * (Las cartas de Extra que estén en el Side van al final, en ese orden.)
 */
function getGroupRank(card: DeckCardInstance): number {
  const frameType = card.apiCard.frameType.toLowerCase()

  if (frameType.includes('fusion')) return 3
  if (frameType.includes('synchro')) return 4
  if (frameType.includes('xyz')) return 5
  if (frameType.includes('link')) return 6

  const kind = getMainDeckCardKind(card.apiCard)

  return kind === 'monster' ? 0 : kind === 'spell' ? 1 : 2
}

/** Nivel, rango o valor link (lo que tenga): de mayor a menor dentro de los monstruos. */
function getRankValue(card: DeckCardInstance): number {
  return card.apiCard.level ?? card.apiCard.linkValue ?? 0
}

/** Cartas ordenadas por tipo, luego nivel (monstruos) y nombre; las copias de una misma carta quedan juntas. */
export function sortDeckCards(cards: readonly DeckCardInstance[]): DeckCardInstance[] {
  return [...cards].sort((left, right) => {
    const group = getGroupRank(left) - getGroupRank(right)

    if (group !== 0) {
      return group
    }

    const rank = getRankValue(right) - getRankValue(left)

    if (rank !== 0) {
      return rank
    }

    return (
      left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }) ||
      left.apiCard.ygoprodeckId - right.apiCard.ygoprodeckId
    )
  })
}
