import type { DerivedDeckGroup } from '../../app/deck-groups'
import {
  getMatchedRequirementCount,
  getResolvedPatternWitness,
  matchesResolvedPattern,
  resolvePattern,
  type CountOperations,
  type ResolvedPattern,
  type ResolvedRequirement,
} from '../../app/pattern-engine'
import type { ApiCardReference, CardEntry, HandPattern, HandPatternCategory } from '../../types'
import { selectPatternsForView } from '../../app/turn-context'

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
  kind: HandPatternCategory
  requirementLabel: string
  assignments: PracticeHandRequirementAssignment[]
}

export interface PracticeHandRequirementAssignment {
  requirementId: string
  sourceLabel: string
  kind: 'include' | 'exclude'
  cards: Array<{
    name: string
    copies: number
  }>
}

export interface PracticeHandNearMiss {
  patternId: string
  name: string
  kind: HandPatternCategory
  requirementLabel: string
  missingConditions: number
  notes: string[]
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
  groupsByKey: Map<string, DerivedDeckGroup>,
  turn: 'first' | 'second',
): {
  matches: PracticeHandMatch[]
  openingMatches: PracticeHandMatch[]
  problemMatches: PracticeHandMatch[]
  openingNearMisses: PracticeHandNearMiss[]
} {
  const counts = new Map<string, number>()
  const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
  const availableCounts = new Map(derivedMainCards.map((card) => [card.id, card.copies]))

  for (const card of hand) {
    counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1)
  }

  const applicablePatterns = selectPatternsForView(patterns, turn)

  const resolvedPatterns = applicablePatterns.map((pattern) =>
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

    const witness = getResolvedPatternWitness(pattern, counts, MAP_COUNT_OPERATIONS)

    return [
      {
        patternId: pattern.id,
        name: pattern.name,
        kind: pattern.kind,
        requirementLabel: pattern.requirementLabel,
        assignments:
          witness?.matchedRequirements.map((requirement) => ({
            requirementId: requirement.requirementId,
            sourceLabel: requirement.sourceLabel,
            kind: requirement.kind,
            cards: requirement.usage
              .map(([cardId, copies]) => ({
                name: cardById.get(cardId)?.name.trim() ?? 'Carta fuera del deck',
                copies,
              }))
              .filter((entry) => entry.copies > 0),
          })) ?? [],
      },
    ]
  })
  const openingNearMisses = resolvedPatterns.flatMap<PracticeHandNearMiss>((pattern) => {
    if (pattern.kind !== 'opening' || matchesResolvedPattern(pattern, counts, MAP_COUNT_OPERATIONS)) {
      return []
    }

    const nearMiss = buildPracticeNearMiss(pattern, counts)

    return nearMiss ? [nearMiss] : []
  })
    .sort((left, right) => {
      if (left.missingConditions !== right.missingConditions) {
        return left.missingConditions - right.missingConditions
      }

      return left.name.localeCompare(right.name)
    })

  return {
    matches,
    openingMatches: matches.filter((match) => match.kind === 'opening'),
    problemMatches: matches.filter((match) => match.kind === 'problem'),
    openingNearMisses,
  }
}

function buildPracticeNearMiss(
  pattern: ResolvedPattern<string>,
  counts: Map<string, number>,
): PracticeHandNearMiss | null {
  const individuallyMatchedRequirements = pattern.requirements.filter((requirement) =>
    isRequirementMatchedIndividually(requirement, counts),
  )
  const matchedRequirementCount = getMatchedRequirementCount(
    pattern.requirements,
    counts,
    pattern.allowSharedCards,
    MAP_COUNT_OPERATIONS,
  )
  const missingConditions = Math.max(1, pattern.requiredMatches - matchedRequirementCount)
  const unmetRequirements = pattern.requirements
    .filter((requirement) => !isRequirementMatchedIndividually(requirement, counts))
    .map((requirement) => describeRequirementGap(requirement, counts))
    .sort((left, right) => left.distance - right.distance)

  const notes =
    !pattern.allowSharedCards && individuallyMatchedRequirements.length >= pattern.requiredMatches
      ? [
          'Las condiciones compiten por la misma carta. Hace falta otra carta que cubra una de ellas sin reutilizar.',
        ]
      : []

  const neededNotes = pattern.matchMode === 'all'
    ? unmetRequirements
    : unmetRequirements.slice(0, Math.max(missingConditions, 1))

  const mergedNotes = [
    ...notes,
    ...neededNotes.map((entry) => entry.summary),
  ]

  if (mergedNotes.length === 0) {
    return null
  }

  return {
    patternId: pattern.id,
    name: pattern.name,
    kind: pattern.kind,
    requirementLabel: pattern.requirementLabel,
    missingConditions,
    notes: mergedNotes,
  }
}

function isRequirementMatchedIndividually(
  requirement: ResolvedRequirement<string>,
  counts: Map<string, number>,
): boolean {
  return getMatchedRequirementCount([requirement], counts, true, MAP_COUNT_OPERATIONS) > 0
}

function describeRequirementGap(
  requirement: ResolvedRequirement<string>,
  counts: Map<string, number>,
): { distance: number; summary: string } {
  const currentAmount = getRequirementCurrentAmount(requirement, counts)

  if (requirement.kind === 'exclude') {
    return {
      distance: Math.max(1, currentAmount - requirement.quantity + 1),
      summary: `Bloquea: ${requirement.sourceLabel} ya aparece ${currentAmount} vez${currentAmount === 1 ? '' : 'veces'} en la mano.`,
    }
  }

  const missingAmount = Math.max(1, requirement.quantity - currentAmount)
  const label =
    requirement.quantity === 1 && missingAmount === 1
      ? requirement.sourceLabel
      : `${requirement.sourceLabel} (${missingAmount} más)`

  return {
    distance: missingAmount,
    summary: `Falta ${label}.`,
  }
}

function getRequirementCurrentAmount(
  requirement: ResolvedRequirement<string>,
  counts: Map<string, number>,
): number {
  if (requirement.distinct) {
    return requirement.keys.reduce((total, key) => total + ((counts.get(key) ?? 0) > 0 ? 1 : 0), 0)
  }

  return requirement.keys.reduce((total, key) => total + (counts.get(key) ?? 0), 0)
}

export type PracticeTurn = 'first' | 'second'
export type PracticeVerdict = 'clean' | 'with-problem' | 'no-opening'

/** Por mecánica de juego: con la mano inicial vas 1º; si robaste al menos una más, vas 2º. */
export function getPracticeTurn(handLength: number, openingHandSize: number): PracticeTurn {
  return handLength > openingHandSize ? 'second' : 'first'
}

/** Mismo criterio que el Lab: limpia = alguna salida y ningún problema. */
export function getPracticeVerdict(openingCount: number, problemCount: number): PracticeVerdict {
  if (openingCount === 0) {
    return 'no-opening'
  }

  return problemCount > 0 ? 'with-problem' : 'clean'
}

/** Cartas de la mano que cumplen una regla (por nombre y copias usadas). */
export function getMatchCardIds(match: PracticeHandMatch, hand: readonly PracticeHandCard[]): string[] {
  const picked = new Set<string>()

  for (const assignment of match.assignments) {
    if (assignment.kind !== 'include') {
      continue
    }

    for (const { name, copies } of assignment.cards) {
      let remaining = copies

      for (const card of hand) {
        if (remaining > 0 && !picked.has(card.drawId) && card.name.trim() === name) {
          picked.add(card.drawId)
          remaining -= 1
        }
      }
    }
  }

  return [...picked]
}

export interface PracticeReveal {
  /** Resultado final de la mano completa. */
  result: ReturnType<typeof evaluatePracticeHand>
  /** En qué carta repartida (1..n) aparece cada regla cumplida. */
  steps: ReadonlyMap<string, number>
}

/**
 * Para que las reglas aparezcan a medida que se reparten las cartas sin parpadeos: cada regla
 * cumplida en la mano final aparece en la primera carta desde la cual se cumple de forma continua.
 * Si ya había una mano mostrada (al robar la carta para ir 2º), las reglas nuevas aparecen con la última.
 */
export function computeRevealSteps(
  hand: PracticeHandCard[],
  patterns: HandPattern[],
  derivedMainCards: CardEntry[],
  groupsByKey: Map<string, DerivedDeckGroup>,
  turn: PracticeTurn,
  previous?: ReadonlyMap<string, number>,
): PracticeReveal {
  const result = evaluatePracticeHand(hand, patterns, derivedMainCards, groupsByKey, turn)
  const finalIds = result.matches.map((match) => match.patternId)
  const stable = new Map<string, number>()

  for (let size = 1; size <= hand.length; size += 1) {
    const prefix = new Set(
      evaluatePracticeHand(hand.slice(0, size), patterns, derivedMainCards, groupsByKey, turn).matches.map((match) => match.patternId),
    )

    for (const id of finalIds) {
      if (!prefix.has(id)) {
        stable.delete(id)
      } else if (!stable.has(id)) {
        stable.set(id, size)
      }
    }
  }

  const steps = new Map<string, number>()

  for (const id of finalIds) {
    steps.set(id, previous && !previous.has(id) ? hand.length : (previous?.get(id) ?? stable.get(id) ?? hand.length))
  }

  return { result, steps }
}
