import { t } from '../i18n'
import type { CardEntry, CardOrigin, CardRole, GroupKey } from '../types'

type DeckGroupKind = 'origin' | 'role'

interface ClassificationTheme {
  color: string
  rgb: string
}

interface DeckGroupDefinition {
  kind: DeckGroupKind
  key: GroupKey
  label: string
  shortLabel: string
  description: string
  theme: ClassificationTheme
}

interface CardOriginDefinition extends DeckGroupDefinition {
  kind: 'origin'
  key: Extract<GroupKey, { type: 'origin' }>
}

interface CardRoleDefinition extends DeckGroupDefinition {
  kind: 'role'
  key: Extract<GroupKey, { type: 'role' }>
}

export interface DerivedDeckGroup extends DeckGroupDefinition {
  cardIds: string[]
  cardNames: string[]
  copies: number
}

interface ParsedStoredGroupKey {
  groupKey: GroupKey | null
  isLegacy: boolean
}

const ROLE_THEME_BY_KEY: Record<CardRole, ClassificationTheme> = {
  // Los roles son categorías, no estadísticas: van en la familia del violeta (el verde, el ámbar y el azul no son de la paleta); el rojo queda para lo que sale mal.
  starter: { color: '#c77dff', rgb: '199 125 255' },
  extender: { color: '#e0b3ff', rgb: '224 179 255' },
  enabler: { color: '#9b6bff', rgb: '155 107 255' },
  handtrap: { color: '#a78bfa', rgb: '167 139 250' },
  disruption: { color: '#8f8cff', rgb: '143 140 255' },
  boardbreaker: { color: '#e879f9', rgb: '232 121 249' },
  floodgate: { color: '#a855f7', rgb: '168 85 247' },
  searcher: { color: '#d58cff', rgb: '213 140 255' },
  draw: { color: '#b4a2d4', rgb: '180 162 212' },
  recovery: { color: '#c4b5fd', rgb: '196 181 253' },
  payoff: { color: '#d8b4fe', rgb: '216 180 254' },
  brick: { color: '#ff4d4d', rgb: '255 77 77' },
  garnet: { color: '#da0000', rgb: '218 0 0' },
}

const ORIGIN_THEME_BY_KEY: Record<CardOrigin, ClassificationTheme> = {
  engine: { color: 'var(--primary)', rgb: 'var(--primary-rgb)' },
  non_engine: { color: 'var(--accent)', rgb: 'var(--accent-rgb)' },
}

export function createOriginGroupKey(value: CardOrigin): Extract<GroupKey, { type: 'origin' }> {
  return { type: 'origin', value }
}

export function createRoleGroupKey(value: CardRole): Extract<GroupKey, { type: 'role' }> {
  return { type: 'role', value }
}

export const CARD_ORIGIN_DEFINITIONS: CardOriginDefinition[] = [
  {
    kind: 'origin',
    key: createOriginGroupKey('engine'),
    label: 'Engine',
    shortLabel: 'Engine',
    get description() { return t('roles.group.engine.description') },
    theme: ORIGIN_THEME_BY_KEY.engine,
  },
  {
    kind: 'origin',
    key: createOriginGroupKey('non_engine'),
    label: 'Non-engine',
    shortLabel: 'Non-engine',
    get description() { return t('roles.group.nonEngine.description') },
    theme: ORIGIN_THEME_BY_KEY.non_engine,
  },
]

export const CARD_ROLE_DEFINITIONS: CardRoleDefinition[] = [
  {
    kind: 'role',
    key: createRoleGroupKey('starter'),
    label: 'Starter',
    shortLabel: 'Starter',
    get description() { return t('roles.group.starter.description') },
    theme: ROLE_THEME_BY_KEY.starter,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('extender'),
    label: 'Extender',
    shortLabel: 'Extender',
    get description() { return t('roles.group.extender.description') },
    theme: ROLE_THEME_BY_KEY.extender,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('enabler'),
    label: 'Enabler',
    shortLabel: 'Enabler',
    get description() { return t('roles.group.enabler.description') },
    theme: ROLE_THEME_BY_KEY.enabler,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('searcher'),
    label: 'Searcher',
    shortLabel: 'Searcher',
    get description() { return t('roles.group.searcher.description') },
    theme: ROLE_THEME_BY_KEY.searcher,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('draw'),
    label: 'Draw',
    shortLabel: 'Draw',
    get description() { return t('roles.group.draw.description') },
    theme: ROLE_THEME_BY_KEY.draw,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('payoff'),
    label: 'Payoff',
    shortLabel: 'Payoff',
    get description() { return t('roles.group.payoff.description') },
    theme: ROLE_THEME_BY_KEY.payoff,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('recovery'),
    label: 'Recovery',
    shortLabel: 'Recovery',
    get description() { return t('roles.group.recovery.description') },
    theme: ROLE_THEME_BY_KEY.recovery,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('handtrap'),
    label: 'Handtrap',
    shortLabel: 'HT',
    get description() { return t('roles.group.handtrap.description') },
    theme: ROLE_THEME_BY_KEY.handtrap,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('disruption'),
    label: 'Disruption',
    shortLabel: 'Disruption',
    get description() { return t('roles.group.disruption.description') },
    theme: ROLE_THEME_BY_KEY.disruption,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('boardbreaker'),
    label: 'Boardbreaker',
    shortLabel: 'Boardbreaker',
    get description() { return t('roles.group.boardbreaker.description') },
    theme: ROLE_THEME_BY_KEY.boardbreaker,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('floodgate'),
    label: 'Floodgate',
    shortLabel: 'Floodgate',
    get description() { return t('roles.group.floodgate.description') },
    theme: ROLE_THEME_BY_KEY.floodgate,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('brick'),
    label: 'Brick',
    shortLabel: 'Brick',
    get description() { return t('roles.group.brick.description') },
    theme: ROLE_THEME_BY_KEY.brick,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('garnet'),
    label: 'Garnet',
    shortLabel: 'Garnet',
    get description() { return t('roles.group.garnet.description') },
    theme: ROLE_THEME_BY_KEY.garnet,
  },
]

const CARD_GROUP_DEFINITIONS: DeckGroupDefinition[] = [
  ...CARD_ORIGIN_DEFINITIONS,
  ...CARD_ROLE_DEFINITIONS,
]

const ROLE_DEFINITION_BY_KEY = new Map(CARD_ROLE_DEFINITIONS.map((definition) => [definition.key.value, definition]))
const ORIGIN_DEFINITION_BY_KEY = new Map(
  CARD_ORIGIN_DEFINITIONS.map((definition) => [definition.key.value, definition]),
)
const GROUP_DEFINITION_BY_KEY = new Map(
  CARD_GROUP_DEFINITIONS.map((definition) => [serializeGroupKey(definition.key), definition]),
)
const CARD_ROLE_KEY_SET = new Set(CARD_ROLE_DEFINITIONS.map((definition) => definition.key.value))
const CARD_ORIGIN_KEY_SET = new Set(CARD_ORIGIN_DEFINITIONS.map((definition) => definition.key.value))

export function serializeGroupKey(groupKey: GroupKey): string {
  return `${groupKey.type}:${groupKey.value}`
}

export function areGroupKeysEqual(left: GroupKey | null | undefined, right: GroupKey | null | undefined): boolean {
  if (!left || !right) {
    return left === right
  }

  return left.type === right.type && left.value === right.value
}

export function getCardRoleDefinition(role: CardRole): CardRoleDefinition {
  return ROLE_DEFINITION_BY_KEY.get(role) ?? CARD_ROLE_DEFINITIONS[0]
}

export function getCardOriginDefinition(origin: CardOrigin): CardOriginDefinition {
  return ORIGIN_DEFINITION_BY_KEY.get(origin) ?? CARD_ORIGIN_DEFINITIONS[0]
}

export function getDeckGroupTheme(groupKey: GroupKey): ClassificationTheme {
  return GROUP_DEFINITION_BY_KEY.get(serializeGroupKey(groupKey))?.theme ?? CARD_GROUP_DEFINITIONS[0].theme
}

/** "Origen: Engine" / "Rol: Starter" (en inglés, "Origin: Engine" / "Role: Starter"). */
export function getQualifiedDeckGroupLabel(group: Pick<DeckGroupDefinition, 'kind' | 'label'>): string {
  return t(group.kind === 'origin' ? 'roles.group.qualifiedOrigin' : 'roles.group.qualifiedRole', { label: group.label })
}

/** Roles que ya no existen y el que los reemplaza (se unificaron al simplificar la categorización). */
const LEGACY_ROLE_REPLACEMENTS: Record<string, CardRole> = {
  board_breaker: 'boardbreaker',
  removal: 'boardbreaker',
  combo_piece: 'enabler',
}

/** Roles que se eliminaron sin reemplazo: se descartan sin pedir revisión. */
const RETIRED_ROLE_KEYS: ReadonlySet<string> = new Set(['tech'])

export function isRetiredCardRole(value: unknown): boolean {
  return typeof value === 'string' && RETIRED_ROLE_KEYS.has(value)
}

/** Roles que hacen avanzar tu propio plan (el resto frena al rival o es utilidad). */
const GAME_PLAN_ROLE_KEYS: ReadonlySet<CardRole> = new Set(['starter', 'extender', 'enabler', 'searcher', 'draw', 'payoff', 'recovery'])

export function normalizeCardRoleKey(value: unknown): CardRole | null {
  if (typeof value !== 'string') {
    return null
  }

  return CARD_ROLE_KEY_SET.has(value as CardRole) ? (value as CardRole) : (LEGACY_ROLE_REPLACEMENTS[value] ?? null)
}

/** Roles guardados de una carta: los viejos se reemplazan por su equivalente y se quitan repetidos. */
export function normalizeStoredRoles(value: unknown): CardRole[] {
  if (!Array.isArray(value)) {
    return []
  }

  const roles: CardRole[] = []

  for (const entry of value) {
    const role = normalizeCardRoleKey(entry)

    if (role && !roles.includes(role)) {
      roles.push(role)
    }
  }

  return roles
}

/**
 * Origen guardado de una carta. El antiguo "Hybrid" ya no existe: pasa a Engine si la carta tiene algún
 * rol de tu plan y a Non-engine si no.
 */
export function resolveStoredCardOrigin(value: unknown, roles: readonly CardRole[]): CardOrigin | null {
  if (value === 'hybrid') {
    return roles.some((role) => GAME_PLAN_ROLE_KEYS.has(role)) ? 'engine' : 'non_engine'
  }

  return normalizeCardOriginKey(value)
}

export function normalizeCardOriginKey(value: unknown): CardOrigin | null {
  if (value === 'non-engine') {
    return 'non_engine'
  }

  if (typeof value !== 'string') {
    return null
  }

  return CARD_ORIGIN_KEY_SET.has(value as CardOrigin) ? (value as CardOrigin) : null
}

export function parseStoredGroupKey(value: unknown): ParsedStoredGroupKey {
  if (isRecord(value)) {
    const type = value.type

    if (type === 'origin') {
      const normalizedOrigin = normalizeCardOriginKey(value.value)
      return {
        groupKey: normalizedOrigin ? createOriginGroupKey(normalizedOrigin) : null,
        isLegacy: false,
      }
    }

    if (type === 'role') {
      const normalizedRole = normalizeCardRoleKey(value.value)
      return {
        groupKey: normalizedRole ? createRoleGroupKey(normalizedRole) : null,
        isLegacy: false,
      }
    }

    return {
      groupKey: null,
      isLegacy: false,
    }
  }

  if (typeof value === 'string') {
    const normalizedOrigin = normalizeCardOriginKey(value)

    if (normalizedOrigin) {
      return {
        groupKey: createOriginGroupKey(normalizedOrigin),
        isLegacy: true,
      }
    }

    const normalizedRole = normalizeCardRoleKey(value)

    if (normalizedRole) {
      return {
        groupKey: createRoleGroupKey(normalizedRole),
        isLegacy: true,
      }
    }

    return {
      groupKey: null,
      isLegacy: true,
    }
  }

  return {
    groupKey: null,
    isLegacy: false,
  }
}

export function isCardOriginGroupKey(groupKey: GroupKey): groupKey is Extract<GroupKey, { type: 'origin' }> {
  return groupKey.type === 'origin'
}

export function mergeCardOrigins(
  currentOrigin: CardOrigin | null,
  nextOrigin: CardOrigin | null,
): CardOrigin | null {
  if (currentOrigin === nextOrigin || nextOrigin === null) {
    return currentOrigin ?? nextOrigin
  }

  if (currentOrigin === null) {
    return nextOrigin
  }

  // Dos orígenes distintos para la misma carta: manda el de Engine.
  return currentOrigin === 'engine' || nextOrigin === 'engine' ? 'engine' : currentOrigin
}

function buildDerivedDeckGroups(cards: CardEntry[]): DerivedDeckGroup[] {
  return CARD_GROUP_DEFINITIONS.map((definition) => {
    const matchingCards = cards.filter((card) => cardMatchesGroup(card, definition.key))

    return {
      ...definition,
      cardIds: matchingCards.map((card) => card.id),
      cardNames: matchingCards.map((card) => card.name),
      copies: matchingCards.reduce((total, card) => total + card.copies, 0),
    }
  })
}

export function buildDerivedDeckGroupMap(cards: CardEntry[]): Map<string, DerivedDeckGroup> {
  return new Map(buildDerivedDeckGroups(cards).map((group) => [serializeGroupKey(group.key), group]))
}

export function cardMatchesGroup(card: CardEntry, groupKey: GroupKey): boolean {
  if (isCardOriginGroupKey(groupKey)) {
    return matchesOriginGroup(card.origin, groupKey.value)
  }

  return card.roles.includes(groupKey.value)
}

function matchesOriginGroup(origin: CardOrigin | null, groupKey: CardOrigin): boolean {
  return origin === groupKey
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
