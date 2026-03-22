import type { DerivedDeckGroup } from '../../app/deck-groups'
import {
  matchesResolvedPattern,
  resolvePattern,
  type CountOperations,
} from '../../app/pattern-engine'
import type { ApiCardReference, CardEntry, CardGroupKey, HandPattern, HandPatternCategory } from '../../types'

const MAP_COUNT_OPERATIONS: CountOperations<Map<string, number>, string> = {
  cloneCounts: (counts) => new Map(counts),
  consumeCount: (counts, key, amount) => {
    counts.set(key, Math.max(0, (counts.get(key) ?? 0) - amount))
  },
  getCount: (counts, key) => counts.get(key) ?? 0,
  serializeCounts: (counts) =>
    [...counts.entries()]
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([cardId, copies]) => `${cardId}:${copies}`)
      .join('|'),
}

export interface PracticeHandCard {
  drawId: string
  cardId: string
  name: string
  apiCard: ApiCardReference | null
}

export interface PracticeHandState {
  hand: PracticeHandCard[]
  remainingDeck: PracticeHandCard[]
}

export interface PracticeHandMatch {
  patternId: string
  name: string
  category: HandPatternCategory
  requirementLabel: string
}

export function buildPracticeDeck(cards: CardEntry[]): PracticeHandCard[] {
  return cards.flatMap((card) =>
    Array.from({ length: card.copies }, (_, index) => ({
      drawId: `${card.id}-${index + 1}`,
      cardId: card.id,
      name: card.name,
      apiCard: card.apiCard,
    })),
  )
}

export function drawRandomPracticeHand(deck: PracticeHandCard[], count: number): PracticeHandState {
  const remainingDeck = [...deck]
  const hand: PracticeHandCard[] = []

  while (hand.length < count && remainingDeck.length > 0) {
    const pickedIndex = Math.floor(Math.random() * remainingDeck.length)
    const [nextCard] = remainingDeck.splice(pickedIndex, 1)

    if (nextCard) {
      hand.push(nextCard)
    }
  }

  return {
    hand,
    remainingDeck,
  }
}

export function drawNextCard(current: PracticeHandState): PracticeHandState {
  if (current.remainingDeck.length === 0) {
    return current
  }

  const remainingDeck = [...current.remainingDeck]
  const pickedIndex = Math.floor(Math.random() * remainingDeck.length)
  const [nextCard] = remainingDeck.splice(pickedIndex, 1)

  if (!nextCard) {
    return current
  }

  return {
    hand: [...current.hand, nextCard],
    remainingDeck,
  }
}

export function evaluatePracticeHand(
  hand: PracticeHandCard[],
  patterns: HandPattern[],
  derivedMainCards: CardEntry[],
  groupsByKey: Map<CardGroupKey, DerivedDeckGroup>,
): { matches: PracticeHandMatch[]; openingMatches: PracticeHandMatch[]; problemMatches: PracticeHandMatch[] } {
  const counts = new Map<string, number>()
  const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
  const availableCounts = new Map(derivedMainCards.map((card) => [card.id, card.copies]))

  for (const card of hand) {
    counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1)
  }

  const resolvedPatterns = patterns.map((pattern) =>
    resolvePattern(pattern, {
      availableCounts,
      cardById,
      countOperations: MAP_COUNT_OPERATIONS,
      groupsByKey,
      mapCardIdToKey: (cardId) => cardId,
    }),
  )

  const matches = resolvedPatterns.flatMap<PracticeHandMatch>((pattern) => {
    if (!matchesResolvedPattern(pattern, counts, MAP_COUNT_OPERATIONS)) {
      return []
    }

    return [
      {
        patternId: pattern.id,
        name: pattern.name,
        category: pattern.category,
        requirementLabel: pattern.requirementLabel,
      },
    ]
  })

  return {
    matches,
    openingMatches: matches.filter((match) => match.category === 'good'),
    problemMatches: matches.filter((match) => match.category === 'bad'),
  }
}
