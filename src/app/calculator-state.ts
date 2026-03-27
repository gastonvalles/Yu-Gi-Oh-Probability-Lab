import type { CalculatorState, CardEntry } from '../types'
import { mergeCardOrigins } from './deck-groups'
import type { AppState, DeckCardInstance } from './model'

export function buildCalculatorState(
  derivedMainCards: CardEntry[],
  state: Pick<AppState, 'handSize' | 'patterns'>,
): CalculatorState {
  return {
    deckSize: derivedMainCards.reduce((total, card) => total + card.copies, 0),
    handSize: state.handSize,
    cards: derivedMainCards,
    patterns: state.patterns,
  }
}

export function getDerivedCardId(ygoprodeckId: number): string {
  return `card-${ygoprodeckId}`
}

export function deriveMainDeckCardsFromZone(mainDeck: DeckCardInstance[]): CardEntry[] {
  const groupedCards = new Map<number, CardEntry>()

  for (const instance of mainDeck) {
    const existingCard = groupedCards.get(instance.apiCard.ygoprodeckId)

    if (existingCard) {
      existingCard.copies += 1
      existingCard.origin = mergeCardOrigins(existingCard.origin, instance.origin)
      existingCard.roles = [...new Set([...existingCard.roles, ...instance.roles])]
      existingCard.needsReview = existingCard.needsReview || instance.needsReview
      continue
    }

    groupedCards.set(instance.apiCard.ygoprodeckId, {
      id: getDerivedCardId(instance.apiCard.ygoprodeckId),
      name: instance.name,
      copies: 1,
      source: 'ygoprodeck',
      apiCard: instance.apiCard,
      origin: instance.origin,
      roles: [...instance.roles],
      needsReview: instance.needsReview,
    })
  }

  return [...groupedCards.values()].map((card) => ({
    ...card,
    roles: [...new Set(card.roles)],
  }))
}
