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
  handtrap: { color: '#3b82f6', rgb: '59 130 246' },
  disruption: { color: '#2563eb', rgb: '37 99 235' },
  boardbreaker: { color: '#f59e0b', rgb: '245 158 11' },
  floodgate: { color: '#a855f7', rgb: '168 85 247' },
  removal: { color: '#f97316', rgb: '249 115 22' },
  searcher: { color: '#06b6d4', rgb: '6 182 212' },
  draw: { color: '#38bdf8', rgb: '56 189 248' },
  recovery: { color: '#22c55e', rgb: '34 197 94' },
  combo_piece: { color: '#8b5cf6', rgb: '139 92 246' },
  payoff: { color: '#10b981', rgb: '16 185 129' },
  brick: { color: '#ef4444', rgb: '239 68 68' },
  garnet: { color: '#b91c1c', rgb: '185 28 28' },
  tech: { color: '#94a3b8', rgb: '148 163 184' },
}

const ORIGIN_THEME_BY_KEY: Record<CardOrigin, ClassificationTheme> = {
  engine: { color: 'var(--primary)', rgb: 'var(--primary-rgb)' },
  non_engine: { color: 'var(--accent)', rgb: 'var(--accent-rgb)' },
  hybrid: { color: 'var(--warning)', rgb: 'var(--warning-rgb)' },
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
  {
    kind: 'origin',
    key: createOriginGroupKey('hybrid'),
    label: 'Hybrid / Flex',
    shortLabel: 'Hybrid',
    description: 'Cruza ambos espacios. Cuenta tanto para Engine como para Non-engine.',
    theme: ORIGIN_THEME_BY_KEY.hybrid,
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
    description: 'Habilita una línea, condición o ventana que otras cartas necesitan para funcionar.',
    theme: ROLE_THEME_BY_KEY.enabler,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('searcher'),
    label: 'Searcher',
    shortLabel: 'Searcher',
    description: 'Busca piezas específicas del deck, GY o zonas públicas.',
    theme: ROLE_THEME_BY_KEY.searcher,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('draw'),
    label: 'Draw',
    shortLabel: 'Draw',
    description: 'Repone o profundiza la mano con robo directo o filtrado fuerte.',
    theme: ROLE_THEME_BY_KEY.draw,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('combo_piece'),
    label: 'Combo Piece',
    shortLabel: 'Combo',
    description: 'Pieza necesaria dentro de una secuencia concreta, aunque no arranque sola.',
    theme: ROLE_THEME_BY_KEY.combo_piece,
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
    key: createRoleGroupKey('handtrap'),
    label: 'Handtrap',
    shortLabel: 'HT',
    description: 'Interacción que frena al rival desde la mano.',
    theme: ROLE_THEME_BY_KEY.handtrap,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('disruption'),
    label: 'Disruption',
    shortLabel: 'Disruption',
    description: 'Interrumpe jugadas rivales durante la secuencia o en mesa.',
    theme: ROLE_THEME_BY_KEY.disruption,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('boardbreaker'),
    label: 'Boardbreaker',
    shortLabel: 'Boardbreaker',
    description: 'Rompe campo rival y abre espacio para jugar yendo segundo.',
    theme: ROLE_THEME_BY_KEY.boardbreaker,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('floodgate'),
    label: 'Floodgate',
    shortLabel: 'Floodgate',
    description: 'Limita líneas del rival por presencia o efecto continuo.',
    theme: ROLE_THEME_BY_KEY.floodgate,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('removal'),
    label: 'Removal',
    shortLabel: 'Removal',
    description: 'Saca cartas del rival por destrucción, banish, bounce o similares.',
    theme: ROLE_THEME_BY_KEY.removal,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('brick'),
    label: 'Brick',
    shortLabel: 'Brick',
    description: 'Carta que preferís no robar al inicio si no viene acompañada.',
    theme: ROLE_THEME_BY_KEY.brick,
  },
  {
    kind: 'role',
    key: createRoleGroupKey('garnet'),
    label: 'Garnet',
    shortLabel: 'Garnet',
    description: 'Pieza que idealmente queda en deck porque en mano invalida o empeora una línea.',
    theme: ROLE_THEME_BY_KEY.garnet,
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

export function parseSerializedGroupKey(value: string): GroupKey | null {
  const [type, rawValue] = value.split(':', 2)

  if (type === 'origin') {
    const normalizedOrigin = normalizeCardOriginKey(rawValue)
    return normalizedOrigin ? createOriginGroupKey(normalizedOrigin) : null
  }

  if (type === 'role') {
    const normalizedRole = normalizeCardRoleKey(rawValue)
    return normalizedRole ? createRoleGroupKey(normalizedRole) : null
  }

  return null
}

export function getCardRoleDefinition(role: CardRole): CardRoleDefinition {
  return ROLE_DEFINITION_BY_KEY.get(role) ?? CARD_ROLE_DEFINITIONS[0]
}

export function getCardOriginDefinition(origin: CardOrigin): CardOriginDefinition {
  return ORIGIN_DEFINITION_BY_KEY.get(origin) ?? CARD_ORIGIN_DEFINITIONS[0]
}

export function getDeckGroupDefinition(groupKey: GroupKey): DerivedDeckGroup {
  const definition = GROUP_DEFINITION_BY_KEY.get(serializeGroupKey(groupKey)) ?? CARD_GROUP_DEFINITIONS[0]

  return {
    ...definition,
    cardIds: [],
    cardNames: [],
    copies: 0,
  }
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

export function normalizeCardRoleKey(value: unknown): CardRole | null {
  if (value === 'board_breaker') {
    return 'boardbreaker'
  }

  if (typeof value !== 'string') {
    return null
  }

  return CARD_ROLE_KEY_SET.has(value as CardRole) ? (value as CardRole) : null
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

export function isCardRoleGroupKey(groupKey: GroupKey): groupKey is Extract<GroupKey, { type: 'role' }> {
  return groupKey.type === 'role'
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

  if (currentOrigin === 'hybrid' || nextOrigin === 'hybrid') {
    return 'hybrid'
  }

  return currentOrigin === nextOrigin ? currentOrigin : 'hybrid'
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

export function buildDeckRoleSummary(cards: CardEntry[]): DerivedDeckGroup[] {
  return buildDerivedDeckGroups(cards).filter((group) => group.copies > 0)
}

export function cardMatchesGroup(card: CardEntry, groupKey: GroupKey): boolean {
  if (isCardOriginGroupKey(groupKey)) {
    return matchesOriginGroup(card.origin, groupKey.value)
  }

  return card.roles.includes(groupKey.value)
}

function matchesOriginGroup(origin: CardOrigin | null, groupKey: CardOrigin): boolean {
  if (origin === null) {
    return false
  }

  if (groupKey === 'engine') {
    return origin === 'engine' || origin === 'hybrid'
  }

  if (groupKey === 'non_engine') {
    return origin === 'non_engine' || origin === 'hybrid'
  }

  return origin === 'hybrid'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
