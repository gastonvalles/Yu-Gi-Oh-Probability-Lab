import { getCardOriginDefinition, getCardRoleDefinition } from '../../app/deck-groups'
import {
  allowsSharedCards,
  getConditionCardIds,
  getPatternMatchMode,
  normalizeMinimumConditionMatches,
} from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { CardEntry, HandPattern, Matcher, PatternRequirement } from '../../types'
import { getCardTypeLabel } from './rule-builder/condition-labels'

interface PatternPreview {
  heading: string
  summary: string
  items: string[]
  logic: string
  reuse: string
}

export function buildPatternPreview(
  pattern: HandPattern,
  cardById: Map<string, CardEntry>,
): PatternPreview {
  const items =
    pattern.conditions.length === 0
      ? [t('builder.preview.noConditions')]
      : pattern.conditions.map((condition) => buildConditionPreview(condition, cardById))
  const includeConditionCount = pattern.conditions.filter((condition) => condition.kind === 'include').length
  const matchMode = getPatternMatchMode(pattern)

  return {
    heading: t(pattern.kind === 'problem' ? 'builder.preview.headingProblem' : 'builder.preview.headingOpening'),
    summary: buildPatternCompactSummary(pattern, cardById),
    items,
    logic:
      matchMode === 'all'
        ? t('builder.preview.logicAll')
        : matchMode === 'any'
          ? t('builder.preview.logicAny')
          : t('builder.preview.logicAtLeast', { count: formatInteger(normalizeMinimumConditionMatches(pattern)) }),
    reuse:
      includeConditionCount < 2
        ? t('builder.preview.reuseSingle')
        : allowsSharedCards(pattern)
          ? t('builder.preview.reuseAllowed')
          : t('builder.preview.reuseForbidden'),
  }
}

export function buildPatternCompactSummary(
  pattern: HandPattern,
  cardById: Map<string, CardEntry>,
): string {
  if (pattern.conditions.length === 0) {
    return t('builder.summary.undefinedRule')
  }

  const parts = pattern.conditions.map((condition) =>
    buildCompactConditionLabel(condition, resolveSelectedCards(condition, cardById)),
  )
  const matchMode = getPatternMatchMode(pattern)
  const minimumMatches = normalizeMinimumConditionMatches(pattern)

  if (matchMode === 'all') {
    return parts.join(' + ')
  }

  if (matchMode === 'any') {
    return t('builder.summary.anyOf', { parts: parts.join(' / ') })
  }

  return t('builder.summary.atLeastOf', { count: formatInteger(minimumMatches), parts: parts.join(' / ') })
}

function buildConditionPreview(
  requirement: PatternRequirement,
  cardById: Map<string, CardEntry>,
): string {
  if (!requirement.matcher) {
    return t('builder.preview.chooseCards')
  }

  const selectedCards = resolveSelectedCards(requirement, cardById)

  switch (requirement.matcher.type) {
    case 'card':
      return buildSpecificCardPreview(requirement, selectedCards[0]?.name ?? t('builder.preview.cardGone'))
    case 'card_pool':
      return buildCardPoolPreview(requirement, selectedCards)
    case 'card_type':
      return buildGenericCardPreview(requirement, t('builder.tail.cardType', { type: getCardTypeLabel(requirement.matcher.value) }))
    case 'archetype':
      return buildGenericCardPreview(requirement, t('builder.tail.archetype', { name: requirement.matcher.value }))
    case 'role':
      return buildGenericCardPreview(
        requirement,
        t('builder.tail.role', { role: getCardRoleDefinition(requirement.matcher.value).label }),
      )
    case 'origin':
      return buildGenericCardPreview(
        requirement,
        t('builder.tail.origin', { origin: getCardOriginDefinition(requirement.matcher.value).label }),
      )
    case 'attribute':
      return buildGenericMonsterPreview(requirement, t('builder.tail.attribute', { attribute: requirement.matcher.value }))
    case 'level':
      return buildGenericMonsterPreview(requirement, t('builder.tail.level', { level: requirement.matcher.value }))
    case 'monster_type':
      return buildGenericMonsterPreview(requirement, t('builder.tail.monsterType', { type: requirement.matcher.value }))
    case 'atk':
      return buildGenericMonsterPreview(requirement, t('builder.tail.atk', { value: formatInteger(requirement.matcher.value) }))
    case 'def':
      return buildGenericMonsterPreview(requirement, t('builder.tail.def', { value: formatInteger(requirement.matcher.value) }))
    default:
      return t('builder.preview.chooseCards')
  }
}

function buildCompactConditionLabel(
  requirement: PatternRequirement,
  selectedCards: CardEntry[],
): string {
  if (!requirement.matcher) {
    return t('builder.summary.conditionUndefined')
  }

  const baseLabel = buildCompactMatcherLabel(requirement.matcher, selectedCards)

  if (requirement.kind === 'exclude') {
    return requirement.quantity <= 1
      ? t('builder.summary.without', { label: baseLabel })
      : t('builder.summary.withoutMany', { count: formatInteger(requirement.quantity), label: baseLabel })
  }

  if (requirement.quantity <= 1) {
    return baseLabel
  }

  return t('builder.summary.many', { count: formatInteger(requirement.quantity), label: baseLabel })
}

function buildCompactMatcherLabel(
  matcher: Matcher,
  selectedCards: CardEntry[],
): string {
  switch (matcher.type) {
    case 'role':
      return getCardRoleDefinition(matcher.value).label
    case 'origin':
      return getCardOriginDefinition(matcher.value).label
    case 'card':
      return selectedCards[0]?.name ?? t('builder.summary.cardMissing')
    case 'card_pool':
      return selectedCards.length === 1
        ? selectedCards[0]?.name ?? t('builder.summary.pool')
        : t('builder.summary.poolManual')
    case 'card_type':
      return getCardTypeLabel(matcher.value)
    case 'attribute':
      return t('builder.label.attribute', { value: matcher.value })
    case 'level':
      return t('builder.label.level', { value: formatInteger(matcher.value) })
    case 'monster_type':
      return matcher.value
    case 'archetype':
      return matcher.value
    case 'atk':
      return t('builder.label.atk', { value: formatInteger(matcher.value) })
    case 'def':
      return t('builder.label.def', { value: formatInteger(matcher.value) })
    default:
      return t('builder.summary.criterion')
  }
}

function resolveSelectedCards(
  requirement: PatternRequirement,
  cardById: Map<string, CardEntry>,
): CardEntry[] {
  return getConditionCardIds(requirement)
    .map((cardId) => cardById.get(cardId))
    .filter((card): card is CardEntry => Boolean(card))
}

/** "al menos 1 copia de X", "al menos 2 copias de X", "no robás ninguna copia de X", "no robás 2 o más copias de X". */
function buildSpecificCardPreview(
  requirement: PatternRequirement,
  cardName: string,
): string {
  return t(requirement.kind === 'exclude' ? 'builder.preview.copiesExclude' : 'builder.preview.copiesInclude', {
    count: requirement.quantity,
    card: cardName,
  })
}

/** Qué se cuenta: cartas, nombres distintos, monstruos o nombres distintos de monstruos. */
type CountNoun = 'cards' | 'names' | 'monsters' | 'monsterNames'

// Las frases guardan claves: cada idioma decide el orden de las palabras y cómo cambian con la cantidad.
const INCLUDE_PHRASE = {
  cards: 'builder.preview.include.cards',
  names: 'builder.preview.include.names',
  monsters: 'builder.preview.include.monsters',
  monsterNames: 'builder.preview.include.monsterNames',
} as const

const EXCLUDE_PHRASE = {
  cards: 'builder.preview.exclude.cards',
  names: 'builder.preview.exclude.names',
  monsters: 'builder.preview.exclude.monsters',
  monsterNames: 'builder.preview.exclude.monsterNames',
} as const

/** "al menos 2 cartas …", "al menos 1 carta …", "no robás ninguna carta …", "no robás 2 o más cartas …" (`tail` es el "…"). */
function countPhrase(requirement: PatternRequirement, noun: CountNoun, tail: string): string {
  const phrase = requirement.kind === 'exclude' ? EXCLUDE_PHRASE[noun] : INCLUDE_PHRASE[noun]

  return t(phrase, { count: requirement.quantity, tail })
}

function buildCardPoolPreview(
  requirement: PatternRequirement,
  selectedCards: CardEntry[],
): string {
  const tail =
    selectedCards.length > 0
      ? t('builder.tail.pool', { pool: selectedCards.map((card) => card.name).join(', ') })
      : t('builder.tail.poolMissing')

  return countPhrase(requirement, requirement.distinct ? 'names' : 'cards', tail)
}

function buildGenericCardPreview(
  requirement: PatternRequirement,
  matcherLabel: string,
): string {
  return countPhrase(requirement, requirement.distinct ? 'names' : 'cards', matcherLabel)
}

function buildGenericMonsterPreview(
  requirement: PatternRequirement,
  matcherLabel: string,
): string {
  return countPhrase(requirement, requirement.distinct ? 'monsterNames' : 'monsters', matcherLabel)
}
