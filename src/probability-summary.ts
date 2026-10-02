import { buildDerivedDeckGroupMap } from './app/deck-groups'
import {
  getResolvedPatternWitness,
  matchesResolvedPattern,
  resolvePattern,
  type CountOperations,
} from './app/pattern-engine'
import { normalizeHandPatternCategory, resolveConditionCardIds } from './app/patterns'
import type {
  CalculationSummary,
  HandSegmentCounts,
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
  const signatureByCardId = new Map<string, string[]>()

  for (const pattern of state.patterns) {
    for (const condition of pattern.conditions) {
      for (const cardId of resolveConditionCardIds(condition, groupsByKey, state.cards)) {
        const token = condition.distinct
          ? `${pattern.id}/${condition.id}#${cardId}`
          : `${pattern.id}/${condition.id}`
        const signature = signatureByCardId.get(cardId) ?? []
        signature.push(token)
        signatureByCardId.set(cardId, signature)
      }
    }
  }

  // Cartas que cumplen exactamente las mismas condiciones son intercambiables:
  // se enumeran como una sola clase y el cálculo sigue siendo exacto.
  const classIndexByCardId = new Map<string, number>()
  const classIndexBySignature = new Map<string, number>()
  const relevantCards: CalculationCard[] = []

  for (const card of state.cards) {
    const signature = signatureByCardId.get(card.id)

    if (!signature || card.copies <= 0) {
      continue
    }

    const signatureKey = signature.join('|')
    const existingIndex = classIndexBySignature.get(signatureKey)

    if (existingIndex !== undefined) {
      relevantCards[existingIndex].copies += card.copies
      classIndexByCardId.set(card.id, existingIndex)
      continue
    }

    classIndexBySignature.set(signatureKey, relevantCards.length)
    classIndexByCardId.set(card.id, relevantCards.length)
    relevantCards.push({ id: signatureKey, name: card.name.trim(), copies: card.copies })
  }

  const relevantCopies = relevantCards.reduce((total, card) => total + card.copies, 0)
  const otherCopies = Math.max(0, state.deckSize - relevantCopies)

  if (otherCopies > 0) {
    relevantCards.push({
      id: '__other__',
      name: 'Otras cartas',
      copies: otherCopies,
    })
  }

  const availableCounts = relevantCards.map((card) => card.copies)
  const resolvedPatterns = state.patterns.map((pattern) =>
    resolvePattern(pattern, {
      availableCounts,
      cardById,
      countOperations: ARRAY_COUNT_OPERATIONS,
      groupsByKey,
      mapCardIdToKey: (cardId) => classIndexByCardId.get(cardId) ?? null,
    }),
  )

  const totalHands = combination(state.deckSize, state.handSize)
  const patternHands = new Array<number>(resolvedPatterns.length).fill(0)
  // Manos de cada grupo (limpias / con problema / sin salida) en las que aparece cada regla.
  const segmentPatternHands: HandSegmentCounts = {
    clean: new Array<number>(resolvedPatterns.length).fill(0),
    withProblem: new Array<number>(resolvedPatterns.length).fill(0),
    noOpening: new Array<number>(resolvedPatterns.length).fill(0),
  }
  const matchedIndexes: number[] = []
  let goodHands = 0
  let badHands = 0
  let overlapHands = 0

  const suffixCopies = buildSuffixCopies(relevantCards)

  const ignoresDraw = state.patterns.map((pattern) => pattern.ignoresDraw === true)
  const splitsDraw = state.drawnCards === 1 && ignoresDraw.some(Boolean)

  const rescues = state.patterns.map((pattern) => pattern.rescuesCards === true && normalizeHandPatternCategory(pattern.kind) === 'opening')
  const hasRescue = rescues.some(Boolean)

  const tally = (handCounts: number[], initialCounts: number[], weight: number) => {
    let matchedGoodPattern = false
    let matchedBadPattern = false
    matchedIndexes.length = 0

    const countsFor = (index: number) => (ignoresDraw[index] ? initialCounts : handCounts)
    // Cartas que una salida "rescatadora" usa: dejan de contar para los problemas.
    let rescued: number[] | null = null

    if (hasRescue) {
      for (const [index, pattern] of resolvedPatterns.entries()) {
        const witness = rescues[index] && matchesResolvedPattern(pattern, countsFor(index), ARRAY_COUNT_OPERATIONS)
          ? getResolvedPatternWitness(pattern, countsFor(index), ARRAY_COUNT_OPERATIONS)
          : null

        for (const requirement of witness?.matchedRequirements ?? []) {
          for (const [key, copies] of requirement.usage) {
            rescued ??= new Array<number>(handCounts.length).fill(0)
            rescued[key] = Math.max(rescued[key], copies)
          }
        }
      }
    }

    for (const [index, pattern] of resolvedPatterns.entries()) {
      const base = countsFor(index)
      const counts =
        rescued && normalizeHandPatternCategory(pattern.kind) === 'problem'
          ? base.map((copies, key) => Math.max(0, copies - rescued[key]))
          : base

      if (matchesResolvedPattern(pattern, counts, ARRAY_COUNT_OPERATIONS)) {
        patternHands[index] += weight
        matchedIndexes.push(index)

        if (normalizeHandPatternCategory(pattern.kind) === 'problem') {
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

    const segment = !matchedGoodPattern ? 'noOpening' : matchedBadPattern ? 'withProblem' : 'clean'

    for (const index of matchedIndexes) {
      segmentPatternHands[segment][index] += weight
    }
  }

  enumerateHands(
    relevantCards,
    suffixCopies,
    0,
    state.handSize,
    new Array<number>(relevantCards.length).fill(0),
    1,
    (counts, weight) => {
      if (!splitsDraw) {
        tally(counts, counts, weight)
        return
      }

      // La carta robada puede ser cualquiera de la mano: se promedia sobre cada clase posible.
      for (const [classIndex, copies] of counts.entries()) {
        if (copies > 0) {
          const initial = [...counts]
          initial[classIndex] -= 1
          tally(counts, initial, (weight * copies) / state.handSize)
        }
      }
    },
  )

  const patternResults: PatternProbability[] = resolvedPatterns.map((pattern, index) => ({
    patternId: pattern.id,
    name: pattern.name,
    kind: normalizeHandPatternCategory(pattern.kind),
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
    segmentPatternHands,
    relevantCardCount: signatureByCardId.size,
    otherCopies,
  }
}

/** Manos que cumplen alguna apertura y ningún problema ("jugables sin problemas"). */
export function getCleanHands(summary: CalculationSummary): number {
  return Math.max(0, summary.goodHands - summary.overlapHands)
}

export function getCleanProbability(summary: CalculationSummary): number {
  return summary.totalHands > 0 ? getCleanHands(summary) / summary.totalHands : 0
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
