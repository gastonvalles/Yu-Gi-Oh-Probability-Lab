import { getCardOriginDefinition, getCardRoleDefinition } from '../../app/deck-groups'
import {
  allowsSharedCards,
  getConditionCardIds,
  getPatternMatchMode,
  normalizeMinimumConditionMatches,
} from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { CardEntry, HandPattern, Matcher, PatternRequirement } from '../../types'

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
      ? ['definir al menos una condición']
      : pattern.conditions.map((condition) => buildConditionPreview(condition, cardById))
  const includeConditionCount = pattern.conditions.filter((condition) => condition.kind === 'include').length
  const matchMode = getPatternMatchMode(pattern)

  return {
    heading: pattern.kind === 'problem' ? 'Este problema ocurre si:' : 'Esta salida requiere:',
    summary: buildPatternCompactSummary(pattern, cardById),
    items,
    logic:
      matchMode === 'all'
        ? 'Deben cumplirse todas las condiciones.'
        : matchMode === 'any'
          ? 'Alcanza con que se cumpla una condición.'
          : `Deben cumplirse al menos ${formatInteger(normalizeMinimumConditionMatches(pattern))} condiciones.`,
    reuse:
      includeConditionCount < 2
        ? 'La política de reutilización no cambia el resultado mientras haya una sola condición positiva.'
        : allowsSharedCards(pattern)
          ? 'Se permite reutilizar la misma carta entre condiciones.'
          : 'No se permite reutilizar la misma carta entre condiciones.',
  }
}

export function buildPatternCompactSummary(
  pattern: HandPattern,
  cardById: Map<string, CardEntry>,
): string {
  if (pattern.conditions.length === 0) {
    return 'Regla sin definir'
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
    return `Una de estas: ${parts.join(' / ')}`
  }

  return `${formatInteger(minimumMatches)} de estas: ${parts.join(' / ')}`
}

function buildConditionPreview(
  requirement: PatternRequirement,
  cardById: Map<string, CardEntry>,
): string {
  if (!requirement.matcher) {
    return '(elegí qué cartas contar)'
  }

  const selectedCards = resolveSelectedCards(requirement, cardById)

  switch (requirement.matcher.type) {
    case 'card':
      return buildSpecificCardPreview(requirement, selectedCards[0]?.name ?? 'una carta que ya no está en el deck')
    case 'card_pool':
      return buildCardPoolPreview(requirement, selectedCards)
    case 'card_type':
      return buildGenericCardPreview(
        requirement,
        requirement.matcher.value === 'monster' ? 'de tipo Monstruo'
          : requirement.matcher.value === 'spell' ? 'de tipo Magia'
          : 'de tipo Trampa',
      )
    case 'archetype':
      return buildGenericCardPreview(requirement, `del arquetipo ${requirement.matcher.value}`)
    case 'role':
      return buildGenericCardPreview(
        requirement,
        `con rol ${getCardRoleDefinition(requirement.matcher.value).label}`,
      )
    case 'origin':
      return buildGenericCardPreview(
        requirement,
        `con origen ${getCardOriginDefinition(requirement.matcher.value).label}`,
      )
    case 'attribute':
      return buildGenericMonsterPreview(requirement, `con atributo ${requirement.matcher.value}`)
    case 'level':
      return buildGenericMonsterPreview(requirement, `de Nivel ${requirement.matcher.value}`)
    case 'monster_type':
      return buildGenericMonsterPreview(requirement, `de tipo ${requirement.matcher.value}`)
    case 'atk':
      return buildGenericMonsterPreview(requirement, `con ${formatInteger(requirement.matcher.value)} ATK`)
    case 'def':
      return buildGenericMonsterPreview(requirement, `con ${formatInteger(requirement.matcher.value)} DEF`)
    default:
      return '(elegí qué cartas contar)'
  }
}

function buildCompactConditionLabel(
  requirement: PatternRequirement,
  selectedCards: CardEntry[],
): string {
  if (!requirement.matcher) {
    return 'sin definir'
  }

  const baseLabel = buildCompactMatcherLabel(requirement.matcher, selectedCards)

  if (requirement.kind === 'exclude') {
    return requirement.quantity <= 1
      ? `sin ${baseLabel}`
      : `sin ${formatInteger(requirement.quantity)}+ ${baseLabel}`
  }

  if (requirement.quantity <= 1) {
    return baseLabel
  }

  return `${formatInteger(requirement.quantity)}+ ${baseLabel}`
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
      return selectedCards[0]?.name ?? 'carta fuera del deck'
    case 'card_pool':
      return selectedCards.length === 1
        ? selectedCards[0]?.name ?? 'pool'
        : 'pool manual'
    case 'card_type':
      return matcher.value === 'monster' ? 'Monstruo' : matcher.value === 'spell' ? 'Magia' : 'Trampa'
    case 'attribute':
      return `Atributo ${matcher.value}`
    case 'level':
      return `Nivel ${formatInteger(matcher.value)}`
    case 'monster_type':
      return matcher.value
    case 'archetype':
      return matcher.value
    case 'atk':
      return `${formatInteger(matcher.value)} ATK`
    case 'def':
      return `${formatInteger(matcher.value)} DEF`
    default:
      return 'criterio'
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

function buildSpecificCardPreview(
  requirement: PatternRequirement,
  cardName: string,
): string {
  if (requirement.kind === 'exclude') {
    return requirement.quantity === 1
      ? `no robás ninguna copia de ${cardName}`
      : `no robás ${formatInteger(requirement.quantity)} o más copias de ${cardName}`
  }

  return requirement.quantity === 1
    ? `al menos 1 copia de ${cardName}`
    : `al menos ${formatInteger(requirement.quantity)} copias de ${cardName}`
}

/** Sustantivo de lo que se cuenta, en singular, plural y negado ("ninguna carta"). */
interface CountNoun {
  one: string
  many: string
  none: string
}

const CARDS: CountNoun = { one: 'carta', many: 'cartas', none: 'ninguna carta' }
const NAMES: CountNoun = { one: 'nombre distinto', many: 'nombres distintos', none: 'ningún nombre' }
const MONSTERS: CountNoun = { one: 'monstruo', many: 'monstruos', none: 'ningún monstruo' }
const MONSTER_NAMES: CountNoun = { one: 'nombre distinto de monstruo', many: 'nombres distintos de monstruos', none: 'ningún nombre de monstruo' }

/** "al menos 2 cartas …", "al menos 1 carta …", "no robás ninguna carta …", "no robás 2 o más cartas …". */
function countPhrase(requirement: PatternRequirement, noun: CountNoun, tail: string): string {
  const quantity = requirement.quantity

  if (requirement.kind === 'exclude') {
    return quantity === 1 ? `no robás ${noun.none} ${tail}` : `no robás ${formatInteger(quantity)} o más ${noun.many} ${tail}`
  }

  return `al menos ${formatInteger(quantity)} ${quantity === 1 ? noun.one : noun.many} ${tail}`
}

function buildCardPoolPreview(
  requirement: PatternRequirement,
  selectedCards: CardEntry[],
): string {
  const poolLabel =
    selectedCards.length > 0
      ? selectedCards.map((card) => card.name).join(', ')
      : 'un pool de cartas'

  return countPhrase(requirement, requirement.distinct ? NAMES : CARDS, `del pool ${poolLabel}`)
}

function buildGenericCardPreview(
  requirement: PatternRequirement,
  matcherLabel: string,
): string {
  return countPhrase(requirement, requirement.distinct ? NAMES : CARDS, matcherLabel)
}

function buildGenericMonsterPreview(
  requirement: PatternRequirement,
  matcherLabel: string,
): string {
  return countPhrase(requirement, requirement.distinct ? MONSTER_NAMES : MONSTERS, matcherLabel)
}
