import { buildDerivedDeckGroupMap } from './deck-groups'
import { allowsSharedCards, resolveConditionCardIds } from './patterns'
import type { CardEntry, HandPattern, PatternCondition } from '../types'

type UsagePattern = Pick<HandPattern, 'reusePolicy'> & { conditions: PatternCondition[] }

/**
 * Copias de cada carta que las OTRAS condiciones de la regla ya se llevan. Sólo cuenta cuando
 * la regla no deja que una misma carta valga para varias condiciones.
 * - Una carta puntual toma `cantidad` copias.
 * - Un pool toma todas sus cartas sólo si la cantidad pedida alcanza para agotarlo.
 */
export function getCopiesUsedByOtherConditions(
  pattern: UsagePattern,
  conditionId: string,
  cards: CardEntry[],
): Map<string, number> {
  const used = new Map<string, number>()

  if (allowsSharedCards(pattern)) {
    return used
  }

  const cardById = new Map(cards.map((card) => [card.id, card]))
  const take = (cardId: string, copies: number) => {
    const available = cardById.get(cardId)?.copies ?? 0
    used.set(cardId, Math.min(available, (used.get(cardId) ?? 0) + copies))
  }

  for (const condition of pattern.conditions) {
    const matcher = condition.matcher

    if (condition.id === conditionId || condition.kind !== 'include' || !matcher) {
      continue
    }

    if (matcher.type === 'card') {
      take(matcher.value, condition.quantity)
    } else if (matcher.type === 'card_pool') {
      const poolCopies = matcher.value.reduce((total, id) => total + (cardById.get(id)?.copies ?? 0), 0)

      if (poolCopies <= condition.quantity) {
        matcher.value.forEach((id) => take(id, cardById.get(id)?.copies ?? 0))
      }
    }
  }

  return used
}

/** Copias que todavía quedan de una carta para esta condición. */
export function getRemainingCopies(card: CardEntry, used: ReadonlyMap<string, number>): number {
  return Math.max(0, card.copies - (used.get(card.id) ?? 0))
}

/**
 * Tope de la cantidad de una condición: las copias reales que hay en el deck para lo que cuenta
 * (menos lo que otras condiciones ya se llevan). Mínimo 1.
 */
export function getMaxConditionQuantity(
  condition: PatternCondition,
  cards: CardEntry[],
  used: ReadonlyMap<string, number>,
): number {
  if (!condition.matcher) {
    return 60
  }

  const groupsByKey = buildDerivedDeckGroupMap(cards)
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const ids = resolveConditionCardIds(condition, groupsByKey, cards)
  const total = ids.reduce((sum, id) => {
    const card = cardById.get(id)
    return sum + (card ? getRemainingCopies(card, used) : 0)
  }, 0)

  // "Nombres distintos": como mucho, la cantidad de cartas diferentes.
  const limit = condition.distinct ? ids.filter((id) => (cardById.get(id)?.copies ?? 0) > 0).length : total

  return Math.max(1, limit)
}
