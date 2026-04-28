import type {
  CardAttribute,
  CardGroupKey,
  CardEntry,
  HandPattern,
  HandPatternCategory,
  Matcher,
  PatternCondition,
  PatternKind,
  PatternLogic,
  PatternMatchMode,
  RequirementSource,
  ReusePolicy,
} from '../types'
import {
  createOriginGroupKey,
  createRoleGroupKey,
  isCardOriginGroupKey,
  serializeGroupKey,
  type DerivedDeckGroup,
} from './deck-groups'
import { matchesMonsterRequirementCard } from './card-attributes'

export function normalizeHandPatternCategory(
  kind: HandPatternCategory | 'good' | 'bad' | null | undefined,
): HandPatternCategory {
  return kind === 'problem' || kind === 'bad' ? 'problem' : 'opening'
}

export function normalizePatternLogic(value: unknown): PatternLogic {
  return value === 'all' ? 'all' : 'any'
}

export function normalizeReusePolicy(value: unknown): ReusePolicy {
  return value === 'allow' ? 'allow' : value === 'forbid' ? 'forbid' : 'forbid'
}

export function normalizePatternName(name: string): string {
  return name
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC')
    .toLowerCase()
}

export function getPatternDefinitionKey(
  pattern: Pick<HandPattern, 'kind' | 'logic' | 'minimumConditionMatches' | 'reusePolicy'> & {
    conditions: Pick<PatternCondition, 'matcher' | 'quantity' | 'kind' | 'distinct'>[]
  },
): string {
  const conditionKeys = pattern.conditions
    .map((condition) => getConditionDefinitionKey(condition))
    .sort()

  return JSON.stringify({
    conditions: conditionKeys,
    kind: normalizeHandPatternCategory(pattern.kind),
    logic: normalizePatternLogic(pattern.logic),
    minimumConditionMatches: pattern.minimumConditionMatches,
    reusePolicy: pattern.reusePolicy,
  })
}

export function getPatternCategorySingular(
  kind: HandPatternCategory | 'good' | 'bad' | null | undefined,
): string {
  return normalizeHandPatternCategory(kind) === 'problem' ? 'problema' : 'salida'
}

export function getPatternCategoryPlural(
  kind: HandPatternCategory | 'good' | 'bad' | null | undefined,
): string {
  return normalizeHandPatternCategory(kind) === 'problem' ? 'problemas' : 'salidas'
}

export function getPatternCategoryShortLabel(
  kind: HandPatternCategory | 'good' | 'bad' | null | undefined,
): string {
  return normalizeHandPatternCategory(kind) === 'problem' ? 'Problema' : 'Salida'
}

export function getPatternMatchMode(
  pattern: Pick<HandPattern, 'logic' | 'minimumConditionMatches' | 'conditions'>,
): PatternMatchMode {
  if (pattern.logic === 'all') {
    return 'all'
  }

  return normalizeMinimumConditionMatches(pattern) > 1 ? 'at-least' : 'any'
}

export function resolvePatternLogic(
  mode: PatternMatchMode,
  conditionCount: number,
  currentMinimumConditionMatches: number,
): Pick<HandPattern, 'logic' | 'minimumConditionMatches'> {
  if (mode === 'all') {
    return {
      logic: 'all',
      minimumConditionMatches: Math.max(conditionCount, 1),
    }
  }

  if (mode === 'any') {
    return {
      logic: 'any',
      minimumConditionMatches: 1,
    }
  }

  return {
    logic: 'any',
    minimumConditionMatches: Math.max(2, Math.min(currentMinimumConditionMatches, Math.max(conditionCount, 1))),
  }
}

export function normalizeMinimumConditionMatches(
  pattern: Pick<HandPattern, 'logic' | 'minimumConditionMatches' | 'conditions'>,
): number {
  const conditionCount = Math.max(pattern.conditions.length, 1)

  if (pattern.logic === 'all') {
    return conditionCount
  }

  return Math.max(1, Math.min(pattern.minimumConditionMatches, conditionCount))
}

export function allowsSharedCards(pattern: Pick<HandPattern, 'reusePolicy'>): boolean {
  return pattern.reusePolicy === 'allow'
}

export function buildReusePolicy(allowSharedCards: boolean): ReusePolicy {
  return allowSharedCards ? 'allow' : 'forbid'
}

export function getConditionSource(
  condition: Pick<PatternCondition, 'matcher'>,
): RequirementSource {
  const matcher = condition.matcher

  if (!matcher) {
    return 'cards'
  }

  switch (matcher.type) {
    case 'origin':
    case 'role':
      return 'group'
    case 'attribute':
      return 'attribute'
    case 'level':
      return 'level'
    case 'monster_type':
      return 'type'
    case 'atk':
      return 'atk'
    case 'def':
      return 'def'
    case 'card':
    case 'card_pool':
    default:
      return 'cards'
  }
}

export function getConditionGroupKey(
  condition: Pick<PatternCondition, 'matcher'>,
): CardGroupKey | null {
  const matcher = condition.matcher

  if (!matcher) {
    return null
  }

  if (matcher.type === 'origin') {
    return createOriginGroupKey(matcher.value)
  }

  if (matcher.type === 'role') {
    return createRoleGroupKey(matcher.value)
  }

  return null
}

export function getConditionCardIds(
  condition: Pick<PatternCondition, 'matcher'>,
): string[] {
  const matcher = condition.matcher

  if (!matcher) {
    return []
  }

  if (matcher.type === 'card') {
    return [matcher.value]
  }

  if (matcher.type === 'card_pool') {
    return [...matcher.value]
  }

  return []
}

export function getConditionAttribute(
  condition: Pick<PatternCondition, 'matcher'>,
): CardAttribute | null {
  return condition.matcher?.type === 'attribute' ? condition.matcher.value : null
}

export function getConditionLevel(
  condition: Pick<PatternCondition, 'matcher'>,
): number | null {
  return condition.matcher?.type === 'level' ? condition.matcher.value : null
}

export function getConditionMonsterType(
  condition: Pick<PatternCondition, 'matcher'>,
): string | null {
  return condition.matcher?.type === 'monster_type' ? condition.matcher.value : null
}

export function getConditionAtk(
  condition: Pick<PatternCondition, 'matcher'>,
): number | null {
  return condition.matcher?.type === 'atk' ? condition.matcher.value : null
}

export function getConditionDef(
  condition: Pick<PatternCondition, 'matcher'>,
): number | null {
  return condition.matcher?.type === 'def' ? condition.matcher.value : null
}

export function createMatcherFromGroupKey(groupKey: CardGroupKey): Matcher {
  return isCardOriginGroupKey(groupKey)
    ? { type: 'origin', value: groupKey.value }
    : { type: 'role', value: groupKey.value }
}

export function createCardPoolMatcher(cardIds: string[]): Matcher | null {
  const uniqueIds = [...new Set(cardIds.filter(Boolean))]

  if (uniqueIds.length === 0) {
    return null
  }

  return uniqueIds.length === 1
    ? { type: 'card', value: uniqueIds[0] }
    : { type: 'card_pool', value: uniqueIds }
}

export function createMatcherFromSource(
  source: RequirementSource,
  defaults: {
    defaultAtk: number | null
    defaultAttribute: CardAttribute | null
    defaultDef: number | null
    defaultGroupKey: CardGroupKey | null
    defaultLevel: number | null
    defaultMonsterType: string | null
  },
  currentMatcher: Matcher | null,
): Matcher | null {
  if (source === 'group') {
    return getConditionSource({ matcher: currentMatcher }) === 'group'
      ? currentMatcher
      : defaults.defaultGroupKey
        ? createMatcherFromGroupKey(defaults.defaultGroupKey)
        : null
  }

  if (source === 'attribute') {
    return currentMatcher?.type === 'attribute'
      ? currentMatcher
      : defaults.defaultAttribute
        ? { type: 'attribute', value: defaults.defaultAttribute }
        : null
  }

  if (source === 'level') {
    return currentMatcher?.type === 'level'
      ? currentMatcher
      : defaults.defaultLevel !== null
        ? { type: 'level', value: defaults.defaultLevel }
        : null
  }

  if (source === 'type') {
    return currentMatcher?.type === 'monster_type'
      ? currentMatcher
      : defaults.defaultMonsterType
        ? { type: 'monster_type', value: defaults.defaultMonsterType }
        : null
  }

  if (source === 'atk') {
    return currentMatcher?.type === 'atk'
      ? currentMatcher
      : defaults.defaultAtk !== null
        ? { type: 'atk', value: defaults.defaultAtk }
        : null
  }

  if (source === 'def') {
    return currentMatcher?.type === 'def'
      ? currentMatcher
      : defaults.defaultDef !== null
        ? { type: 'def', value: defaults.defaultDef }
        : null
  }

  if (currentMatcher?.type === 'card' || currentMatcher?.type === 'card_pool') {
    return currentMatcher
  }

  return null
}

export function updateConditionCardPool(
  condition: PatternCondition,
  updater: (cardIds: string[]) => string[],
): PatternCondition {
  return {
    ...condition,
    matcher: createCardPoolMatcher(updater(getConditionCardIds(condition))),
  }
}

export function resolveConditionCardIds(
  condition: Pick<PatternCondition, 'matcher'>,
  groupsByKey: Map<string, DerivedDeckGroup>,
  cards: Iterable<CardEntry>,
): string[] {
  const matcher = condition.matcher

  if (!matcher) {
    return []
  }

  if (matcher.type === 'origin' || matcher.type === 'role') {
    const groupKey = serializeGroupKey(createMatcherGroupKey(matcher))
    return groupsByKey.get(groupKey)?.cardIds ?? []
  }

  if (matcher.type === 'card') {
    return [matcher.value]
  }

  if (matcher.type === 'card_pool') {
    return [...new Set(matcher.value.filter(Boolean))]
  }

  return [
    ...new Set(
      [...cards]
        .filter((card) => matchesMonsterRequirementCard(card, matcher))
        .map((card) => card.id),
    ),
  ]
}

function getConditionDefinitionKey(
  condition: Pick<PatternCondition, 'matcher' | 'quantity' | 'kind' | 'distinct'>,
): string {
  return JSON.stringify({
    distinct: condition.distinct === true,
    kind: condition.kind,
    matcher: condition.matcher,
    quantity: condition.quantity,
  })
}

function createMatcherGroupKey(matcher: Extract<Matcher, { type: 'origin' | 'role' }>): CardGroupKey {
  return matcher.type === 'origin'
    ? createOriginGroupKey(matcher.value)
    : createRoleGroupKey(matcher.value)
}
