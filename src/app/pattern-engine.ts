import { resolveRequirementCardIds, type DerivedDeckGroup } from './deck-groups'
import { normalizeHandPatternCategory } from './patterns'
import type {
  CardEntry,
  CardGroupKey,
  HandPattern,
  HandPatternCategory,
  PatternMatchMode,
  RequirementKind,
} from '../types'

export interface ResolvedRequirement<Key extends string | number> {
  sourceLabel: string
  cardIds: string[]
  count: number
  kind: RequirementKind
  distinct: boolean
  keys: Key[]
  names: string[]
  possible: boolean
}

export interface ResolvedPattern<Key extends string | number> {
  id: string
  name: string
  category: HandPatternCategory
  requirementLabel: string
  requirements: ResolvedRequirement<Key>[]
  possible: boolean
  requiredMatches: number
  matchMode: PatternMatchMode
  allowSharedCards: boolean
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
  groupsByKey: Map<CardGroupKey, DerivedDeckGroup>
  mapCardIdToKey: (cardId: string) => Key | null
}

export function getRequiredMatches(
  pattern: Pick<HandPattern, 'matchMode' | 'minimumMatches' | 'requirements'>,
): number {
  if (pattern.matchMode === 'any') {
    return 1
  }

  if (pattern.matchMode === 'all') {
    return pattern.requirements.length
  }

  return Math.max(1, Math.min(pattern.minimumMatches, Math.max(pattern.requirements.length, 1)))
}

export function resolvePattern<Counts, Key extends string | number>(
  pattern: HandPattern,
  context: PatternResolutionContext<Counts, Key>,
): ResolvedPattern<Key> {
  const requirements = pattern.requirements.map<ResolvedRequirement<Key>>((requirement) => {
    const uniqueCardIds = resolveRequirementCardIds(requirement, context.groupsByKey)
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
      requirement.kind === 'exclude'
        ? true
        : requirement.distinct
          ? distinctAvailable >= requirement.count
          : totalCopies >= requirement.count

    return {
      sourceLabel:
        requirement.source === 'group' && requirement.groupKey
          ? context.groupsByKey.get(requirement.groupKey)?.label ?? 'Grupo eliminado'
          : cards.length === 1
            ? cards[0].name.trim()
            : `(${cards.length > 0 ? cards.map((card) => card.name.trim()).join(' / ') : 'Pool vacía'})`,
      cardIds: uniqueCardIds,
      count: requirement.count,
      kind: requirement.kind,
      distinct: requirement.distinct,
      keys,
      names: cards.map((card) => card.name.trim()),
      possible,
    }
  })
  const requiredMatches = getRequiredMatches(pattern)
  const possibleRequirementCount = getMatchedRequirementCount(
    requirements,
    context.availableCounts,
    pattern.allowSharedCards,
    context.countOperations,
  )

  return {
    id: pattern.id,
    name: pattern.name.trim() || 'Patrón sin nombre',
    category: normalizeHandPatternCategory(pattern.category),
    requirementLabel: buildPatternRequirementLabel(
      pattern.matchMode,
      requiredMatches,
      requirements,
      pattern.allowSharedCards,
    ),
    requirements,
    possible: possibleRequirementCount >= requiredMatches,
    requiredMatches,
    matchMode: pattern.matchMode,
    allowSharedCards: pattern.allowSharedCards,
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

function formatRequirementPhrase<Key extends string | number>(requirement: ResolvedRequirement<Key>): string {
  if (requirement.kind === 'exclude') {
    if (requirement.distinct) {
      return requirement.count === 1
        ? `no abrís ningún nombre de ${requirement.sourceLabel}`
        : `no abrís ${requirement.count} o más nombres distintos de ${requirement.sourceLabel}`
    }

    return requirement.count === 1
      ? `no abrís ninguna copia de ${requirement.sourceLabel}`
      : `no abrís ${requirement.count} o más copias de ${requirement.sourceLabel}`
  }

  if (requirement.distinct) {
    return requirement.count === 1
      ? `abrís 1 nombre distinto de ${requirement.sourceLabel}`
      : `abrís ${requirement.count} nombres distintos de ${requirement.sourceLabel}`
  }

  return requirement.count === 1
    ? `abrís 1 copia de ${requirement.sourceLabel}`
    : `abrís ${requirement.count} copias de ${requirement.sourceLabel}`
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
  const copiesMatched = requirement.keys.reduce(
    (total, key) => total + countOperations.getCount(counts, key),
    0,
  )
  const distinctMatched = requirement.keys.reduce(
    (total, key) => total + (countOperations.getCount(counts, key) > 0 ? 1 : 0),
    0,
  )

  if (requirement.kind === 'exclude') {
    return requirement.distinct ? distinctMatched < requirement.count : copiesMatched < requirement.count
  }

  return requirement.distinct ? distinctMatched >= requirement.count : copiesMatched >= requirement.count
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

    return right.count - left.count
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
    if (candidateKeys.length < requirement.count) {
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

    collectDistinct(0, requirement.count, [])
    return usages
  }

  const totalAvailable = candidateKeys.reduce(
    (total, key) => total + countOperations.getCount(counts, key),
    0,
  )

  if (totalAvailable < requirement.count) {
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

  collectCopies(0, requirement.count, [])
  return usages
}
