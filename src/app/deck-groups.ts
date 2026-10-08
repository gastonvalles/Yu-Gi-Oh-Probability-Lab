import type { CardEntry, CardOrigin, CardRole, GroupKey } from '../types'

export type DeckGroupKind = 'origin' | 'role'

export interface ClassificationTheme {
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

export interface CardOriginDefinition extends DeckGroupDefinition {
  kind: 'origin'
  key: Extract<GroupKey, { type: 'origin' }>
}

export interface CardRoleDefinition extends DeckGroupDefinition {
  kind: 'role'
  key: Extract<GroupKey, { type: 'role' }>
}

export interface DerivedDeckGroup extends DeckGroupDefinition {
  cardIds: string[]
  cardNames: string[]
  copies: number
}

export interface ParsedStoredGroupKey {
  groupKey: GroupKey | null
  isLegacy: boolean
}

const ROLE_THEME_BY_KEY: Record<CardRole, ClassificationTheme> = {
  starter: { color: '#9b00ff', rgb: '155 0 255' },
  extender: { color: '#00ffa3', rgb: '0 255 163' },
  enabler: { color: '#14b8a6', rgb: '20 184 166' },
  disruption: { color: '#2563eb', rgb: '37 99 235' },
  boardbreaker: { color: '#f59e0b', rgb: '245 158 11' },
  searcher: { color: '#06b6d4', rgb: '6 182 212' },
  recovery: { color: '#22c55e', rgb: '34 197 94' },
  payoff: { color: '#10b981', rgb: '16 185 129' },
  brick: { color: '#ef4444', rgb: '239 68 68' },
  tech: { color: '#94a3b8', rgb: '148 163 184' },
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
    description: 'Pertenece al motor o plan principal del deck.',
    theme: ORIGIN_THEME_BY_KEY.engine,
  },
  {
    kind: 'origin',
    key: createOriginGroupKey('non_engine'),
    label: 'Non-engine',
    shortLabel: 'Non-engine',
    description: 'Aporta interacción, cobertura o soporte por fuera del motor principal.',
    theme: ORIGIN_THEME_BY_KEY.non_engine,
  },
]

export const CARD_ROLE_DEFINITIONS: CardRoleDefinition[] = [
  {
    kind: 'role',
    key: createRoleGroupKey('starter'),
    label: 'Starter',
    shortLabel: 'Starter',
    description: 'Carta que por sí sola te pone a jugar o encuentra el punto de arranque.',
    theme: ROLE_THEME_BY_KEY.starter,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('extender'),
    label: 'Extender',
    shortLabel: 'Extender',
    description: 'Suma cuerpo, recursos o continuidad una vez que la mano ya empezó.',
    theme: ROLE_THEME_BY_KEY.extender,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('enabler'),
    label: 'Enabler',
    shortLabel: 'Enabler',
    description: 'Habilita la línea: pieza o condición que otras cartas necesitan para funcionar.',
    theme: ROLE_THEME_BY_KEY.enabler,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('searcher'),
    label: 'Searcher',
    shortLabel: 'Searcher',
    description: 'Busca piezas del deck, GY o zonas públicas, o te hace robar más cartas.',
    theme: ROLE_THEME_BY_KEY.searcher,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('payoff'),
    label: 'Payoff',
    shortLabel: 'Payoff',
    description: 'Convierte la línea en ventaja real, presión o cierre de turno.',
    theme: ROLE_THEME_BY_KEY.payoff,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('recovery'),
    label: 'Recovery',
    shortLabel: 'Recovery',
    description: 'Recupera recursos, recicla piezas o recompone después de interrupción.',
    theme: ROLE_THEME_BY_KEY.recovery,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('disruption'),
    label: 'Disruption',
    shortLabel: 'Disruption',
    description: 'Frena al rival desde la mano o en mesa: handtraps, trampas, negaciones y floodgates.',
    theme: ROLE_THEME_BY_KEY.disruption,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('boardbreaker'),
    label: 'Boardbreaker',
    shortLabel: 'Boardbreaker',
    description: 'Rompe campo o quita cartas del rival y abre espacio para jugar, sobre todo yendo segundo.',
    theme: ROLE_THEME_BY_KEY.boardbreaker,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('brick'),
    label: 'Brick',
    shortLabel: 'Brick',
    description: 'Carta que preferís no robar: incómoda, o inútil en mano si no viene acompañada.',
    theme: ROLE_THEME_BY_KEY.brick,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('tech'),
    label: 'Tech',
    shortLabel: 'Tech',
    description: 'Slot flexible para metajuego o matchup sin ser parte estable del core.',
    theme: ROLE_THEME_BY_KEY.tech,
  },
]

export const CARD_GROUP_DEFINITIONS: DeckGroupDefinition[] = [
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

export function getDeckGroupKindLabel(kind: DeckGroupKind): string {
  return kind === 'origin' ? 'Origen' : 'Rol'
}

export function getQualifiedDeckGroupLabel(group: Pick<DeckGroupDefinition, 'kind' | 'label'>): string {
  return `${getDeckGroupKindLabel(group.kind)}: ${group.label}`
}

/** Roles que ya no existen y el que los reemplaza (se unificaron al simplificar la categorización). */
const LEGACY_ROLE_REPLACEMENTS: Record<string, CardRole> = {
  board_breaker: 'boardbreaker',
  handtrap: 'disruption',
  floodgate: 'disruption',
  removal: 'boardbreaker',
  draw: 'searcher',
  combo_piece: 'enabler',
  garnet: 'brick',
}

/** Roles que hacen avanzar tu propio plan (el resto frena al rival o es utilidad). */
const GAME_PLAN_ROLE_KEYS: ReadonlySet<CardRole> = new Set(['starter', 'extender', 'enabler', 'searcher', 'payoff', 'recovery'])

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

export function buildDerivedDeckGroups(cards: CardEntry[]): DerivedDeckGroup[] {
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
