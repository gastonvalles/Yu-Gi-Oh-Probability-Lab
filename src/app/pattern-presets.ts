import { t } from '../i18n'
import type { CardEntry, CardRole, HandPattern, PatternKind } from '../types'
import { createMatcherPattern } from './pattern-factory'
import { getPatternDefinitionKey, normalizePatternName } from './patterns'

/**
 * - universal: vale para cualquier deck de Yu-Gi-Oh!; siempre activa.
 * - generic: aplica a la mayoría de los decks; se puede desactivar.
 */
export type SystemRuleTier = 'universal' | 'generic'

export interface PatternPresetDefinition {
  id: string
  tier: SystemRuleTier
  kind: PatternKind
  title: string
  /** Qué mide y por qué importa, en una frase. */
  description: string
  /** Condición en pocas palabras (p. ej. "Starter + Extender"). */
  technicalSubtitle: string
  build: (cards: CardEntry[]) => HandPattern
  describeProbability: (probability: number) => string
}

export interface PatternPreset extends Omit<PatternPresetDefinition, 'build'> {
  /** Nombre original del catálogo (el `title` puede ser uno personalizado por el usuario). */
  defaultTitle: string
  pattern: HandPattern
}

/** Nombres personalizados de reglas universales, por id del catálogo. */
export type SystemRuleNames = Readonly<Record<string, string>>

export const MAX_RULE_NAME_LENGTH = 60

/** Nombre sin espacios de más y con el largo máximo; vacío si no queda nada. */
export function normalizeRuleName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_RULE_NAME_LENGTH).trim()
}

const INTERACTION_ROLES: readonly CardRole[] = ['handtrap', 'disruption']
/** Todo lo que sirve para responder cuando el rival juega primero. */
const RESPONSE_ROLES: readonly CardRole[] = ['handtrap', 'boardbreaker']
const DEAD_CARD_ROLES: readonly CardRole[] = ['brick', 'garnet']

export const PATTERN_PRESET_DEFINITIONS: readonly PatternPresetDefinition[] = [
  {
    id: 'starter_opening',
    tier: 'universal',
    kind: 'opening',
    get title() {
      return t('rules.preset.starterOpening.title')
    },
    get description() {
      return t('rules.preset.starterOpening.description')
    },
    get technicalSubtitle() {
      return t('rules.preset.starterOpening.subtitle')
    },
    build: () =>
      createMatcherPattern(t('rules.preset.starterOpening.title'), 'opening', [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
      ]),
    describeProbability: (probability) => t('rules.preset.starterOpening.probability', { percent: formatProbability(probability) }),
  },
  {
    id: 'dead_cards_problem',
    tier: 'universal',
    kind: 'problem',
    get title() {
      return t('rules.preset.deadCards.title')
    },
    get description() {
      return t('rules.preset.deadCards.description')
    },
    get technicalSubtitle() {
      return t('rules.preset.deadCards.subtitle')
    },
    build: (cards) => {
      const deadCards = collectCardIdsByRoles(cards, DEAD_CARD_ROLES)

      return createMatcherPattern(t('rules.preset.deadCards.title'), 'problem', [
        {
          matcher: deadCards.length > 0 ? { type: 'card_pool', value: deadCards } : { type: 'role', value: 'brick' },
          quantity: 2,
          kind: 'include',
        },
      ])
    },
    describeProbability: (probability) => t('rules.preset.deadCards.probability', { percent: formatProbability(probability) }),
  },
  {
    id: 'starter_extender_opening',
    tier: 'generic',
    kind: 'opening',
    get title() {
      return t('rules.preset.starterExtender.title')
    },
    get description() {
      return t('rules.preset.starterExtender.description')
    },
    get technicalSubtitle() {
      return t('rules.preset.starterExtender.subtitle')
    },
    build: () =>
      createMatcherPattern(
        t('rules.preset.starterExtender.title'),
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
        ],
        { allowSharedCards: false, matchMode: 'all', minimumMatches: 2 },
      ),
    describeProbability: (probability) => t('rules.preset.starterExtender.probability', { percent: formatProbability(probability) }),
  },
  {
    id: 'starter_interaction_opening',
    tier: 'generic',
    kind: 'opening',
    get title() {
      return t('rules.preset.starterInteraction.title')
    },
    get description() {
      return t('rules.preset.starterInteraction.description')
    },
    get technicalSubtitle() {
      return t('rules.preset.starterInteraction.subtitle')
    },
    build: (cards) =>
      createMatcherPattern(
        t('rules.preset.starterInteraction.title'),
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          { matcher: roleMatcher(cards, INTERACTION_ROLES), quantity: 1, kind: 'include' },
        ],
        { allowSharedCards: false, matchMode: 'all', minimumMatches: 2 },
      ),
    describeProbability: (probability) => t('rules.preset.starterInteraction.probability', { percent: formatProbability(probability) }),
  },
  {
    id: 'starter_boardbreaker_opening',
    tier: 'generic',
    kind: 'opening',
    get title() {
      return t('rules.preset.starterBoardbreaker.title')
    },
    get description() {
      return t('rules.preset.starterBoardbreaker.description')
    },
    get technicalSubtitle() {
      return t('rules.preset.starterBoardbreaker.subtitle')
    },
    build: () =>
      createMatcherPattern(
        t('rules.preset.starterBoardbreaker.title'),
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'role', value: 'boardbreaker' }, quantity: 1, kind: 'include' },
        ],
        { allowSharedCards: false, matchMode: 'all', minimumMatches: 2, turnContext: 'second' },
      ),
    describeProbability: (probability) => t('rules.preset.starterBoardbreaker.probability', { percent: formatProbability(probability) }),
  },
  {
    id: 'no_answer_second_problem',
    tier: 'generic',
    kind: 'problem',
    get title() {
      return t('rules.preset.noAnswerSecond.title')
    },
    get description() {
      return t('rules.preset.noAnswerSecond.description')
    },
    get technicalSubtitle() {
      return t('rules.preset.noAnswerSecond.subtitle')
    },
    // Una sola condición sobre todas esas cartas ("ninguna Handtrap ni Boardbreaker") y solo las 5 cartas iniciales: la que robás yendo 2º no cuenta.
    build: (cards) => ({
      ...createMatcherPattern(
        t('rules.preset.noAnswerSecond.title'),
        'problem',
        [{ matcher: roleMatcher(cards, RESPONSE_ROLES), quantity: 1, kind: 'exclude' }],
        { allowSharedCards: true, matchMode: 'all', turnContext: 'second' },
      ),
      ignoresDraw: true,
    }),
    describeProbability: (probability) => t('rules.preset.noAnswerSecond.probability', { percent: formatProbability(probability) }),
  },
]

// Reglas de sistema de versiones anteriores: se quitan de las reglas propias al migrar. Un nombre por línea.
const LEGACY_SYSTEM_RULE_NAMES = new Set(
  // i18n-ignore: nombres viejos guardados por versiones anteriores (datos de migración, no texto de la interfaz)
  `Salida básica
Salida con seguimiento
Salida con interacción
Salida para romper campo
Mano sin Starter
2+ Bricks en mano
3+ Non-engine en mano
Mano sin interacción
Extender sin Starter
Solo Brick/Garnet en engine
starter + non-engine
starter + non engine
starter + extender sin brick
3 o mas ht en mano
3 o más ht en mano
3 o mas handtrap
3 o más handtrap
3 o mas bbs en mano
3 o más bbs en mano
3 o mas boardbreaker
3 o más boardbreaker
4 o mas non-engine
4 o más non-engine
al menos 1 interacción
al menos 1 starter
starter + extender
starter + protección
engine + interacción
sin starter
2 o más bricks
3 o más non-engine
sin interacción
mano jugable mínima`
    .split('\n')
    .map(normalizePatternName),
)

/** Sólo las universales se pueden renombrar; la condición de la regla no cambia. */
export function buildPatternPresets(cards: CardEntry[], ruleNames: SystemRuleNames = {}): PatternPreset[] {
  return PATTERN_PRESET_DEFINITIONS.map(({ build, ...definition }) => {
    const custom = definition.tier === 'universal' ? normalizeRuleName(ruleNames[definition.id] ?? '') : ''
    const title = custom || definition.title
    const id = getSystemRuleId(definition.id)
    const built = build(cards)

    return {
      ...definition,
      title,
      defaultTitle: definition.title,
      // Ids estables (regla y condiciones): la selección y los resultados no cambian al recalcular ni al
      // renombrar, y la caché por contenido coincide aunque las reglas se armen de nuevo.
      pattern: {
        ...built,
        id,
        name: title,
        conditions: built.conditions.map((condition, index) => ({ ...condition, id: `${id}-c${index}` })),
      },
    }
  })
}

export function getSystemRuleId(presetId: string): string {
  return `system-${presetId}`
}

/** Reglas que entran al cálculo: universales + genéricas activas + propias (sin duplicar). */
export function buildActiveRuleSet(
  cards: CardEntry[],
  customPatterns: HandPattern[],
  disabledGenericRuleIds: readonly string[],
  ruleNames: SystemRuleNames = {},
): HandPattern[] {
  const disabled = new Set(disabledGenericRuleIds)
  const overriddenIds = new Set(customPatterns.flatMap((pattern) => (pattern.systemRuleId ? [pattern.systemRuleId] : [])))
  const systemPatterns = buildPatternPresets(cards, ruleNames)
    .filter((preset) => (preset.tier === 'universal' || !disabled.has(preset.id)) && !overriddenIds.has(preset.id))
    .map((preset) => preset.pattern)
  const seenKeys = new Set(systemPatterns.map(getPatternDefinitionKey))
  const calculableCustom = customPatterns.filter((pattern) => {
    // La versión editada de una genérica apagada no cuenta.
    if (pattern.systemRuleId && disabled.has(pattern.systemRuleId)) {
      return false
    }

    const key = getPatternDefinitionKey(pattern)

    if (seenKeys.has(key) || !pattern.conditions.some((condition) => condition.matcher !== null)) {
      return false
    }

    seenKeys.add(key)
    return true
  })

  return [...systemPatterns, ...calculableCustom]
}

export function isLegacySystemRule(pattern: HandPattern, cards: CardEntry[]): boolean {
  // Una genérica editada por el usuario lleva systemRuleId: es suya, aunque conserve el nombre del catálogo.
  if (pattern.systemRuleId) {
    return false
  }

  const systemKeys = new Set(buildPatternPresets(cards).map((preset) => getPatternDefinitionKey(preset.pattern)))
  return LEGACY_SYSTEM_RULE_NAMES.has(normalizePatternName(pattern.name)) || systemKeys.has(getPatternDefinitionKey(pattern))
}

function roleMatcher(cards: CardEntry[], roles: readonly CardRole[]) {
  const pool = collectCardIdsByRoles(cards, roles)
  return pool.length > 0 ? ({ type: 'card_pool', value: pool } as const) : ({ type: 'role', value: roles[0] } as const)
}

function collectCardIdsByRoles(cards: CardEntry[], roles: readonly CardRole[]): string[] {
  const expectedRoles = new Set<CardRole>(roles)

  return cards.filter((card) => card.roles.some((role) => expectedRoles.has(role))).map((card) => card.id)
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
