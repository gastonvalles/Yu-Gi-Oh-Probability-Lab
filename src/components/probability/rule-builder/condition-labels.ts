import type { CardEntry, Matcher, RequirementKind } from '../../../types'
import { getCardRoleDefinition, getCardOriginDefinition } from '../../../app/deck-groups'
import { formatInteger } from '../../../app/utils'

/**
 * Maps a RequirementKind to a human-friendly Spanish label.
 * "include" → "Al menos", "exclude" → "Sin"
 */
export function getKindLabel(kind: RequirementKind): string {
  return kind === 'include' ? 'Al menos' : 'Sin'
}

/**
 * Maps a RequirementKind label back to the internal value.
 * "Al menos" → "include", "Sin" → "exclude"
 */
export function kindFromLabel(label: string): RequirementKind {
  return label === 'Sin' ? 'exclude' : 'include'
}

/**
 * Returns a human-readable label for a matcher, suitable for display
 * in the ConditionBlock category segment.
 */
export function getConditionLabel(
  matcher: Matcher | null,
  derivedMainCards: CardEntry[],
): string {
  if (!matcher) {
    return 'Sin definir'
  }

  switch (matcher.type) {
    case 'role':
      return getCardRoleDefinition(matcher.value).label
    case 'origin':
      return getCardOriginDefinition(matcher.value).label
    case 'card': {
      const card = derivedMainCards.find((c) => c.id === matcher.value)
      return card?.name ?? 'Carta eliminada'
    }
    case 'card_pool': {
      const names = matcher.value
        .map((id) => derivedMainCards.find((c) => c.id === id)?.name)
        .filter(Boolean)

      if (names.length === 0) return 'Pool vacío'
      if (names.length === 1) return names[0]!
      return `${names[0]} +${formatInteger(names.length - 1)} más`
    }
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
      return 'Sin definir'
  }
}
