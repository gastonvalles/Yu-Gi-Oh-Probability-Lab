import { getMonsterRequirementSourceLabel, isMonsterPropertyMatcher } from './card-attributes'
import {
  getConditionSource,
  getPatternMatchMode,
  normalizeHandPatternCategory,
  resolveConditionCardIds,
  allowsSharedCards,
} from './patterns'
import {
  getConditionCardIds,
  getConditionGroupKey,
} from './patterns'
import {
  getQualifiedDeckGroupLabel,
  serializeGroupKey,
  type DerivedDeckGroup,
} from './deck-groups'
import type {
  CardEntry,
  HandPattern,
  HandPatternCategory,
  PatternCondition,
  PatternMatchMode,
  RequirementKind,
  RequirementSource,
} from '../types'

export interface ResolvedRequirement<Key extends string | number> {
  id: string
  sourceLabel: string
  source: RequirementSource
  cardIds: string[]
  quantity: number
  kind: RequirementKind
  distinct: boolean
  keys: Key[]
  names: string[]
  possible: boolean
}

export interface ResolvedPattern<Key extends string | number> {
  id: string
  name: string
  kind: HandPatternCategory
  requirementLabel: string
  requirements: ResolvedRequirement<Key>[]
  possible: boolean
  requiredMatches: number
  matchMode: PatternMatchMode
  allowSharedCards: boolean
}

export interface RequirementMatchWitness<Key extends string | number> {
  requirementId: string
  sourceLabel: string
  kind: RequirementKind
  usage: Array<[Key, number]>
}

export interface PatternMatchWitness<Key extends string | number> {
  matchedRequirements: RequirementMatchWitness<Key>[]
}

export interface CountOperations<Counts, Key extends string | number> {
  cloneCounts: (counts: Counts) => Counts
  consumeCount: (counts: Counts, key: Key, amount: number) => void
  getCount: (counts: Counts, key: Key) => number
  serializeCounts: (counts: Counts) => string
}

interface PatternResolutionContext<Counts, Key extends string | number> {
  availableCounts: Counts
  cardById: Map<string, CardEntry>
  countOperations: CountOperations<Counts, Key>
  groupsByKey: Map<string, DerivedDeckGroup>
  mapCardIdToKey: (cardId: string) => Key | null
}

export function getRequiredMatches(
  pattern: Pick<HandPattern, 'logic' | 'minimumConditionMatches' | 'conditions'>,
): number {
  const conditionCount = pattern.conditions.length

  if (conditionCount === 0) {
    return 0
  }

  return pattern.logic === 'all'
    ? conditionCount
    : Math.max(1, Math.min(pattern.minimumConditionMatches, conditionCount))
}

export function resolvePattern<Counts, Key extends string | number>(
  pattern: HandPattern,
  context: PatternResolutionContext<Counts, Key>,
): ResolvedPattern<Key> {
  const requirements = pattern.conditions.map<ResolvedRequirement<Key>>((condition) => {
    const uniqueCardIds = resolveConditionCardIds(
      condition,
      context.groupsByKey,
      context.cardById.values(),
    )
    const cards = uniqueCardIds
      .map((cardId) => context.cardById.get(cardId))
      .filter((card): card is CardEntry => Boolean(card))
    const keys = uniqueCardIds.flatMap((cardId) => {
      const key = context.mapCardIdToKey(cardId)
      return key === null ? [] : [key]
    })
    const totalCopies = cards.reduce((total, card) => total + card.copies, 0)
    const distinctAvailable = cards.filter((card) => card.copies > 0).length
    const possible =
      keys.length === 0
        ? false
        : condition.kind === 'exclude'
          ? true
        : condition.distinct
          ? distinctAvailable >= condition.quantity
          : totalCopies >= condition.quantity

    return {
      id: condition.id,
      sourceLabel: buildConditionSourceLabel(condition, cards, context.groupsByKey),
      source: getConditionSource(condition),
      cardIds: uniqueCardIds,
      quantity: condition.quantity,
      kind: condition.kind,
      distinct: condition.distinct,
      keys,
      names: cards.map((card) => card.name.trim()),
      possible,
    }
  })
  const requiredMatches = getRequiredMatches(pattern)
  const possibleRequirementCount = getMatchedRequirementCount(
    requirements,
    context.availableCounts,
    allowsSharedCards(pattern),
    context.countOperations,
  )

  return {
    id: pattern.id,
    name: pattern.name.trim() || 'Patrón sin nombre',
    kind: normalizeHandPatternCategory(pattern.kind),
    requirementLabel: buildPatternRequirementLabel(
      getPatternMatchMode(pattern),
      requiredMatches,
      requirements,
      allowsSharedCards(pattern),
    ),
    requirements,
    possible: possibleRequirementCount >= requiredMatches,
    requiredMatches,
    matchMode: getPatternMatchMode(pattern),
    allowSharedCards: allowsSharedCards(pattern),
  }
}

export function buildPatternRequirementLabel<Key extends string | number>(
  matchMode: PatternMatchMode,
  requiredMatches: number,
  requirements: ResolvedRequirement<Key>[],
  allowSharedCards: boolean,
): string {
  if (requirements.length === 0) {
    return 'Sin requisitos'
  }

  const requirementLabels = requirements.map((requirement) => formatRequirementPhrase(requirement))

  if (matchMode === 'all') {
    return `${buildMatchPrefix(requirementLabels, allowSharedCards)} se cumple si ${requirementLabels.join(' y ')}.`
  }

  if (matchMode === 'any') {
    return `${buildMatchPrefix(requirementLabels, allowSharedCards)} se cumple si pasa cualquiera de estas opciones: ${requirementLabels.join(' o ')}.`
  }

  return `${buildMatchPrefix(requirementLabels, allowSharedCards)} se cumple si pasan al menos ${requiredMatches} de estas opciones: ${requirementLabels.join(', ')}.`
}

export function matchesResolvedPattern<Counts, Key extends string | number>(
  pattern: Pick<ResolvedPattern<Key>, 'requirements' | 'allowSharedCards' | 'requiredMatches'>,
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
): boolean {
  return getMatchedRequirementCount(
    pattern.requirements,
    counts,
    pattern.allowSharedCards,
    countOperations,
  ) >= pattern.requiredMatches
}

export function getResolvedPatternWitness<Counts, Key extends string | number>(
  pattern: Pick<ResolvedPattern<Key>, 'requirements' | 'allowSharedCards' | 'requiredMatches'>,
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
): PatternMatchWitness<Key> | null {
  const matchedExcludeRequirements = pattern.requirements.filter(
    (requirement) =>
      requirement.kind === 'exclude' && matchesRequirement(requirement, counts, countOperations),
  )
  const includeRequirements = pattern.requirements.filter((requirement) => requirement.kind === 'include')
  const includeWitness = pattern.allowSharedCards || includeRequirements.length <= 1
    ? buildSharedCardWitness(includeRequirements, counts, countOperations)
    : buildDistinctCardWitness(includeRequirements, counts, countOperations)
  const totalMatches = matchedExcludeRequirements.length + includeWitness.count

  if (totalMatches < pattern.requiredMatches) {
    return null
  }

  const matchedRequirementIds = new Set<string>([
    ...matchedExcludeRequirements.map((requirement) => requirement.id),
    ...includeWitness.assignments.keys(),
  ])

  return {
    matchedRequirements: pattern.requirements.flatMap((requirement) => {
      if (!matchedRequirementIds.has(requirement.id)) {
        return []
      }

      return [
        {
          requirementId: requirement.id,
          sourceLabel: requirement.sourceLabel,
          kind: requirement.kind,
          usage: includeWitness.assignments.get(requirement.id) ?? [],
        },
      ]
    }),
  }
}

export function getMatchedRequirementCount<Counts, Key extends string | number>(
  requirements: ResolvedRequirement<Key>[],
  counts: Counts,
  allowSharedCards: boolean,
  countOperations: CountOperations<Counts, Key>,
): number {
  const excludeMatched = requirements.reduce(
    (total, requirement) =>
      requirement.kind === 'exclude' && matchesRequirement(requirement, counts, countOperations) ? total + 1 : total,
    0,
  )
  const includeRequirements = requirements.filter((requirement) => requirement.kind === 'include')

  if (includeRequirements.length === 0) {
    return excludeMatched
  }

  if (allowSharedCards || includeRequirements.length === 1) {
    return (
      excludeMatched +
      includeRequirements.reduce(
        (total, requirement) => (matchesRequirement(requirement, counts, countOperations) ? total + 1 : total),
        0,
      )
    )
  }

  return excludeMatched + getMaxMatchedIncludeRequirements(includeRequirements, counts, countOperations)
}

function buildConditionSourceLabel(
  condition: PatternCondition,
  cards: CardEntry[],
  groupsByKey: Map<string, DerivedDeckGroup>,
): string {
  const groupKey = getConditionGroupKey(condition)

  if (groupKey) {
    const group = groupsByKey.get(serializeGroupKey(groupKey))
    return group ? getQualifiedDeckGroupLabel(group) : 'Grupo eliminado'
  }

  if (isMonsterPropertyMatcher(condition.matcher)) {
    return getMonsterRequirementSourceLabel(condition.matcher) ?? 'Filtro de monstruos'
  }

  const cardIds = getConditionCardIds(condition)

  if (cardIds.length === 1 && cards.length === 1) {
    return cards[0].name.trim()
  }

  return `(${cards.length > 0 ? cards.map((card) => card.name.trim()).join(' / ') : 'Pool vacía'})`
}

function formatRequirementPhrase<Key extends string | number>(requirement: ResolvedRequirement<Key>): string {
  if (requirement.source !== 'cards' && requirement.source !== 'group') {
    return formatMonsterPropertyRequirementPhrase(requirement)
  }

  if (requirement.kind === 'exclude') {
    if (requirement.distinct) {
      return requirement.quantity === 1
        ? `no abrís ningún nombre de ${requirement.sourceLabel}`
        : `no abrís ${requirement.quantity} o más nombres distintos de ${requirement.sourceLabel}`
    }

    return requirement.quantity === 1
      ? `no abrís ninguna copia de ${requirement.sourceLabel}`
      : `no abrís ${requirement.quantity} o más copias de ${requirement.sourceLabel}`
  }

  if (requirement.distinct) {
    return requirement.quantity === 1
      ? `abrís 1 nombre distinto de ${requirement.sourceLabel}`
      : `abrís ${requirement.quantity} nombres distintos de ${requirement.sourceLabel}`
  }

  return requirement.quantity === 1
    ? `abrís 1 copia de ${requirement.sourceLabel}`
    : `abrís ${requirement.quantity} copias de ${requirement.sourceLabel}`
}

function formatMonsterPropertyRequirementPhrase<Key extends string | number>(
  requirement: ResolvedRequirement<Key>,
): string {
  const sourceLabel = requirement.sourceLabel

  if (requirement.kind === 'exclude') {
    if (requirement.distinct) {
      return requirement.quantity === 1
        ? `no abrís ningún monstruo ${sourceLabel}`
        : `no abrís ${requirement.quantity} o más nombres distintos de monstruos ${sourceLabel}`
    }

    return requirement.quantity === 1
      ? `no abrís ningún monstruo ${sourceLabel}`
      : `no abrís ${requirement.quantity} o más monstruos ${sourceLabel}`
  }

  if (requirement.distinct) {
    return requirement.quantity === 1
      ? `abrís 1 monstruo ${sourceLabel}`
      : `abrís ${requirement.quantity} nombres distintos de monstruos ${sourceLabel}`
  }

  return requirement.quantity === 1
    ? `abrís 1 monstruo ${sourceLabel}`
    : `abrís ${requirement.quantity} monstruos ${sourceLabel}`
}

function buildMatchPrefix(requirementLabels: string[], allowSharedCards: boolean): string {
  if (allowSharedCards || requirementLabels.length < 2) {
    return 'La regla'
  }

  return 'La regla, sin reutilizar la misma carta entre condiciones,'
}

function matchesRequirement<Counts, Key extends string | number>(
  requirement: ResolvedRequirement<Key>,
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
): boolean {
  if (requirement.keys.length === 0) {
    return false
  }

  const copiesMatched = requirement.keys.reduce(
    (total, key) => total + countOperations.getCount(counts, key),
    0,
  )
  const distinctMatched = requirement.keys.reduce(
    (total, key) => total + (countOperations.getCount(counts, key) > 0 ? 1 : 0),
    0,
  )

  if (requirement.kind === 'exclude') {
    return requirement.distinct ? distinctMatched < requirement.quantity : copiesMatched < requirement.quantity
  }

  return requirement.distinct ? distinctMatched >= requirement.quantity : copiesMatched >= requirement.quantity
}

function getMaxMatchedIncludeRequirements<Counts, Key extends string | number>(
  requirements: ResolvedRequirement<Key>[],
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
): number {
  const orderedRequirements = [...requirements].sort((left, right) => {
    const leftAvailable = left.keys.length
    const rightAvailable = right.keys.length

    if (leftAvailable !== rightAvailable) {
      return leftAvailable - rightAvailable
    }

    if (left.distinct !== right.distinct) {
      return left.distinct ? -1 : 1
    }

    return right.quantity - left.quantity
  })
  const memo = new Map<string, number>()

  const visit = (index: number, availableCounts: Counts): number => {
    if (index >= orderedRequirements.length) {
      return 0
    }

    const key = `${index}|${countOperations.serializeCounts(availableCounts)}`
    const cached = memo.get(key)

    if (cached !== undefined) {
      return cached
    }

    let best = visit(index + 1, availableCounts)

    for (const usage of getRequirementUsages(orderedRequirements[index], availableCounts, countOperations)) {
      const nextCounts = countOperations.cloneCounts(availableCounts)

      for (const [keyToConsume, usedCopies] of usage) {
        countOperations.consumeCount(nextCounts, keyToConsume, usedCopies)
      }

      best = Math.max(best, 1 + visit(index + 1, nextCounts))
    }

    memo.set(key, best)
    return best
  }

  return visit(0, counts)
}

function getRequirementUsages<Counts, Key extends string | number>(
  requirement: ResolvedRequirement<Key>,
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
): Array<Array<[Key, number]>> {
  const candidateKeys = requirement.keys.filter((key) => countOperations.getCount(counts, key) > 0)

  if (requirement.distinct) {
    if (candidateKeys.length < requirement.quantity) {
      return []
    }

    const usages: Array<Array<[Key, number]>> = []

    const collectDistinct = (
      startIndex: number,
      remaining: number,
      currentUsage: Array<[Key, number]>,
    ): void => {
      if (remaining === 0) {
        usages.push([...currentUsage])
        return
      }

      for (let index = startIndex; index <= candidateKeys.length - remaining; index += 1) {
        currentUsage.push([candidateKeys[index], 1])
        collectDistinct(index + 1, remaining - 1, currentUsage)
        currentUsage.pop()
      }
    }

    collectDistinct(0, requirement.quantity, [])
    return usages
  }

  const totalAvailable = candidateKeys.reduce(
    (total, key) => total + countOperations.getCount(counts, key),
    0,
  )

  if (totalAvailable < requirement.quantity) {
    return []
  }

  const usages: Array<Array<[Key, number]>> = []

  const collectCopies = (
    candidateIndex: number,
    remaining: number,
    currentUsage: Array<[Key, number]>,
  ): void => {
    if (remaining === 0) {
      usages.push([...currentUsage])
      return
    }

    if (candidateIndex >= candidateKeys.length) {
      return
    }

    const currentKey = candidateKeys[candidateIndex]
    const available = Math.min(countOperations.getCount(counts, currentKey), remaining)
    const remainingCapacity = candidateKeys
      .slice(candidateIndex + 1)
      .reduce((total, key) => total + countOperations.getCount(counts, key), 0)

    for (let usedCopies = available; usedCopies >= 0; usedCopies -= 1) {
      if (usedCopies === 0 && remaining > remainingCapacity) {
        continue
      }

      if (usedCopies > 0) {
        currentUsage.push([currentKey, usedCopies])
      }

      collectCopies(candidateIndex + 1, remaining - usedCopies, currentUsage)

      if (usedCopies > 0) {
        currentUsage.pop()
      }
    }
  }

  collectCopies(0, requirement.quantity, [])
  return usages
}

function buildSharedCardWitness<Counts, Key extends string | number>(
  requirements: ResolvedRequirement<Key>[],
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
): { count: number; assignments: Map<string, Array<[Key, number]>> } {
  const assignments = new Map<string, Array<[Key, number]>>()

  for (const requirement of requirements) {
    if (!matchesRequirement(requirement, counts, countOperations)) {
      continue
    }

    const usage = getRequirementUsages(requirement, counts, countOperations)[0]

    if (usage) {
      assignments.set(requirement.id, usage)
    }
  }

  return {
    count: assignments.size,
    assignments,
  }
}

function buildDistinctCardWitness<Counts, Key extends string | number>(
  requirements: ResolvedRequirement<Key>[],
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
): { count: number; assignments: Map<string, Array<[Key, number]>> } {
  const orderedRequirements = [...requirements].sort((left, right) => {
    const leftAvailable = left.keys.length
    const rightAvailable = right.keys.length

    if (leftAvailable !== rightAvailable) {
      return leftAvailable - rightAvailable
    }

    if (left.distinct !== right.distinct) {
      return left.distinct ? -1 : 1
    }

    return right.quantity - left.quantity
  })
  let bestCount = 0
  let bestAssignments = new Map<string, Array<[Key, number]>>()

  const visit = (
    index: number,
    availableCounts: Counts,
    currentAssignments: Map<string, Array<[Key, number]>>,
  ): void => {
    if (currentAssignments.size + (orderedRequirements.length - index) <= bestCount) {
      return
    }

    if (index >= orderedRequirements.length) {
      if (currentAssignments.size > bestCount) {
        bestCount = currentAssignments.size
        bestAssignments = new Map(
          [...currentAssignments.entries()].map(([requirementId, usage]) => [requirementId, [...usage]]),
        )
      }
      return
    }

    visit(index + 1, availableCounts, currentAssignments)

    for (const usage of getRequirementUsages(orderedRequirements[index], availableCounts, countOperations)) {
      const nextCounts = countOperations.cloneCounts(availableCounts)

      for (const [keyToConsume, usedCopies] of usage) {
        countOperations.consumeCount(nextCounts, keyToConsume, usedCopies)
      }

      currentAssignments.set(orderedRequirements[index].id, usage)
      visit(index + 1, nextCounts, currentAssignments)
      currentAssignments.delete(orderedRequirements[index].id)
    }
  }

  visit(0, counts, new Map())

  return {
    count: bestCount,
    assignments: bestAssignments,
  }
}
