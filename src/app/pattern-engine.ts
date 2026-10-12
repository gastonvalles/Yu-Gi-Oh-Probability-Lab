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
import { t } from '../i18n'
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
  /** `source` 'type' junta dos cosas: el tipo de carta (Monstruo, Magia, Trampa) y el tipo de monstruo. Esto distingue la primera, sin leer el rótulo. */
  cardType?: boolean
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

interface RequirementMatchWitness<Key extends string | number> {
  requirementId: string
  sourceLabel: string
  kind: RequirementKind
  usage: Array<[Key, number]>
}

interface PatternMatchWitness<Key extends string | number> {
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
    // Varias cartas pueden compartir clave (clases equivalentes): se cuenta una vez.
    const keys = [
      ...new Set(
        uniqueCardIds.flatMap((cardId) => {
          const key = context.mapCardIdToKey(cardId)
          return key === null ? [] : [key]
        }),
      ),
    ]
    const totalCopies = cards.reduce((total, card) => total + card.copies, 0)
    const distinctAvailable = cards.filter((card) => card.copies > 0).length
    const possible =
      condition.kind === 'exclude'
        ? true
        : keys.length === 0
          ? false
          : condition.distinct
            ? distinctAvailable >= condition.quantity
            : totalCopies >= condition.quantity

    return {
      id: condition.id,
      sourceLabel: buildConditionSourceLabel(condition, cards, context.groupsByKey),
      source: getConditionSource(condition),
      cardType: condition.matcher?.type === 'card_type',
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
    name: pattern.name.trim() || t('rules.engine.unnamedRule'),
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

function buildPatternRequirementLabel<Key extends string | number>(
  matchMode: PatternMatchMode,
  requiredMatches: number,
  requirements: ResolvedRequirement<Key>[],
  allowSharedCards: boolean,
): string {
  if (requirements.length === 0) {
    return t('rules.engine.noRequirements')
  }

  const requirementLabels = requirements.map((requirement) => formatRequirementPhrase(requirement))
  // Con una sola condición no hay nada que repartir: sólo se aclara "sin reutilizar la misma carta" cuando son dos o más.
  const separate = !allowSharedCards && requirementLabels.length >= 2

  if (matchMode === 'all') {
    return t(separate ? 'rules.engine.label.allSeparate' : 'rules.engine.label.all', {
      conditions: requirementLabels.join(` ${t('rules.engine.joinAnd')} `),
    })
  }

  if (matchMode === 'any') {
    return t(separate ? 'rules.engine.label.anySeparate' : 'rules.engine.label.any', {
      conditions: requirementLabels.join(` ${t('rules.engine.joinOr')} `),
    })
  }

  return t(separate ? 'rules.engine.label.atLeastSeparate' : 'rules.engine.label.atLeast', {
    required: requiredMatches,
    conditions: requirementLabels.join(', '),
  })
}

/**
 * ¿La mano cumple la regla? Mismo resultado que `getMatchedRequirementCount(...) >= requiredMatches`,
 * pero sin calcular el máximo cuando no hace falta: es lo que corre millones de veces en el cálculo
 * exacto, así que sólo se hace la búsqueda con cartas repartidas entre condiciones cuando de verdad
 * hay duda (2 o más condiciones que no pueden compartir cartas).
 */
/**
 * `excludeCounts` es la mano que ven las condiciones "sin": por defecto la misma. Un problema evaluado
 * con cartas rescatadas descontadas sigue viendo la mano completa en sus "sin" (rescatar no puede crear un problema).
 */
export function matchesResolvedPattern<Counts, Key extends string | number>(
  pattern: Pick<ResolvedPattern<Key>, 'requirements' | 'allowSharedCards' | 'requiredMatches'>,
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
  excludeCounts: Counts = counts,
): boolean {
  let excludeMatched = 0
  let includeCount = 0
  const matchedIncludes: ResolvedRequirement<Key>[] = []

  for (const requirement of pattern.requirements) {
    const matches = matchesRequirement(requirement, requirement.kind === 'exclude' ? excludeCounts : counts, countOperations)

    if (requirement.kind === 'exclude') {
      excludeMatched += matches ? 1 : 0
      continue
    }

    includeCount += 1

    if (matches) {
      matchedIncludes.push(requirement)
    }
  }

  const needed = pattern.requiredMatches - excludeMatched

  if (needed <= 0) {
    return true
  }

  if (matchedIncludes.length < needed) {
    return false
  }

  // Una sola condición alcanza, o pueden compartir cartas: no hay nada que repartir.
  if (needed === 1 || pattern.allowSharedCards || includeCount === 1) {
    return true
  }

  // Las condiciones que no se cumplen solas tampoco se cumplen con menos cartas: se descartan.
  return getMaxMatchedIncludeRequirements(matchedIncludes, counts, countOperations) >= needed
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

/**
 * Todas las formas distintas de cumplir una regla con las cartas de la mano ("casos"), cada una
 * como las cartas que usa. Se elige el mínimo de condiciones necesarias y, para las que piden una
 * sola carta, se prueba cada carta que puede cubrirla. Una condición que pide varias ("2+ del
 * arquetipo X") no se parte en combinaciones: cuenta como un único caso con todas las cartas de
 * la mano que la cumplen. Se corta en `limit` casos para no explotar con manos raras.
 */
export function enumeratePatternCases<Counts, Key extends string | number>(
  pattern: Pick<ResolvedPattern<Key>, 'requirements' | 'allowSharedCards' | 'requiredMatches'>,
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
  limit = 24,
): Array<Array<[Key, number]>> {
  const excludeMatched = pattern.requirements.filter(
    (requirement) => requirement.kind === 'exclude' && matchesRequirement(requirement, counts, countOperations),
  ).length
  const includeRequirements = pattern.requirements.filter((requirement) => requirement.kind === 'include')
  const needed = Math.max(0, pattern.requiredMatches - excludeMatched)

  if (needed > includeRequirements.length) {
    return []
  }

  const shared = pattern.allowSharedCards || includeRequirements.length <= 1
  const cases = new Map<string, Array<[Key, number]>>()

  /** Suma a lo usado todas las cartas de la mano que también cumplen las condiciones de "varias". */
  const record = (
    usage: Map<Key, number>,
    picked: ResolvedRequirement<Key>[],
    remaining: Counts,
  ) => {
    const expanded = new Map(usage)
    const leftover = shared ? counts : countOperations.cloneCounts(remaining)

    for (const requirement of picked) {
      if (requirement.quantity <= 1) {
        continue
      }

      for (const key of requirement.keys) {
        const inHand = countOperations.getCount(leftover, key)

        if (inHand <= 0) {
          continue
        }

        if (shared) {
          expanded.set(key, Math.max(expanded.get(key) ?? 0, inHand))
        } else {
          expanded.set(key, (expanded.get(key) ?? 0) + inHand)
          countOperations.consumeCount(leftover, key, inHand)
        }
      }
    }

    const entries = [...expanded.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)))
    cases.set(entries.map(([key, copies]) => `${key}:${copies}`).join('|'), entries)
  }

  const visit = (
    start: number,
    available: Counts,
    usage: Map<Key, number>,
    picked: ResolvedRequirement<Key>[],
  ): void => {
    if (cases.size >= limit) {
      return
    }

    if (picked.length === needed) {
      record(usage, picked, available)
      return
    }

    for (let index = start; index <= includeRequirements.length - (needed - picked.length); index += 1) {
      for (const option of getRequirementUsages(includeRequirements[index], available, countOperations)) {
        const nextUsage = new Map(usage)
        let nextAvailable = available

        if (!shared) {
          nextAvailable = countOperations.cloneCounts(available)
        }

        for (const [key, copies] of option) {
          nextUsage.set(key, shared ? Math.max(nextUsage.get(key) ?? 0, copies) : (nextUsage.get(key) ?? 0) + copies)

          if (!shared) {
            countOperations.consumeCount(nextAvailable, key, copies)
          }
        }

        visit(index + 1, nextAvailable, nextUsage, [...picked, includeRequirements[index]])

        if (cases.size >= limit) {
          return
        }
      }
    }
  }

  visit(0, counts, new Map(), [])
  return [...cases.values()]
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
    return group ? getQualifiedDeckGroupLabel(group) : t('rules.engine.groupDeleted')
  }

  if (isMonsterPropertyMatcher(condition.matcher)) {
    return getMonsterRequirementSourceLabel(condition.matcher) ?? t('rules.engine.monsterFilter')
  }

  if (condition.matcher?.type === 'archetype') {
    return t('rules.engine.archetype', { name: condition.matcher.value })
  }

  if (condition.matcher?.type === 'card_type') {
    return t(
      condition.matcher.value === 'monster'
        ? 'rules.engine.cardType.monster'
        : condition.matcher.value === 'spell'
          ? 'rules.engine.cardType.spell'
          : 'rules.engine.cardType.trap',
    )
  }

  const cardIds = getConditionCardIds(condition)

  if (cardIds.length === 1 && cards.length === 1) {
    return cards[0].name.trim()
  }

  return `(${cards.length > 0 ? cards.map((card) => card.name.trim()).join(' / ') : t('rules.engine.emptyPool')})`
}

// Cada condición se dice distinto según lo que cuenta: cartas (puntuales, pools, grupos, arquetipos), monstruos por una
// propiedad (atributo, nivel, tipo, ATK, DEF) o un tipo de carta. Las tablas guardan claves; el texto se arma al pedirlo.
const REQUIREMENT_PHRASE_KEY = {
  cards: {
    include: { copies: 'rules.engine.phrase.cards.includeCopies', names: 'rules.engine.phrase.cards.includeNames' },
    exclude: { copies: 'rules.engine.phrase.cards.excludeCopies', names: 'rules.engine.phrase.cards.excludeNames' },
  },
  monster: {
    include: { copies: 'rules.engine.phrase.monster.includeCopies', names: 'rules.engine.phrase.monster.includeNames' },
    exclude: { copies: 'rules.engine.phrase.monster.excludeCopies', names: 'rules.engine.phrase.monster.excludeNames' },
  },
  cardType: {
    include: { copies: 'rules.engine.phrase.cardType.includeCopies', names: 'rules.engine.phrase.cardType.includeNames' },
    exclude: { copies: 'rules.engine.phrase.cardType.excludeCopies', names: 'rules.engine.phrase.cardType.excludeNames' },
  },
} as const

function formatRequirementPhrase<Key extends string | number>(requirement: ResolvedRequirement<Key>): string {
  const family = requirement.source === 'cards' || requirement.source === 'group' ? 'cards' : requirement.cardType ? 'cardType' : 'monster'

  return t(REQUIREMENT_PHRASE_KEY[family][requirement.kind][requirement.distinct ? 'names' : 'copies'], {
    count: requirement.quantity,
    label: requirement.sourceLabel,
  })
}

function matchesRequirement<Counts, Key extends string | number>(
  requirement: ResolvedRequirement<Key>,
  counts: Counts,
  countOperations: CountOperations<Counts, Key>,
): boolean {
  if (requirement.keys.length === 0) {
    return requirement.kind === 'exclude'
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
