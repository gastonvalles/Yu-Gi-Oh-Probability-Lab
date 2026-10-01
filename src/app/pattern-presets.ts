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
const DEAD_CARD_ROLES: readonly CardRole[] = ['brick', 'garnet']

export const PATTERN_PRESET_DEFINITIONS: readonly PatternPresetDefinition[] = [
  {
    id: 'starter_opening',
    tier: 'universal',
    kind: 'opening',
    title: 'Salida básica',
    description: 'Robar al menos un Starter: la condición mínima para que cualquier deck arranque su jugada.',
    technicalSubtitle: '1+ Starter',
    build: () =>
      createMatcherPattern('Salida básica', 'opening', [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
      ]),
    describeProbability: (probability) => `Abrís al menos un Starter en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'dead_cards_problem',
    tier: 'universal',
    kind: 'problem',
    title: '2+ cartas muertas',
    description: 'Dos o más Bricks o Garnets en mano dejan la jugada sin recursos, en cualquier deck.',
    technicalSubtitle: '2+ Brick o Garnet',
    build: (cards) => {
      const deadCards = collectCardIdsByRoles(cards, DEAD_CARD_ROLES)

      return createMatcherPattern('2+ cartas muertas', 'problem', [
        {
          matcher: deadCards.length > 0 ? { type: 'card_pool', value: deadCards } : { type: 'role', value: 'brick' },
          quantity: 2,
          kind: 'include',
        },
      ])
    },
    describeProbability: (probability) => `Abrís 2 o más cartas muertas en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'starter_extender_opening',
    tier: 'generic',
    kind: 'opening',
    title: 'Salida con seguimiento',
    description: 'Starter y Extender en cartas distintas: la mano puede continuar si la interrumpen.',
    technicalSubtitle: 'Starter + Extender',
    build: () =>
      createMatcherPattern(
        'Salida con seguimiento',
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
        ],
        { allowSharedCards: false, matchMode: 'all', minimumMatches: 2 },
      ),
    describeProbability: (probability) => `Abrís Starter y Extender en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'starter_interaction_opening',
    tier: 'generic',
    kind: 'opening',
    title: 'Salida con interacción',
    description: 'Arrancar y además poder frenar al rival con una Handtrap o Disruption.',
    technicalSubtitle: 'Starter + Handtrap/Disruption',
    build: (cards) =>
      createMatcherPattern(
        'Salida con interacción',
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          { matcher: roleMatcher(cards, INTERACTION_ROLES), quantity: 1, kind: 'include' },
        ],
        { allowSharedCards: false, matchMode: 'all', minimumMatches: 2 },
      ),
    describeProbability: (probability) => `Abrís Starter con interacción en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'starter_boardbreaker_opening',
    tier: 'generic',
    kind: 'opening',
    title: 'Salida que rompe campo',
    description: 'Yendo segundo: arrancar y tener con qué romper el campo del rival.',
    technicalSubtitle: 'Starter + Boardbreaker',
    build: () =>
      createMatcherPattern(
        'Salida que rompe campo',
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'role', value: 'boardbreaker' }, quantity: 1, kind: 'include' },
        ],
        { allowSharedCards: false, matchMode: 'all', minimumMatches: 2, turnContext: 'second' },
      ),
    describeProbability: (probability) => `Yendo segundo, abrís Starter y Boardbreaker en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'no_answer_second_problem',
    tier: 'generic',
    kind: 'problem',
    title: 'Sin respuesta yendo 2º',
    description: 'Yendo segundo sin Handtrap, Disruption ni Boardbreaker quedás a merced del campo rival.',
    technicalSubtitle: '0 Handtrap, Disruption o Boardbreaker',
    build: () =>
      createMatcherPattern(
        'Sin respuesta yendo 2º',
        'problem',
        (['handtrap', 'disruption', 'boardbreaker'] as const).map((role) => ({
          matcher: { type: 'role', value: role } as const,
          quantity: 1,
          kind: 'exclude' as const,
        })),
        { allowSharedCards: true, matchMode: 'all', minimumMatches: 3, turnContext: 'second' },
      ),
    describeProbability: (probability) => `Yendo segundo, no tenés respuesta en ${formatProbability(probability)} de las manos.`,
  },
]

// Reglas de sistema de versiones anteriores: se quitan de las reglas propias al migrar.
const LEGACY_SYSTEM_RULE_NAMES = new Set(
  [
    'Salida básica',
    'Salida con seguimiento',
    'Salida con interacción',
    'Salida para romper campo',
    'Mano sin Starter',
    '2+ Bricks en mano',
    '3+ Non-engine en mano',
    'Mano sin interacción',
    'Extender sin Starter',
    'Solo Brick/Garnet en engine',
    'starter + non-engine',
    'starter + non engine',
    'starter + extender sin brick',
    '3 o mas ht en mano',
    '3 o más ht en mano',
    '3 o mas handtrap',
    '3 o más handtrap',
    '3 o mas bbs en mano',
    '3 o más bbs en mano',
    '3 o mas boardbreaker',
    '3 o más boardbreaker',
    '4 o mas non-engine',
    '4 o más non-engine',
    'al menos 1 interacción',
    'al menos 1 starter',
    'starter + extender',
    'starter + protección',
    'engine + interacción',
    'sin starter',
    '2 o más bricks',
    '3 o más non-engine',
    'sin interacción',
    'mano jugable mínima',
  ].map(normalizePatternName),
)

/** Sólo las universales se pueden renombrar; la condición de la regla no cambia. */
export function buildPatternPresets(cards: CardEntry[], ruleNames: SystemRuleNames = {}): PatternPreset[] {
  return PATTERN_PRESET_DEFINITIONS.map(({ build, ...definition }) => {
    const custom = definition.tier === 'universal' ? normalizeRuleName(ruleNames[definition.id] ?? '') : ''
    const title = custom || definition.title

    return {
      ...definition,
      title,
      defaultTitle: definition.title,
      // Id estable: la selección y los resultados no cambian al recalcular ni al renombrar.
      pattern: { ...build(cards), id: getSystemRuleId(definition.id), name: title },
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
