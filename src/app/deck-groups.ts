import type { CardEntry, CardGroupKey, CardRole, PatternRequirement } from '../types'

export interface CardRoleDefinition {
  key: CardRole
  label: string
  shortLabel: string
  description: string
}

export interface DerivedDeckGroup {
  key: CardGroupKey
  label: string
  shortLabel: string
  description: string
  cardIds: string[]
  cardNames: string[]
  copies: number
}

export const CARD_ROLE_DEFINITIONS: CardRoleDefinition[] = [
  {
    key: 'starter',
    label: 'Starter',
    shortLabel: 'Starter',
    description: 'Carta que por sí sola te pone a jugar o te encuentra el motor.',
  },
  {
    key: 'extender',
    label: 'Extender',
    shortLabel: 'Extender',
    description: 'Carta que mejora una mano que ya empezó o suma cuerpos/recursos.',
  },
  {
    key: 'brick',
    label: 'Brick',
    shortLabel: 'Brick',
    description: 'Carta que preferís no robar al inicio si no viene acompañada.',
  },
  {
    key: 'handtrap',
    label: 'Handtrap',
    shortLabel: 'HT',
    description: 'Interacción que frena al rival desde la mano.',
  },
  {
    key: 'boardbreaker',
    label: 'Boardbreaker',
    shortLabel: 'Boardbreaker',
    description: 'Carta para romper campo rival yendo segundo.',
  },
  {
    key: 'floodgate',
    label: 'Floodgate',
    shortLabel: 'Floodgate',
    description: 'Carta que limita líneas del rival por presencia o efecto continuo.',
  },
]

export const CARD_GROUP_DEFINITIONS: Array<{
  key: CardGroupKey
  label: string
  shortLabel: string
  description: string
}> = [
  ...CARD_ROLE_DEFINITIONS,
  {
    key: 'engine',
    label: 'Engine',
    shortLabel: 'Engine',
    description: 'Starters, extenders y bricks juntos.',
  },
  {
    key: 'non-engine',
    label: 'Non-engine',
    shortLabel: 'Non-engine',
    description: 'Handtraps, boardbreakers, floodgates y bricks juntos.',
  },
]

const ROLE_DEFINITION_BY_KEY = new Map(CARD_ROLE_DEFINITIONS.map((definition) => [definition.key, definition]))
const GROUP_DEFINITION_BY_KEY = new Map(CARD_GROUP_DEFINITIONS.map((definition) => [definition.key, definition]))

export function getCardRoleDefinition(role: CardRole): CardRoleDefinition {
  return ROLE_DEFINITION_BY_KEY.get(role) ?? CARD_ROLE_DEFINITIONS[0]
}

export function getDeckGroupDefinition(groupKey: CardGroupKey): DerivedDeckGroup {
  const definition = GROUP_DEFINITION_BY_KEY.get(groupKey) ?? CARD_GROUP_DEFINITIONS[0]

  return {
    ...definition,
    cardIds: [],
    cardNames: [],
    copies: 0,
  }
}

export function buildDerivedDeckGroups(cards: CardEntry[]): DerivedDeckGroup[] {
  return CARD_GROUP_DEFINITIONS.map((definition) => {
    const matchingCards = cards.filter((card) => cardMatchesGroup(card, definition.key))

    return {
      key: definition.key,
      label: definition.label,
      shortLabel: definition.shortLabel,
      description: definition.description,
      cardIds: matchingCards.map((card) => card.id),
      cardNames: matchingCards.map((card) => card.name),
      copies: matchingCards.reduce((total, card) => total + card.copies, 0),
    }
  })
}

export function buildDerivedDeckGroupMap(cards: CardEntry[]): Map<CardGroupKey, DerivedDeckGroup> {
  return new Map(buildDerivedDeckGroups(cards).map((group) => [group.key, group]))
}

export function buildDeckRoleSummary(cards: CardEntry[]): DerivedDeckGroup[] {
  return buildDerivedDeckGroups(cards).filter((group) => group.copies > 0)
}

export function resolveRequirementCardIds(
  requirement: PatternRequirement,
  groupsByKey: Map<CardGroupKey, DerivedDeckGroup>,
): string[] {
  if (requirement.source === 'group') {
    if (!requirement.groupKey) {
      return []
    }

    return groupsByKey.get(requirement.groupKey)?.cardIds ?? []
  }

  return [...new Set(requirement.cardIds.filter(Boolean))]
}

function cardMatchesGroup(card: CardEntry, groupKey: CardGroupKey): boolean {
  if (groupKey === 'engine') {
    return card.roles.some((role) => role === 'starter' || role === 'extender' || role === 'brick')
  }

  if (groupKey === 'non-engine') {
    return card.roles.some(
      (role) => role === 'handtrap' || role === 'boardbreaker' || role === 'floodgate' || role === 'brick',
    )
  }

  return card.roles.includes(groupKey)
}
