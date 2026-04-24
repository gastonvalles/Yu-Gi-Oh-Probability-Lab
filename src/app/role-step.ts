import type { CardEntry } from '../types'

export function isCardMissingOrigin(card: CardEntry): boolean {
  return card.origin === null
}

export function isCardMissingRoles(card: CardEntry): boolean {
  return card.roles.length === 0
}

export function isCardPendingReview(card: CardEntry): boolean {
  return card.needsReview === true
}

export function isCardFullyClassified(card: CardEntry): boolean {
  return !isCardMissingOrigin(card) && !isCardMissingRoles(card)
}

export function countCardsMissingOrigin(cards: CardEntry[]): number {
  return cards.filter(isCardMissingOrigin).length
}

export function countCardsMissingRoles(cards: CardEntry[]): number {
  return cards.filter(isCardMissingRoles).length
}

export function countCardsPendingReview(cards: CardEntry[]): number {
  return cards.filter(isCardPendingReview).length
}

export function countUnclassifiedCards(cards: CardEntry[]): number {
  return cards.filter((card) => !isCardFullyClassified(card)).length
}

export function isClassificationStepComplete(cards: CardEntry[]): boolean {
  return cards.length > 0 && countUnclassifiedCards(cards) === 0
}

export const isRoleStepComplete = isClassificationStepComplete
