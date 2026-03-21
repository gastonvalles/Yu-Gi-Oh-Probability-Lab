import { buildDerivedDeckGroupMap, resolveRequirementCardIds } from './app/deck-groups'
import { normalizeHandPatternCategory } from './app/patterns'
import type {
  CalculationOutput,
  CalculationSummary,
  CalculatorState,
  CardEntry,
  HandPattern,
  HandPatternCategory,
  PatternMatchMode,
  PatternProbability,
  RequirementKind,
  ValidationIssue,
} from './types'

interface CalculationCard {
  id: string
  name: string
  copies: number
}

interface ResolvedRequirement {
  sourceLabel: string
  cardIds: string[]
  count: number
  kind: RequirementKind
  distinct: boolean
  indices: number[]
  names: string[]
  possible: boolean
}

interface ResolvedPattern {
  id: string
  name: string
  category: HandPatternCategory
  requirementLabel: string
  requirements: ResolvedRequirement[]
  possible: boolean
  requiredMatches: number
  matchMode: PatternMatchMode
  allowSharedCards: boolean
}

export function calculateProbabilities(state: CalculatorState): CalculationOutput {
  const issues = validateState(state)
  const blockingIssues = issues.filter((issue) => issue.level === 'error')

  if (blockingIssues.length > 0) {
    return {
      issues,
      blockingIssues,
      summary: null,
    }
  }

  return {
    issues,
    blockingIssues: [],
    summary: buildSummary(state),
  }
}

function validateState(state: CalculatorState): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!Number.isInteger(state.deckSize) || state.deckSize < 1) {
    issues.push({
      level: 'error',
      message: 'El tamaño del deck debe ser un entero positivo.',
    })
  }

  if (!Number.isInteger(state.handSize) || state.handSize < 1) {
    issues.push({
      level: 'error',
      message: 'El tamaño de la mano inicial debe ser un entero positivo.',
    })
  }

  if (Number.isInteger(state.deckSize) && (state.deckSize < 40 || state.deckSize > 60)) {
    issues.push({
      level: 'warning',
      message: 'En Yu-Gi-Oh! el Main Deck suele estar entre 40 y 60 cartas.',
    })
  }

  if (state.handSize > state.deckSize) {
    issues.push({
      level: 'error',
      message: 'La mano inicial no puede ser más grande que el deck.',
    })
  }

  if (state.cards.length === 0) {
    issues.push({
      level: 'error',
      message: 'Agregá al menos una carta o grupo de cartas.',
    })
  }

  const normalizedNames = new Map<string, string>()

  for (const card of state.cards) {
    const trimmedName = card.name.trim()

    if (trimmedName.length === 0) {
      issues.push({
        level: 'error',
        message: 'Cada carta o grupo debe tener un nombre.',
      })
      continue
    }

    const normalizedName = trimmedName.toLowerCase()
    if (normalizedNames.has(normalizedName)) {
      issues.push({
        level: 'error',
        message: `El nombre "${trimmedName}" está repetido. Usá nombres únicos para evitar ambigüedad.`,
      })
    } else {
      normalizedNames.set(normalizedName, trimmedName)
    }

    if (!Number.isInteger(card.copies) || card.copies < 0) {
      issues.push({
        level: 'error',
        message: `La cantidad de "${trimmedName}" debe ser un entero mayor o igual a 0.`,
      })
    }
  }

  const definedCopies = state.cards.reduce((total, card) => total + Math.max(0, card.copies), 0)

  if (definedCopies > state.deckSize) {
    issues.push({
      level: 'error',
      message: 'La suma de copias definidas supera el tamaño del deck.',
    })
  }

  if (definedCopies < state.deckSize) {
    issues.push({
      level: 'warning',
      message: `Faltan ${state.deckSize - definedCopies} cartas. Se tratarán como "Otras cartas".`,
    })
  }

  if (state.patterns.length === 0) {
    issues.push({
      level: 'error',
      message: 'Agregá al menos un chequeo de apertura o problema.',
    })
  }

  const cardById = new Map(state.cards.map((card) => [card.id, card]))
  const groupsByKey = buildDerivedDeckGroupMap(state.cards)

  for (const pattern of state.patterns) {
    if (pattern.requirements.length === 0) {
      issues.push({
        level: 'error',
        message: `El patrón "${pattern.name || 'sin nombre'}" no tiene requisitos.`,
      })
      continue
    }

    const requiredMatches = getRequiredMatches(pattern)

    if (requiredMatches > pattern.requirements.length) {
      issues.push({
        level: 'error',
        message: `El patrón "${pattern.name || 'sin nombre'}" pide más requisitos de los que existen.`,
      })
    }

    for (const requirement of pattern.requirements) {
      const patternName = pattern.name || 'sin nombre'

      if (requirement.source === 'group') {
        if (!requirement.groupKey) {
          issues.push({
            level: 'error',
            message: `El patrón "${patternName}" tiene una condición sin grupo seleccionado.`,
          })
          continue
        }
      }

      const uniqueCardIds = resolveRequirementCardIds(requirement, groupsByKey)

      if (uniqueCardIds.length === 0) {
        issues.push(
          requirement.source === 'group'
            ? {
                level: 'warning',
                message: `El patrón "${patternName}" usa un grupo vacío. Marcá roles en el deck o elegí otro grupo.`,
              }
            : {
                level: 'error',
                message: `El patrón "${patternName}" tiene un requisito sin cartas seleccionadas.`,
              },
        )
        continue
      }

      if (!Number.isInteger(requirement.count) || requirement.count < 1) {
        issues.push({
          level: 'error',
          message: `El patrón "${patternName}" tiene una cantidad inválida en uno de sus requisitos.`,
        })
      }

      const cards = uniqueCardIds.map((cardId) => cardById.get(cardId)).filter((card): card is CardEntry => Boolean(card))

      if (cards.length !== uniqueCardIds.length) {
        issues.push({
          level: 'error',
          message: `El patrón "${patternName}" referencia una carta que ya no existe.`,
        })
        continue
      }

      if (requirement.kind === 'include') {
        const totalCopies = cards.reduce((total, card) => total + card.copies, 0)
        const distinctAvailable = cards.filter((card) => card.copies > 0).length

        if (requirement.distinct) {
          if (distinctAvailable < requirement.count) {
            issues.push({
              level: 'warning',
              message: `El patrón "${patternName}" pide ${requirement.count} nombre${requirement.count === 1 ? '' : 's'} distinto${requirement.count === 1 ? '' : 's'} en una pool que solo tiene ${distinctAvailable}.`,
            })
          }
        } else if (totalCopies < requirement.count) {
          issues.push({
            level: 'warning',
            message: `El patrón "${patternName}" pide ${requirement.count} copias en una pool que solo suma ${totalCopies}.`,
          })
        }
      }

      if (requirement.count > state.handSize && requirement.kind === 'include') {
        issues.push({
          level: 'warning',
          message: `El patrón "${patternName}" exige más cartas de las que entran en la mano inicial.`,
        })
      }
    }
  }

  return dedupeIssues(issues)
}

function buildSummary(state: CalculatorState): CalculationSummary {
  const cardById = new Map(state.cards.map((card) => [card.id, card]))
  const groupsByKey = buildDerivedDeckGroupMap(state.cards)
  const referencedCardIds = new Set<string>()

  for (const pattern of state.patterns) {
    for (const requirement of pattern.requirements) {
      for (const cardId of resolveRequirementCardIds(requirement, groupsByKey)) {
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
  const resolvedPatterns = state.patterns.map((pattern) =>
    resolvePattern(pattern, cardById, relevantIndex, groupsByKey, relevantCards.map((card) => card.copies)),
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
        if (matchesPattern(pattern, counts)) {
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

function resolvePattern(
  pattern: HandPattern,
  cardById: Map<string, CardEntry>,
  relevantIndex: Map<string, number>,
  groupsByKey: ReturnType<typeof buildDerivedDeckGroupMap>,
  availableCounts: number[],
): ResolvedPattern {
  const requirements: ResolvedRequirement[] = pattern.requirements.map((requirement) => {
    const uniqueCardIds = resolveRequirementCardIds(requirement, groupsByKey)
    const cards = uniqueCardIds.map((cardId) => cardById.get(cardId)).filter((card): card is CardEntry => Boolean(card))
    const indices = uniqueCardIds.flatMap((cardId) => {
      const index = relevantIndex.get(cardId)
      return index === undefined ? [] : [index]
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
          ? groupsByKey.get(requirement.groupKey)?.label ?? 'Grupo eliminado'
          : cards.length === 1
            ? cards[0].name.trim()
            : `(${cards.length > 0 ? cards.map((card) => card.name.trim()).join(' / ') : 'Pool vacía'})`,
      cardIds: uniqueCardIds,
      count: requirement.count,
      kind: requirement.kind,
      distinct: requirement.distinct,
      indices,
      names: cards.map((card) => card.name.trim()),
      possible,
    }
  })

  const requiredMatches = getRequiredMatches(pattern)
  const possibleRequirementCount = getMatchedRequirementCount(requirements, availableCounts, pattern.allowSharedCards)

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

function buildPatternRequirementLabel(
  matchMode: PatternMatchMode,
  requiredMatches: number,
  requirements: ResolvedRequirement[],
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

function formatRequirementPhrase(requirement: ResolvedRequirement): string {
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

function matchesPattern(pattern: ResolvedPattern, counts: number[]): boolean {
  return getMatchedRequirementCount(pattern.requirements, counts, pattern.allowSharedCards) >= pattern.requiredMatches
}

function matchesRequirement(requirement: ResolvedRequirement, counts: number[]): boolean {
  const copiesMatched = requirement.indices.reduce((total, index) => total + (counts[index] ?? 0), 0)
  const distinctMatched = requirement.indices.reduce(
    (total, index) => total + ((counts[index] ?? 0) > 0 ? 1 : 0),
    0,
  )

  if (requirement.kind === 'exclude') {
    return requirement.distinct ? distinctMatched < requirement.count : copiesMatched < requirement.count
  }

  return requirement.distinct ? distinctMatched >= requirement.count : copiesMatched >= requirement.count
}

function getMatchedRequirementCount(
  requirements: ResolvedRequirement[],
  counts: number[],
  allowSharedCards: boolean,
): number {
  const excludeMatched = requirements.reduce(
    (total, requirement) =>
      requirement.kind === 'exclude' && matchesRequirement(requirement, counts) ? total + 1 : total,
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
        (total, requirement) => (matchesRequirement(requirement, counts) ? total + 1 : total),
        0,
      )
    )
  }

  return excludeMatched + getMaxMatchedIncludeRequirements(includeRequirements, counts)
}

function getMaxMatchedIncludeRequirements(
  requirements: ResolvedRequirement[],
  counts: number[],
): number {
  const orderedRequirements = [...requirements].sort((left, right) => {
    const leftAvailable = left.indices.length
    const rightAvailable = right.indices.length

    if (leftAvailable !== rightAvailable) {
      return leftAvailable - rightAvailable
    }

    if (left.distinct !== right.distinct) {
      return left.distinct ? -1 : 1
    }

    return right.count - left.count
  })
  const memo = new Map<string, number>()

  const visit = (index: number, availableCounts: number[]): number => {
    if (index >= orderedRequirements.length) {
      return 0
    }

    const key = `${index}|${availableCounts.join(',')}`
    const cached = memo.get(key)

    if (cached !== undefined) {
      return cached
    }

    let best = visit(index + 1, availableCounts)

    for (const usage of getRequirementUsages(orderedRequirements[index], availableCounts)) {
      const nextCounts = [...availableCounts]

      for (const [cardIndex, usedCopies] of usage) {
        nextCounts[cardIndex] -= usedCopies
      }

      best = Math.max(best, 1 + visit(index + 1, nextCounts))
    }

    memo.set(key, best)
    return best
  }

  return visit(0, counts)
}

function getRequirementUsages(
  requirement: ResolvedRequirement,
  availableCounts: number[],
): Array<Array<[number, number]>> {
  const candidateIndices = requirement.indices.filter((index) => (availableCounts[index] ?? 0) > 0)

  if (requirement.distinct) {
    if (candidateIndices.length < requirement.count) {
      return []
    }

    const usages: Array<Array<[number, number]>> = []

    const collectDistinct = (
      startIndex: number,
      remaining: number,
      currentUsage: Array<[number, number]>,
    ): void => {
      if (remaining === 0) {
        usages.push([...currentUsage])
        return
      }

      for (let index = startIndex; index <= candidateIndices.length - remaining; index += 1) {
        currentUsage.push([candidateIndices[index], 1])
        collectDistinct(index + 1, remaining - 1, currentUsage)
        currentUsage.pop()
      }
    }

    collectDistinct(0, requirement.count, [])
    return usages
  }

  const totalAvailable = candidateIndices.reduce((total, index) => total + (availableCounts[index] ?? 0), 0)

  if (totalAvailable < requirement.count) {
    return []
  }

  const usages: Array<Array<[number, number]>> = []

  const collectCopies = (
    cardPosition: number,
    remaining: number,
    currentUsage: Array<[number, number]>,
  ): void => {
    if (remaining === 0) {
      usages.push([...currentUsage])
      return
    }

    if (cardPosition >= candidateIndices.length) {
      return
    }

    const currentIndex = candidateIndices[cardPosition]
    const available = Math.min(availableCounts[currentIndex] ?? 0, remaining)
    const remainingCapacity = candidateIndices
      .slice(cardPosition + 1)
      .reduce((total, index) => total + (availableCounts[index] ?? 0), 0)

    for (let usedCopies = available; usedCopies >= 0; usedCopies -= 1) {
      if (usedCopies === 0 && remaining > remainingCapacity) {
        continue
      }

      if (usedCopies > 0) {
        currentUsage.push([currentIndex, usedCopies])
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

function getRequiredMatches(pattern: HandPattern): number {
  if (pattern.matchMode === 'any') {
    return 1
  }

  if (pattern.matchMode === 'all') {
    return pattern.requirements.length
  }

  return Math.max(1, Math.min(pattern.minimumMatches, Math.max(pattern.requirements.length, 1)))
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

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  const uniqueIssues: ValidationIssue[] = []

  for (const issue of issues) {
    const key = `${issue.level}:${issue.message}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    uniqueIssues.push(issue)
  }

  return uniqueIssues
}
