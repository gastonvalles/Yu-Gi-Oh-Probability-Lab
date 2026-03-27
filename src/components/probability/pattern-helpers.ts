import { getCardOriginDefinition, getCardRoleDefinition } from '../../app/deck-groups'
import {
  allowsSharedCards,
  getConditionCardIds,
  getPatternMatchMode,
  normalizeMinimumConditionMatches,
} from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { CardEntry, HandPattern, Matcher, PatternRequirement } from '../../types'

export type MatcherEditorType = Matcher['type']

export const MATCHER_EDITOR_OPTIONS: Array<{
  description: string
  label: string
  value: MatcherEditorType
}> = [
  {
    value: 'role',
    label: 'Rol',
    description: 'Evalúa cartas por función táctica.',
  },
  {
    value: 'origin',
    label: 'Origen',
    description: 'Evalúa pertenencia al motor del deck.',
  },
  {
    value: 'card',
    label: 'Carta específica',
    description: 'Evalúa una carta concreta.',
  },
  {
    value: 'card_pool',
    label: 'Pool de cartas',
    description: 'Evalúa una lista manual de cartas.',
  },
  {
    value: 'attribute',
    label: 'Atributo',
    description: 'Evalúa monstruos por atributo.',
  },
  {
    value: 'level',
    label: 'Nivel',
    description: 'Evalúa monstruos por nivel.',
  },
  {
    value: 'monster_type',
    label: 'Tipo de monstruo',
    description: 'Evalúa monstruos por raza o tipo.',
  },
  {
    value: 'atk',
    label: 'ATK',
    description: 'Evalúa monstruos por ataque.',
  },
  {
    value: 'def',
    label: 'DEF',
    description: 'Evalúa monstruos por defensa.',
  },
]

export interface PatternPreview {
  heading: string
  summary: string
  items: string[]
  logic: string
  reuse: string
}

export function getMatcherEditorType(matcher: Matcher | null): MatcherEditorType {
  return matcher?.type ?? 'role'
}

export function getMatcherEditorLabel(type: MatcherEditorType): string {
  return MATCHER_EDITOR_OPTIONS.find((option) => option.value === type)?.label ?? 'Matcher'
}

export function buildRequirementSummary(
  requirement: PatternRequirement,
  selectedCards: CardEntry[],
): string {
  if (!requirement.matcher) {
    return 'Elegí el tipo de criterio y el valor que querés medir en esta condición.'
  }

  if ((requirement.matcher.type === 'card' || requirement.matcher.type === 'card_pool') && selectedCards.length === 0) {
    return 'Elegí la carta o el pool de cartas que querés medir en esta condición.'
  }

  const matcherLabel = buildMatcherSummaryLabel(requirement.matcher, selectedCards)

  if (requirement.kind === 'exclude') {
    return requirement.distinct
      ? `La mano no debe incluir ${formatInteger(requirement.quantity)} o más nombres distintos que cumplan: ${matcherLabel}.`
      : `La mano no debe incluir ${formatInteger(requirement.quantity)} o más cartas que cumplan: ${matcherLabel}.`
  }

  return requirement.distinct
    ? `La mano debe incluir al menos ${formatInteger(requirement.quantity)} nombres distintos que cumplan: ${matcherLabel}.`
    : `La mano debe incluir al menos ${formatInteger(requirement.quantity)} cartas que cumplan: ${matcherLabel}.`
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
    heading: pattern.kind === 'problem' ? 'Este problema ocurre si:' : 'Esta apertura requiere:',
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
    return 'definir el matcher y su valor'
  }

  const selectedCards = resolveSelectedCards(requirement, cardById)

  switch (requirement.matcher.type) {
    case 'card':
      return buildSpecificCardPreview(requirement, selectedCards[0]?.name ?? 'la carta elegida')
    case 'card_pool':
      return buildCardPoolPreview(requirement, selectedCards)
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
      return 'definir el matcher y su valor'
  }
}

function buildMatcherSummaryLabel(
  matcher: Matcher,
  selectedCards: CardEntry[],
): string {
  switch (matcher.type) {
    case 'role':
      return `Rol: ${getCardRoleDefinition(matcher.value).label}`
    case 'origin':
      return `Origen: ${getCardOriginDefinition(matcher.value).label}`
    case 'card':
      return `Carta específica: ${selectedCards[0]?.name ?? 'sin seleccionar'}`
    case 'card_pool':
      return `Pool de cartas: ${selectedCards.length > 0 ? selectedCards.map((card) => card.name).join(', ') : 'vacío'}`
    case 'attribute':
      return `Filtro de monstruos: atributo ${matcher.value}`
    case 'level':
      return `Filtro de monstruos: Nivel ${matcher.value}`
    case 'monster_type':
      return `Filtro de monstruos: tipo ${matcher.value}`
    case 'atk':
      return `Filtro de monstruos: ${formatInteger(matcher.value)} ATK`
    case 'def':
      return `Filtro de monstruos: ${formatInteger(matcher.value)} DEF`
    default:
      return 'Matcher sin definir'
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
      return selectedCards[0]?.name ?? 'carta'
    case 'card_pool':
      return selectedCards.length === 1
        ? selectedCards[0]?.name ?? 'pool'
        : 'pool manual'
    case 'attribute':
      return `Atributo ${matcher.value}`
    case 'level':
      return `Nivel ${formatInteger(matcher.value)}`
    case 'monster_type':
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

function buildCardPoolPreview(
  requirement: PatternRequirement,
  selectedCards: CardEntry[],
): string {
  const poolLabel =
    selectedCards.length > 0
      ? selectedCards.map((card) => card.name).join(', ')
      : 'un pool de cartas'

  if (requirement.kind === 'exclude') {
    return requirement.distinct
      ? `no robás ${formatInteger(requirement.quantity)} o más nombres distintos del pool ${poolLabel}`
      : `no robás ${formatInteger(requirement.quantity)} o más cartas del pool ${poolLabel}`
  }

  return requirement.distinct
    ? `al menos ${formatInteger(requirement.quantity)} nombres distintos del pool ${poolLabel}`
    : `al menos ${formatInteger(requirement.quantity)} cartas del pool ${poolLabel}`
}

function buildGenericCardPreview(
  requirement: PatternRequirement,
  matcherLabel: string,
): string {
  if (requirement.kind === 'exclude') {
    return requirement.distinct
      ? `no robás ${formatInteger(requirement.quantity)} o más nombres distintos ${matcherLabel}`
      : `no robás ${formatInteger(requirement.quantity)} o más cartas ${matcherLabel}`
  }

  return requirement.distinct
    ? `al menos ${formatInteger(requirement.quantity)} nombres distintos ${matcherLabel}`
    : `al menos ${formatInteger(requirement.quantity)} cartas ${matcherLabel}`
}

function buildGenericMonsterPreview(
  requirement: PatternRequirement,
  matcherLabel: string,
): string {
  if (requirement.kind === 'exclude') {
    return requirement.distinct
      ? `no robás ${formatInteger(requirement.quantity)} o más nombres distintos de monstruos ${matcherLabel}`
      : `no robás ${formatInteger(requirement.quantity)} o más monstruos ${matcherLabel}`
  }

  return requirement.distinct
    ? `al menos ${formatInteger(requirement.quantity)} nombres distintos de monstruos ${matcherLabel}`
    : `al menos ${formatInteger(requirement.quantity)} monstruos ${matcherLabel}`
}
