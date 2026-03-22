import { buildDerivedDeckGroupMap, resolveRequirementCardIds } from './app/deck-groups'
import {
  matchesResolvedPattern,
  resolvePattern,
  type CountOperations,
} from './app/pattern-engine'
import { normalizeHandPatternCategory } from './app/patterns'
import type {
  CalculationSummary,
  CalculatorState,
  PatternProbability,
} from './types'

interface CalculationCard {
  id: string
  name: string
  copies: number
}

const ARRAY_COUNT_OPERATIONS: CountOperations<number[], number> = {
  cloneCounts: (counts) => [...counts],
  consumeCount: (counts, key, amount) => {
    counts[key] = Math.max(0, (counts[key] ?? 0) - amount)
  },
  getCount: (counts, key) => counts[key] ?? 0,
  serializeCounts: (counts) => counts.join(','),
}

export function buildCalculationSummary(state: CalculatorState): CalculationSummary {
  const cardById = new Map(state.cards.map((card) => [card.id, card]))
  const groupsByKey = buildDerivedDeckGroupMap(state.cards)
  const referencedCardIds = new Set<string>()

  for (const pattern of state.patterns) {
    for (const requirement of pattern.requirements) {
      for (const cardId of resolveRequirementCardIds(requirement, groupsByKey, state.cards)) {
        referencedCardIds.add(cardId)
      }
    }
  }

  const relevantCards = state.cards
    .filter((card) => referencedCardIds.has(card.id) && card.copies > 0)
    .map<CalculationCard>((card) => ({
      id: card.id,
      name: card.name.trim(),
      copies: card.copies,
    }))

  const relevantCopies = relevantCards.reduce((total, card) => total + card.copies, 0)
  const otherCopies = Math.max(0, state.deckSize - relevantCopies)

  if (otherCopies > 0) {
    relevantCards.push({
      id: '__other__',
      name: 'Otras cartas',
      copies: otherCopies,
    })
  }

  const relevantIndex = new Map(relevantCards.map((card, index) => [card.id, index]))
  const availableCounts = relevantCards.map((card) => card.copies)
  const resolvedPatterns = state.patterns.map((pattern) =>
    resolvePattern(pattern, {
      availableCounts,
      cardById,
      countOperations: ARRAY_COUNT_OPERATIONS,
      groupsByKey,
      mapCardIdToKey: (cardId) => relevantIndex.get(cardId) ?? null,
    }),
  )

  const totalHands = combination(state.deckSize, state.handSize)
  const patternHands = new Array<number>(resolvedPatterns.length).fill(0)
  let goodHands = 0
  let badHands = 0
  let overlapHands = 0

  const suffixCopies = buildSuffixCopies(relevantCards)

  enumerateHands(
    relevantCards,
    suffixCopies,
    0,
    state.handSize,
    new Array<number>(relevantCards.length).fill(0),
    1,
    (counts, weight) => {
      let matchedGoodPattern = false
      let matchedBadPattern = false

      for (const [index, pattern] of resolvedPatterns.entries()) {
        if (matchesResolvedPattern(pattern, counts, ARRAY_COUNT_OPERATIONS)) {
          patternHands[index] += weight

          if (normalizeHandPatternCategory(pattern.category) === 'bad') {
            matchedBadPattern = true
          } else {
            matchedGoodPattern = true
          }
        }
      }

      if (matchedGoodPattern) {
        goodHands += weight
      }

      if (matchedBadPattern) {
        badHands += weight
      }

      if (matchedGoodPattern && matchedBadPattern) {
        overlapHands += weight
      }
    },
  )

  const patternResults: PatternProbability[] = resolvedPatterns.map((pattern, index) => ({
    patternId: pattern.id,
    name: pattern.name,
    category: normalizeHandPatternCategory(pattern.category),
    requirementLabel: pattern.requirementLabel,
    probability: totalHands === 0 ? 0 : patternHands[index] / totalHands,
    matchingHands: patternHands[index],
    possible: patternHands[index] > 0,
  }))

  const neutralHands = Math.max(0, totalHands - goodHands - badHands + overlapHands)

  return {
    totalProbability: totalHands === 0 ? 0 : goodHands / totalHands,
    goodHands,
    badProbability: totalHands === 0 ? 0 : badHands / totalHands,
    badHands,
    neutralProbability: totalHands === 0 ? 0 : neutralHands / totalHands,
    neutralHands,
    overlapProbability: totalHands === 0 ? 0 : overlapHands / totalHands,
    overlapHands,
    totalHands,
    patternResults,
    relevantCardCount: referencedCardIds.size,
    otherCopies,
  }
}

function buildSuffixCopies(cards: CalculationCard[]): number[] {
  const suffix = new Array<number>(cards.length + 1).fill(0)

  for (let index = cards.length - 1; index >= 0; index -= 1) {
    suffix[index] = suffix[index + 1] + cards[index].copies
  }

  return suffix
}

function enumerateHands(
  cards: CalculationCard[],
  suffixCopies: number[],
  index: number,
  remainingCardsToDraw: number,
  counts: number[],
  currentWeight: number,
  onHand: (counts: number[], weight: number) => void,
): void {
  if (index === cards.length) {
    if (remainingCardsToDraw === 0) {
      onHand(counts, currentWeight)
    }

    return
  }

  const currentCard = cards[index]
  const maxPick = Math.min(currentCard.copies, remainingCardsToDraw)
  const minPick = Math.max(0, remainingCardsToDraw - suffixCopies[index + 1])

  for (let pickedCopies = minPick; pickedCopies <= maxPick; pickedCopies += 1) {
    counts[index] = pickedCopies

    enumerateHands(
      cards,
      suffixCopies,
      index + 1,
      remainingCardsToDraw - pickedCopies,
      counts,
      currentWeight * combination(currentCard.copies, pickedCopies),
      onHand,
    )
  }
}

function combination(totalCards: number, chosenCards: number): number {
  if (chosenCards < 0 || chosenCards > totalCards) {
    return 0
  }

  if (chosenCards === 0 || chosenCards === totalCards) {
    return 1
  }

  const k = Math.min(chosenCards, totalCards - chosenCards)
  let result = 1

  for (let step = 1; step <= k; step += 1) {
    result = (result * (totalCards - k + step)) / step
  }

  return Math.round(result)
}
