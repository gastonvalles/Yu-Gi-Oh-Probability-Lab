import type { CardAttribute, CardEntry, Matcher, RequirementSource } from '../types'

export interface DerivedDeckAttribute {
  key: CardAttribute
  label: string
  cardIds: string[]
  cardNames: string[]
  copies: number
}

export interface DerivedDeckValueOption<T extends number | string> {
  key: T
  label: string
  cardIds: string[]
  cardNames: string[]
  copies: number
}

type MonsterPropertyMatcher = Extract<
  Matcher,
  | { type: 'attribute' }
  | { type: 'level' }
  | { type: 'monster_type' }
  | { type: 'atk' }
  | { type: 'def' }
>

export const CARD_ATTRIBUTE_DEFINITIONS: Array<{
  key: CardAttribute
  label: string
}> = [
  { key: 'DARK', label: 'DARK' },
  { key: 'DIVINE', label: 'DIVINE' },
  { key: 'EARTH', label: 'EARTH' },
  { key: 'FIRE', label: 'FIRE' },
  { key: 'LIGHT', label: 'LIGHT' },
  { key: 'WATER', label: 'WATER' },
  { key: 'WIND', label: 'WIND' },
]

const ATTRIBUTE_LABEL_BY_KEY = new Map(
  CARD_ATTRIBUTE_DEFINITIONS.map((definition) => [definition.key, definition.label]),
)

export function isCardAttribute(value: unknown): value is CardAttribute {
  return CARD_ATTRIBUTE_DEFINITIONS.some((definition) => definition.key === value)
}

export function parseCardAttribute(value: unknown): CardAttribute | null {
  return isCardAttribute(value) ? value : null
}

export function getCardAttributeLabel(attribute: CardAttribute): string {
  return ATTRIBUTE_LABEL_BY_KEY.get(attribute) ?? attribute
}

export function isMonsterRequirementSource(
  source: RequirementSource,
): source is Extract<RequirementSource, 'attribute' | 'level' | 'type' | 'atk' | 'def'> {
  return (
    source === 'attribute' ||
    source === 'level' ||
    source === 'type' ||
    source === 'atk' ||
    source === 'def'
  )
}

export function isMonsterPropertyMatcher(matcher: Matcher | null): matcher is MonsterPropertyMatcher {
  return (
    matcher?.type === 'attribute' ||
    matcher?.type === 'level' ||
    matcher?.type === 'monster_type' ||
    matcher?.type === 'atk' ||
    matcher?.type === 'def'
  )
}

export function getMonsterRequirementSourceLabel(matcher: Matcher | null): string | null {
  switch (matcher?.type) {
    case 'attribute':
      return getCardAttributeLabel(matcher.value)
    case 'level':
      return `de Nivel ${matcher.value}`
    case 'monster_type':
      return `de tipo ${matcher.value}`
    case 'atk':
      return `con ${matcher.value} ATK`
    case 'def':
      return `con ${matcher.value} DEF`
    default:
      return null
  }
}

export function matchesMonsterRequirementCard(card: CardEntry, matcher: Matcher | null): boolean {
  if (!isMonsterCard(card)) {
    return false
  }

  switch (matcher?.type) {
    case 'attribute':
      return card.apiCard?.attribute === matcher.value
    case 'level':
      return card.apiCard?.level === matcher.value
    case 'monster_type':
      return card.apiCard?.race === matcher.value
    case 'atk':
      return parseCombatStat(card.apiCard?.atk ?? null) === matcher.value
    case 'def':
      return parseCombatStat(card.apiCard?.def ?? null) === matcher.value
    default:
      return false
  }
}

export function buildDerivedDeckAttributes(cards: CardEntry[]): DerivedDeckAttribute[] {
  return CARD_ATTRIBUTE_DEFINITIONS.map((definition) => {
    const matchingCards = cards.filter((card) =>
      matchesMonsterRequirementCard(card, {
        type: 'attribute',
        value: definition.key,
      }),
    )

    return {
      key: definition.key,
      label: definition.label,
      cardIds: matchingCards.map((card) => card.id),
      cardNames: matchingCards.map((card) => card.name),
      copies: matchingCards.reduce((total, card) => total + card.copies, 0),
    }
  })
}

export function buildDerivedDeckLevels(cards: CardEntry[]): DerivedDeckValueOption<number>[] {
  return buildDerivedDeckNumericOptions(cards, (card) => card.apiCard?.level ?? null)
}

export function buildDerivedDeckMonsterTypes(cards: CardEntry[]): DerivedDeckValueOption<string>[] {
  const options = new Map<string, DerivedDeckValueOption<string>>()

  for (const card of cards) {
    if (!isMonsterCard(card) || !card.apiCard?.race) {
      continue
    }

    const key = card.apiCard.race
    const current = options.get(key)

    if (current) {
      current.cardIds.push(card.id)
      current.cardNames.push(card.name)
      current.copies += card.copies
      continue
    }

    options.set(key, {
      key,
      label: key,
      cardIds: [card.id],
      cardNames: [card.name],
      copies: card.copies,
    })
  }

  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label))
}

export function buildDerivedDeckAttackValues(cards: CardEntry[]): DerivedDeckValueOption<number>[] {
  return buildDerivedDeckNumericOptions(cards, (card) => parseCombatStat(card.apiCard?.atk ?? null))
}

export function buildDerivedDeckDefenseValues(cards: CardEntry[]): DerivedDeckValueOption<number>[] {
  return buildDerivedDeckNumericOptions(cards, (card) => parseCombatStat(card.apiCard?.def ?? null))
}

function buildDerivedDeckNumericOptions(
  cards: CardEntry[],
  resolveValue: (card: CardEntry) => number | null,
): DerivedDeckValueOption<number>[] {
  const options = new Map<number, DerivedDeckValueOption<number>>()

  for (const card of cards) {
    if (!isMonsterCard(card)) {
      continue
    }

    const key = resolveValue(card)

    if (key === null) {
      continue
    }

    const current = options.get(key)

    if (current) {
      current.cardIds.push(card.id)
      current.cardNames.push(card.name)
      current.copies += card.copies
      continue
    }

    options.set(key, {
      key,
      label: String(key),
      cardIds: [card.id],
      cardNames: [card.name],
      copies: card.copies,
    })
  }

  return [...options.values()].sort((left, right) => left.key - right.key)
}

function isMonsterCard(card: CardEntry): boolean {
  return card.apiCard?.cardType.toLowerCase().includes('monster') ?? false
}

function parseCombatStat(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value.trim())) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}
