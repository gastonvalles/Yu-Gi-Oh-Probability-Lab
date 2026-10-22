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
import { getCardTypeLabel, poolRoles, rolesLabel } from './rule-builder/condition-labels'

/** La palabra que une una condición con la siguiente en el editor: «y», «o» o «y / o». */
export function joinWord(pattern: HandPattern): string {
  const mode = getPatternMatchMode(pattern)

  return t(mode === 'all' ? 'builder.join.all' : mode === 'any' ? 'builder.join.any' : 'builder.join.atLeast')
}

export interface RuleSentence {
  /** La frase, con lo que decide entre <b>…</b> (va a `renderRich`). */
  text: string
  /** Alguna condición todavía no dice qué cuenta: la parte en negrita se marca en rojo. */
  missing: boolean
  /** En qué turno vale y si cuenta la robada; null si vale siempre y como siempre. */
  turn: string | null
}

/**
 * La regla leída en una frase, como la va a medir el Lab: «La mano tiene **al menos 2 cartas con rol Handtrap**. Sólo yendo 2º, contando la carta robada.».
 * Con varias condiciones las junta según cómo se combinan (todas, alguna o un mínimo). Null si no tiene condiciones.
 */
export function buildRuleSentence(pattern: HandPattern, cardById: Map<string, CardEntry>): RuleSentence | null {
  const conditions = pattern.conditions

  if (conditions.length === 0) {
    return null
  }

  const missing = conditions.some((condition) => condition.matcher === null)
  const what = (condition: PatternRequirement) => (condition.matcher ? buildWhatPhrase(condition, cardById) : t('builder.sentence.missing'))
  const mode = getPatternMatchMode(pattern)
  let text: string

  if (conditions.length === 1) {
    text = t(conditions[0]!.kind === 'exclude' ? 'builder.sentence.hasNot' : 'builder.sentence.has', { what: what(conditions[0]!) })
  } else if (mode === 'all') {
    const allInclude = conditions.every((condition) => condition.kind === 'include')
    const allExclude = conditions.every((condition) => condition.kind === 'exclude')

    if (allInclude || allExclude) {
      const joiner = ` ${t(allInclude ? 'builder.sentence.and' : 'builder.sentence.nor')} `
      text = t(allInclude ? 'builder.sentence.has' : 'builder.sentence.hasNot', { what: conditions.map(what).join(joiner) })
    } else {
      const items = conditions.map((condition) =>
        t(condition.kind === 'exclude' ? 'builder.sentence.itemHasNot' : 'builder.sentence.itemHas', { what: what(condition) }),
      )
      text = t('builder.sentence.mixed', { what: items.join(` ${t('builder.sentence.and')} `) })
    }
  } else {
    const parts = conditions.map((condition) =>
      condition.matcher ? buildCompactConditionLabel(condition, resolveSelectedCards(condition, cardById)) : t('builder.sentence.missing'),
    )
    const list = joinList(parts, t('builder.sentence.or'))

    text =
      mode === 'any'
        ? t('builder.sentence.any', { list })
        : t('builder.sentence.atLeast', { count: formatInteger(normalizeMinimumConditionMatches(pattern)), total: formatInteger(conditions.length), list })
  }

  const turn =
    pattern.turnContext === 'first'
      ? t('builder.sentence.turnFirst')
      : pattern.turnContext === 'second'
        ? t(pattern.ignoresDraw ? 'builder.sentence.turnSecondHand' : 'builder.sentence.turnSecond')
        : pattern.ignoresDraw
          ? t('builder.sentence.eitherHand')
          : null

  return { text, missing, turn }
}

/** «A, B o C» (la última con la palabra que corresponde). */
function joinList(parts: string[], last: string): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${last} ${parts[parts.length - 1]}`
}

/** Lo que cuenta una condición, dicho para ir después de «La mano tiene» (o «no tiene»): «al menos 2 cartas con rol Handtrap», «ninguna carta con rol Handtrap». */
function buildWhatPhrase(requirement: PatternRequirement, cardById: Map<string, CardEntry>): string {
  const matcher = requirement.matcher!
  const selected = resolveSelectedCards(requirement, cardById)

  if (requirement.kind === 'include') {
    return matcher.type === 'card_pool'
      ? countPhrase(requirement, requirement.distinct ? 'names' : 'cards', buildConditionTail(matcher, selected, cardById))
      : buildConditionPreview(requirement, cardById)
  }

  const many = requirement.quantity > 1
  const count = formatInteger(requirement.quantity)

  if (matcher.type === 'card') {
    const card = selected[0]?.name ?? t('builder.preview.cardGone')
    return many ? t('builder.what.many.copies', { count, card }) : t('builder.what.none.copies', { card })
  }

  const monster = ['attribute', 'level', 'monster_type', 'atk', 'def'].includes(matcher.type)
  const noun = monster ? (requirement.distinct ? 'monsterNames' : 'monsters') : requirement.distinct ? 'names' : 'cards'
  const tail = buildConditionTail(matcher, selected, cardById)

  return many ? t(WHAT_MANY[noun], { count, tail }) : t(WHAT_NONE[noun], { tail })
}

const WHAT_NONE = {
  cards: 'builder.what.none.cards',
  names: 'builder.what.none.names',
  monsters: 'builder.what.none.monsters',
  monsterNames: 'builder.what.none.monsterNames',
} as const

const WHAT_MANY = {
  cards: 'builder.what.many.cards',
  names: 'builder.what.many.names',
  monsters: 'builder.what.many.monsters',
  monsterNames: 'builder.what.many.monsterNames',
} as const

/** El criterio de una condición: «con rol Handtrap», «del pool A, B», «de Nivel 4»… (un pool que son uno o dos roles se dice con los roles). */
function buildConditionTail(matcher: Matcher, selected: CardEntry[], cardById: Map<string, CardEntry>): string {
  switch (matcher.type) {
    case 'card_pool': {
      const roles = poolRoles(matcher.value, cardById)

      if (roles) {
        return t('builder.tail.role', { role: rolesLabel(roles) })
      }

      return selected.length > 0 ? t('builder.tail.pool', { pool: selected.map((card) => card.name).join(', ') }) : t('builder.tail.poolMissing')
    }
    case 'card':
      return t('builder.tail.pool', { pool: selected[0]?.name ?? t('builder.preview.cardGone') })
    case 'card_type':
      return t('builder.tail.cardType', { type: getCardTypeLabel(matcher.value) })
    case 'archetype':
      return t('builder.tail.archetype', { name: matcher.value })
    case 'role':
      return t('builder.tail.role', { role: getCardRoleDefinition(matcher.value).label })
    case 'origin':
      return t('builder.tail.origin', { origin: getCardOriginDefinition(matcher.value).label })
    case 'attribute':
      return t('builder.tail.attribute', { attribute: matcher.value })
    case 'level':
      return t('builder.tail.level', { level: matcher.value })
    case 'monster_type':
      return t('builder.tail.monsterType', { type: matcher.value })
    case 'atk':
      return t('builder.tail.atk', { value: formatInteger(matcher.value) })
    case 'def':
      return t('builder.tail.def', { value: formatInteger(matcher.value) })
  }
}

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
