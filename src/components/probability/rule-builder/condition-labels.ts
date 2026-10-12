import type { CardEntry, CardType, Matcher, RequirementKind } from '../../../types'
import { getCardRoleDefinition, getCardOriginDefinition } from '../../../app/deck-groups'
import { formatInteger } from '../../../app/utils'
import { t } from '../../../i18n'

/**
 * Maps a RequirementKind to a human-friendly label in the current language.
 * "include" → "Al menos" / "At least", "exclude" → "Sin" / "Without"
 */
export function getKindLabel(kind: RequirementKind): string {
  return t(kind === 'include' ? 'builder.requirementKind.include' : 'builder.requirementKind.exclude')
}

/** Rótulo de un tipo de carta (Monstruo, Magia, Trampa): lo comparten los rótulos de condición, la lectura de la regla y el selector. */
export function getCardTypeLabel(type: CardType): string {
  return t(type === 'monster' ? 'builder.cardType.monster' : type === 'spell' ? 'builder.cardType.spell' : 'builder.cardType.trap')
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
    return t('builder.label.undefined')
  }

  switch (matcher.type) {
    case 'role':
      return getCardRoleDefinition(matcher.value).label
    case 'origin':
      return getCardOriginDefinition(matcher.value).label
    case 'card': {
      const card = derivedMainCards.find((c) => c.id === matcher.value)
      return card?.name ?? t('builder.label.cardMissing')
    }
    case 'card_pool': {
      const names = matcher.value
        .map((id) => derivedMainCards.find((c) => c.id === id)?.name)
        .filter(Boolean)

      if (names.length === 0) return t('builder.label.poolEmpty')
      if (names.length === 1) return names[0]!
      return t('builder.label.poolMore', { name: names[0]!, count: formatInteger(names.length - 1) })
    }
    case 'card_type':
      return getCardTypeLabel(matcher.value)
    case 'attribute':
      return t('builder.label.attribute', { value: matcher.value })
    case 'level':
      return t('builder.label.level', { value: formatInteger(matcher.value) })
    case 'monster_type':
      return matcher.value
    case 'archetype':
      return t('builder.label.archetype', { value: matcher.value })
    case 'atk':
      return t('builder.label.atk', { value: formatInteger(matcher.value) })
    case 'def':
      return t('builder.label.def', { value: formatInteger(matcher.value) })
    default:
      return t('builder.label.undefined')
  }
}
