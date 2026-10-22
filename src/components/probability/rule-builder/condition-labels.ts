import type { CardEntry, CardRole, CardType, Matcher, RequirementKind } from '../../../types'
import { CARD_ROLE_DEFINITIONS, getCardOriginDefinition, getCardRoleDefinition, getDeckGroupTheme } from '../../../app/deck-groups'
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

/** Desde cuántas cartas un pool que son uno o dos roles se dice con los roles. */
const MIN_POOL_FOR_ROLES = 4

/**
 * Si un pool son justo las cartas del deck con uno o dos roles (así arman sus pools las genéricas, p. ej. «Handtrap o Boardbreaker») y son 4 o más, esos roles: se dicen
 * así en vez de la lista de diez nombres. Si no, null.
 */
export function poolRoles(cardIds: readonly string[], cardById: ReadonlyMap<string, CardEntry>): CardRole[] | null {
  const deck = [...cardById.values()].filter((card) => card.copies > 0)
  const pool = new Set(cardIds.filter((id) => (cardById.get(id)?.copies ?? 0) > 0))
  const inside = CARD_ROLE_DEFINITIONS.map((definition) => ({
    role: definition.key.value,
    ids: deck.filter((card) => card.roles.includes(definition.key.value)).map((card) => card.id),
  }))
    .filter((entry) => entry.ids.length > 0 && entry.ids.every((id) => pool.has(id)))
    .sort((left, right) => right.ids.length - left.ids.length)
  const covered = new Set<string>()
  const picked: CardRole[] = []

  for (const entry of inside) {
    if (entry.ids.some((id) => !covered.has(id))) {
      picked.push(entry.role)
      entry.ids.forEach((id) => covered.add(id))
    }
  }

  // Con pocas cartas se dicen sus nombres (la persona las eligió una por una): los roles van cuando la lista sería larga.
  return pool.size >= MIN_POOL_FOR_ROLES && picked.length > 0 && picked.length <= 2 && covered.size === pool.size ? picked : null
}

/** «Handtrap» o «Handtrap o Boardbreaker». */
export function rolesLabel(roles: readonly CardRole[]): string {
  const labels = roles.map((role) => getCardRoleDefinition(role).label)

  return labels.length === 2 ? t('builder.label.roles', { first: labels[0]!, second: labels[1]! }) : labels.join(', ')
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
      const roles = poolRoles(matcher.value, new Map(derivedMainCards.map((card) => [card.id, card])))

      if (roles) return rolesLabel(roles)

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

/** El color del punto de lo que cuenta una condición («R G B»): el de su rol (o el primero de los roles de su pool) o su origen; null si no es una categoría. */
export function getConditionRgb(matcher: Matcher | null, derivedMainCards: CardEntry[]): string | null {
  if (matcher?.type === 'role' || matcher?.type === 'origin') {
    return getDeckGroupTheme(matcher).rgb
  }

  if (matcher?.type === 'card_pool') {
    const roles = poolRoles(matcher.value, new Map(derivedMainCards.map((card) => [card.id, card])))
    return roles ? getDeckGroupTheme({ type: 'role', value: roles[0]! }).rgb : null
  }

  return null
}
