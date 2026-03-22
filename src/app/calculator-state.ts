import type { CalculatorState, CardEntry } from '../types'
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
      existingCard.roles = [...new Set([...existingCard.roles, ...instance.roles])]
      continue
    }

    groupedCards.set(instance.apiCard.ygoprodeckId, {
      id: getDerivedCardId(instance.apiCard.ygoprodeckId),
      name: instance.name,
      copies: 1,
      source: 'ygoprodeck',
      apiCard: instance.apiCard,
      roles: [...instance.roles],
    })
  }

  return [...groupedCards.values()].map((card) => ({
    ...card,
    roles: [...new Set(card.roles)],
  }))
}
