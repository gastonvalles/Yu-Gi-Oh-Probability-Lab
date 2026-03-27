import type { CardEntry } from '../types'

export function countUnclassifiedCards(cards: CardEntry[]): number {
  return cards.filter((card) => card.roles.length === 0).length
}

export function isRoleStepComplete(cards: CardEntry[]): boolean {
  return cards.length > 0 && countUnclassifiedCards(cards) === 0
}
