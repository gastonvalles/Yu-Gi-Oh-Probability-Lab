import type { CardEntry, HandPattern, Matcher, PatternCondition } from '../types'
import { buildDerivedDeckGroupMap } from './deck-groups'
import { getPatternDefinitionKey, getPatternMatchMode, normalizeHandPatternCategory, normalizeReusePolicy, normalizeTurnContext, resolveConditionCardIds, resolvePatternLogic } from './patterns'

/** Normaliza las reglas propias: descarta las rotas o duplicadas y ajusta la lógica. */
interface CuratePatternsOptions {
  /**
   * Al guardar (mantenimiento), una regla que pide una carta ausente se conserva intacta
   * para que vuelva a funcionar si la carta vuelve al deck. Al evaluar, se deja afuera.
   */
  keepRulesWithMissingCards?: boolean
}

export function curatePatterns(
  patterns: HandPattern[],
  cards: CardEntry[],
  { keepRulesWithMissingCards = false }: CuratePatternsOptions = {},
): HandPattern[] {
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const groupsByKey = buildDerivedDeckGroupMap(cards)
  const nextPatterns: HandPattern[] = []
  const seenPatternKeys = new Set<string>()

  for (const pattern of patterns) {
    if (hasMissingRequiredCards(pattern, cardById)) {
      if (keepRulesWithMissingCards) {
        nextPatterns.push(pattern)
      }
      continue
    }

    const curatedPattern = curatePattern(pattern, cardById, groupsByKey, cards)

    if (!curatedPattern) {
      continue
    }

    const patternKey = getPatternSignature(curatedPattern)

    if (seenPatternKeys.has(patternKey)) {
      continue
    }

    seenPatternKeys.add(patternKey)
    nextPatterns.push(curatedPattern)
  }

  return nextPatterns
}

/**
 * La regla pide (incluye) una carta que ya no está en el deck: una carta puntual ausente
 * o un pool sin ninguna carta presente. Evaluarla sin esa condición cambiaría su sentido.
 */
export function hasMissingRequiredCards(pattern: HandPattern, cardById: ReadonlyMap<string, CardEntry>): boolean {
  return pattern.conditions.some((condition) => {
    const { matcher } = condition

    if (condition.kind === 'exclude' || !matcher) {
      return false
    }

    if (matcher.type === 'card') {
      return !cardById.has(matcher.value)
    }

    return matcher.type === 'card_pool' && matcher.value.length > 0 && !matcher.value.some((cardId) => cardById.has(cardId))
  })
}

export function getPatternCollectionSignature(patterns: HandPattern[]): string {
  return JSON.stringify(patterns.map((pattern) => ({
    id: pattern.id,
    name: pattern.name,
    kind: pattern.kind,
    turnContext: pattern.turnContext,
    logic: pattern.logic,
    minimumConditionMatches: pattern.minimumConditionMatches,
    reusePolicy: pattern.reusePolicy,
    needsReview: pattern.needsReview === true,
    conditions: pattern.conditions.map((condition) => ({
      id: condition.id,
      matcher: condition.matcher,
      quantity: condition.quantity,
      kind: condition.kind,
      distinct: condition.distinct === true,
    })),
  })))
}

function curatePattern(
  pattern: HandPattern,
  cardById: Map<string, CardEntry>,
  groupsByKey: ReturnType<typeof buildDerivedDeckGroupMap>,
  cards: CardEntry[],
): HandPattern | null {
  if (pattern.needsReview) {
    return null
  }

  // Preserve freshly created patterns that haven't been configured yet.
  // These have an empty name and all conditions have null matchers.
  const isJustCreated = pattern.name.trim().length === 0
    && pattern.conditions.length > 0
    && pattern.conditions.every((c) => c.matcher === null)

  if (isJustCreated) {
    return pattern
  }

  // Detect active-editing state: pattern has a mix of configured and unconfigured conditions.
  const isBeingEdited = pattern.conditions.some(c => c.matcher === null)
    && pattern.conditions.some(c => c.matcher !== null)

  const conditions: PatternCondition[] = []
  const seenConditionKeys = new Set<string>()

  for (const condition of pattern.conditions) {
    const curatedCondition = curateCondition(condition, cardById)

    if (!curatedCondition) {
      // When actively editing, preserve unconfigured conditions (matcher === null) as-is.
      if (isBeingEdited && condition.matcher === null) {
        const conditionKey = getConditionSignature(condition)

        if (seenConditionKeys.has(conditionKey)) {
          continue
        }

        seenConditionKeys.add(conditionKey)
        conditions.push(condition)
      }

      continue
    }

    const resolvedCardIds = resolveConditionCardIds(curatedCondition, groupsByKey, cards)
    const hasDirectMatcher = curatedCondition.matcher?.type === 'card' || curatedCondition.matcher?.type === 'card_pool'

    if (hasDirectMatcher && resolvedCardIds.length === 0) {
      continue
    }

    const conditionKey = getConditionSignature(curatedCondition)

    if (seenConditionKeys.has(conditionKey)) {
      continue
    }

    seenConditionKeys.add(conditionKey)
    conditions.push(curatedCondition)
  }

  if (conditions.length === 0) {
    return null
  }

  const matchMode = getPatternMatchMode({
    logic: pattern.logic,
    minimumConditionMatches: pattern.minimumConditionMatches,
    conditions,
  })
  const { logic, minimumConditionMatches } = resolvePatternLogic(
    matchMode,
    conditions.length,
    pattern.minimumConditionMatches,
  )
  const kind = normalizeHandPatternCategory(pattern.kind)
  const name = isBeingEdited && pattern.name.trim().length === 0
    ? ''
    : pattern.name.replace(/\s+/g, ' ').trim() || (kind === 'opening'
      ? 'Salida sin nombre'
      : 'Problema sin nombre')
  return {
    ...pattern,
    name,
    kind,
    turnContext: normalizeTurnContext(pattern.turnContext),
    logic,
    minimumConditionMatches,
    reusePolicy: normalizeReusePolicy(pattern.reusePolicy),
    needsReview: false,
    conditions,
  }
}

function curateCondition(
  condition: PatternCondition,
  cardById: Map<string, CardEntry>,
): PatternCondition | null {
  const matcher = curateMatcher(condition.matcher, cardById)
  const quantity = Number.isInteger(condition.quantity) ? condition.quantity : NaN

  if (!matcher || !Number.isInteger(quantity) || quantity < 1) {
    return null
  }

  return {
    ...condition,
    matcher,
    quantity,
    kind: condition.kind === 'exclude' ? 'exclude' : 'include',
    distinct: condition.distinct === true,
  }
}

function curateMatcher(
  matcher: Matcher | null,
  cardById: Map<string, CardEntry>,
): Matcher | null {
  if (!matcher) {
    return null
  }

  if (matcher.type === 'card') {
    return cardById.has(matcher.value) ? matcher : null
  }

  if (matcher.type === 'card_pool') {
    const cardIds = [...new Set(matcher.value.filter((cardId) => cardById.has(cardId)))]

    if (cardIds.length === 0) {
      return null
    }

    return cardIds.length === 1
      ? { type: 'card', value: cardIds[0] }
      : { type: 'card_pool', value: cardIds }
  }

  return matcher
}

function getConditionSignature(
  condition: Pick<PatternCondition, 'matcher' | 'quantity' | 'kind' | 'distinct'>,
): string {
  return JSON.stringify({
    matcher: condition.matcher,
    quantity: condition.quantity,
    kind: condition.kind,
    distinct: condition.distinct === true,
  })
}

function getPatternSignature(
  pattern: Pick<HandPattern, 'kind' | 'turnContext' | 'logic' | 'minimumConditionMatches' | 'reusePolicy' | 'conditions'>,
): string {
  return getPatternDefinitionKey(pattern)
}
