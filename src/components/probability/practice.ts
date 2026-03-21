import { resolveRequirementCardIds } from '../../app/deck-groups'
import type { DerivedDeckGroup } from '../../app/deck-groups'
import { normalizeHandPatternCategory } from '../../app/patterns'
import type { ApiCardReference, CardEntry, CardGroupKey, HandPattern, HandPatternCategory } from '../../types'
import { getRequiredMatches } from './pattern-helpers'

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

  for (const card of hand) {
    counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1)
  }

  const matches = patterns.flatMap<PracticeHandMatch>((pattern) => {
    if (!matchesPracticePattern(pattern, counts, groupsByKey)) {
      return []
    }

    return [
      {
        patternId: pattern.id,
        name: pattern.name.trim() || 'Patrón sin nombre',
        category: normalizeHandPatternCategory(pattern.category),
        requirementLabel: buildPracticePatternLabel(pattern, cardById, groupsByKey),
      },
    ]
  })

  return {
    matches,
    openingMatches: matches.filter((match) => match.category === 'good'),
    problemMatches: matches.filter((match) => match.category === 'bad'),
  }
}

function matchesPracticePattern(
  pattern: HandPattern,
  counts: Map<string, number>,
  groupsByKey: Map<CardGroupKey, DerivedDeckGroup>,
): boolean {
  const requiredMatches = getRequiredMatches(pattern)
  const matchedRequirements = getMatchedPracticeRequirementCount(pattern, counts, groupsByKey)

  return matchedRequirements >= requiredMatches
}

function buildPracticePatternLabel(
  pattern: HandPattern,
  cardById: Map<string, CardEntry>,
  groupsByKey: Map<CardGroupKey, DerivedDeckGroup>,
): string {
  const labels = pattern.requirements.map((requirement) => {
    const resolvedCardIds = resolveRequirementCardIds(requirement, groupsByKey)
    const names = resolvedCardIds.map((cardId) => cardById.get(cardId)?.name ?? 'Carta eliminada')
    const poolLabel =
      requirement.source === 'group' && requirement.groupKey
        ? groupsByKey.get(requirement.groupKey)?.label ?? 'Grupo eliminado'
        : names.length === 1
          ? names[0]
          : `(${names.join(' / ')})`

    if (requirement.kind === 'exclude') {
      if (requirement.distinct) {
        return requirement.count === 1
          ? `no abrís ningún nombre de ${poolLabel}`
          : `no abrís ${requirement.count} o más nombres distintos de ${poolLabel}`
      }

      return requirement.count === 1
        ? `no abrís ninguna copia de ${poolLabel}`
        : `no abrís ${requirement.count} o más copias de ${poolLabel}`
    }

    if (requirement.distinct) {
      return requirement.count === 1
        ? `abrís 1 nombre distinto de ${poolLabel}`
        : `abrís ${requirement.count} nombres distintos de ${poolLabel}`
    }

    return requirement.count === 1
      ? `abrís 1 copia de ${poolLabel}`
      : `abrís ${requirement.count} copias de ${poolLabel}`
  })

  const requiredMatches = getRequiredMatches(pattern)

  if (pattern.matchMode === 'all') {
    return `${buildPracticePrefix(labels, pattern.allowSharedCards)} se cumple si ${labels.join(' y ')}.`
  }

  if (pattern.matchMode === 'any') {
    return `${buildPracticePrefix(labels, pattern.allowSharedCards)} se cumple si pasa cualquiera de estas opciones: ${labels.join(' o ')}.`
  }

  return `${buildPracticePrefix(labels, pattern.allowSharedCards)} se cumple si pasan al menos ${requiredMatches} de estas opciones: ${labels.join(', ')}.`
}

function buildPracticePrefix(labels: string[], allowSharedCards: boolean): string {
  if (allowSharedCards || labels.length < 2) {
    return 'La regla'
  }

  return 'La regla, sin reutilizar la misma carta entre condiciones,'
}

function getMatchedPracticeRequirementCount(
  pattern: HandPattern,
  counts: Map<string, number>,
  groupsByKey: Map<CardGroupKey, DerivedDeckGroup>,
): number {
  const resolvedRequirements = pattern.requirements.map((requirement) => ({
    ...requirement,
    resolvedCardIds: resolveRequirementCardIds(requirement, groupsByKey),
  }))
  const excludeMatched = resolvedRequirements.reduce(
    (total, requirement) =>
      requirement.kind === 'exclude' && matchesResolvedPracticeRequirement(requirement, counts)
        ? total + 1
        : total,
    0,
  )
  const includeRequirements = resolvedRequirements.filter((requirement) => requirement.kind === 'include')

  if (includeRequirements.length === 0) {
    return excludeMatched
  }

  if (pattern.allowSharedCards || includeRequirements.length === 1) {
    return (
      excludeMatched +
      includeRequirements.reduce(
        (total, requirement) => (matchesResolvedPracticeRequirement(requirement, counts) ? total + 1 : total),
        0,
      )
    )
  }

  const normalizedCounts = new Map<string, number>(counts)
  return excludeMatched + getMaxMatchedPracticeIncludeRequirements(includeRequirements, normalizedCounts)
}

function matchesResolvedPracticeRequirement(
  requirement: HandPattern['requirements'][number] & { resolvedCardIds: string[] },
  counts: Map<string, number>,
): boolean {
  const copiesMatched = requirement.resolvedCardIds.reduce((total, cardId) => total + (counts.get(cardId) ?? 0), 0)
  const distinctMatched = requirement.resolvedCardIds.reduce(
    (total, cardId) => total + ((counts.get(cardId) ?? 0) > 0 ? 1 : 0),
    0,
  )

  if (requirement.kind === 'exclude') {
    return requirement.distinct ? distinctMatched < requirement.count : copiesMatched < requirement.count
  }

  return requirement.distinct ? distinctMatched >= requirement.count : copiesMatched >= requirement.count
}

function getMaxMatchedPracticeIncludeRequirements(
  requirements: Array<HandPattern['requirements'][number] & { resolvedCardIds: string[] }>,
  counts: Map<string, number>,
): number {
  const orderedRequirements = [...requirements].sort((left, right) => {
    if (left.resolvedCardIds.length !== right.resolvedCardIds.length) {
      return left.resolvedCardIds.length - right.resolvedCardIds.length
    }

    if (left.distinct !== right.distinct) {
      return left.distinct ? -1 : 1
    }

    return right.count - left.count
  })
  const memo = new Map<string, number>()

  const visit = (index: number, availableCounts: Map<string, number>): number => {
    if (index >= orderedRequirements.length) {
      return 0
    }

    const key = `${index}|${serializePracticeCounts(availableCounts)}`
    const cached = memo.get(key)

    if (cached !== undefined) {
      return cached
    }

    let best = visit(index + 1, availableCounts)

    for (const usage of getPracticeRequirementUsages(orderedRequirements[index], availableCounts)) {
      const nextCounts = new Map(availableCounts)

      for (const [cardId, usedCopies] of usage) {
        nextCounts.set(cardId, Math.max(0, (nextCounts.get(cardId) ?? 0) - usedCopies))
      }

      best = Math.max(best, 1 + visit(index + 1, nextCounts))
    }

    memo.set(key, best)
    return best
  }

  return visit(0, counts)
}

function serializePracticeCounts(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([cardId, copies]) => `${cardId}:${copies}`)
    .join('|')
}

function getPracticeRequirementUsages(
  requirement: HandPattern['requirements'][number] & { resolvedCardIds: string[] },
  counts: Map<string, number>,
): Array<Array<[string, number]>> {
  const candidates = requirement.resolvedCardIds.filter((cardId) => (counts.get(cardId) ?? 0) > 0)

  if (requirement.distinct) {
    if (candidates.length < requirement.count) {
      return []
    }

    const usages: Array<Array<[string, number]>> = []

    const collectDistinct = (
      startIndex: number,
      remaining: number,
      currentUsage: Array<[string, number]>,
    ): void => {
      if (remaining === 0) {
        usages.push([...currentUsage])
        return
      }

      for (let index = startIndex; index <= candidates.length - remaining; index += 1) {
        currentUsage.push([candidates[index], 1])
        collectDistinct(index + 1, remaining - 1, currentUsage)
        currentUsage.pop()
      }
    }

    collectDistinct(0, requirement.count, [])
    return usages
  }

  const totalAvailable = candidates.reduce((total, cardId) => total + (counts.get(cardId) ?? 0), 0)

  if (totalAvailable < requirement.count) {
    return []
  }

  const usages: Array<Array<[string, number]>> = []

  const collectCopies = (
    cardPosition: number,
    remaining: number,
    currentUsage: Array<[string, number]>,
  ): void => {
    if (remaining === 0) {
      usages.push([...currentUsage])
      return
    }

    if (cardPosition >= candidates.length) {
      return
    }

    const currentCardId = candidates[cardPosition]
    const available = Math.min(counts.get(currentCardId) ?? 0, remaining)
    const remainingCapacity = candidates
      .slice(cardPosition + 1)
      .reduce((total, cardId) => total + (counts.get(cardId) ?? 0), 0)

    for (let usedCopies = available; usedCopies >= 0; usedCopies -= 1) {
      if (usedCopies === 0 && remaining > remainingCapacity) {
        continue
      }

      if (usedCopies > 0) {
        currentUsage.push([currentCardId, usedCopies])
      }

      collectCopies(cardPosition + 1, remaining - usedCopies, currentUsage)

      if (usedCopies > 0) {
        currentUsage.pop()
      }
    }
  }

  collectCopies(0, requirement.count, [])
  return usages
}
