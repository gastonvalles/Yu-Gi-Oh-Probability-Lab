import type { CardEntry, HandPattern, Matcher, PatternCondition } from '../types'
import { buildDerivedDeckGroupMap } from './deck-groups'
import { getPatternDefinitionKey, getPatternMatchMode, normalizeHandPatternCategory, normalizeReusePolicy, resolveConditionCardIds, resolvePatternLogic } from './patterns'
import { buildDefaultPatterns } from './pattern-defaults'
import { buildPatternPresets, isObsoleteSystemPatternName } from './pattern-presets'

interface CuratePatternsOptions {
  includeDefaults?: boolean
}

export function curatePatterns(
  patterns: HandPattern[],
  cards: CardEntry[],
  options: CuratePatternsOptions = {},
): HandPattern[] {
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const groupsByKey = buildDerivedDeckGroupMap(cards)
  const currentSystemPatternKeys = new Set(
    buildPatternPresets(cards).map((preset) => getPatternDefinitionKey(preset.pattern)),
  )
  const nextPatterns: HandPattern[] = []
  const seenPatternKeys = new Set<string>()
  const incomingPatterns = options.includeDefaults === false
    ? patterns
    : [...patterns, ...buildDefaultPatterns(cards)]

  for (const pattern of incomingPatterns) {
    const curatedPattern = curatePattern(
      pattern,
      cardById,
      groupsByKey,
      cards,
      currentSystemPatternKeys,
    )

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

export function getPatternCollectionSignature(patterns: HandPattern[]): string {
  return JSON.stringify(patterns.map((pattern) => ({
    id: pattern.id,
    name: pattern.name,
    kind: pattern.kind,
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
  currentSystemPatternKeys: Set<string>,
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

  const conditions: PatternCondition[] = []
  const seenConditionKeys = new Set<string>()

  for (const condition of pattern.conditions) {
    const curatedCondition = curateCondition(condition, cardById)

    if (!curatedCondition) {
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
  const name = pattern.name.replace(/\s+/g, ' ').trim() || (kind === 'opening'
    ? 'Salida sin nombre'
    : 'Problema sin nombre')
  const nextPattern: HandPattern = {
    ...pattern,
    name,
    kind,
    logic,
    minimumConditionMatches,
    reusePolicy: normalizeReusePolicy(pattern.reusePolicy),
    needsReview: false,
    conditions,
  }
  const definitionKey = getPatternDefinitionKey(nextPattern)

  if (isObsoleteSystemPatternName(name) && !currentSystemPatternKeys.has(definitionKey)) {
    return null
  }

  return nextPattern
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
  pattern: Pick<HandPattern, 'kind' | 'logic' | 'minimumConditionMatches' | 'reusePolicy' | 'conditions'>,
): string {
  return getPatternDefinitionKey(pattern)
}
