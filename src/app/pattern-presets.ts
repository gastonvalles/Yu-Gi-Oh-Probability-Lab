import type { CardEntry, CardRole, HandPattern, PatternKind } from '../types'
import { createMatcherPattern } from './pattern-factory'
import { getPatternDefinitionKey, normalizePatternName } from './patterns'

export type PatternPresetCategory = 'consistency' | 'interaction' | 'problems' | 'advanced'

export interface PatternPresetDefinition {
  id: string
  category: PatternPresetCategory
  title: string
  description: string
  technicalSubtitle: string
  kind: PatternKind
  simpleLabel?: string
  recommended?: boolean
  build: (cards: CardEntry[]) => HandPattern | null
  describeProbability: (probability: number) => string
}

export interface PatternPreset {
  id: string
  category: PatternPresetCategory
  title: string
  description: string
  technicalSubtitle: string
  kind: PatternKind
  simpleLabel?: string
  recommended: boolean
  pattern: HandPattern
  describeProbability: (probability: number) => string
}

export const PROBABILITY_MODEL_VISIBILITY = {
  maxEntriesPerGroup: 3,
  riskThreshold: 0.1,
  strengthThreshold: 0.85,
} as const

export const QUICK_OVERVIEW_PRESET_IDS = [
  // 4 salidas
  'starter_opening',
  'starter_extender_opening',
  'starter_protection_opening',
  'engine_interaction_opening',
  // 5 problemas
  'no_starter_problem',
  'double_brick_problem',
  'no_interaction_problem',
  'triple_non_engine_problem',
  'extender_without_starter_problem',
] as const

/** Only the 3 truly universal rules are auto-activated. */
export const AUTO_BASE_PRESET_IDS = [
  'starter_opening',
  'no_starter_problem',
  'double_brick_problem',
] as const

export const SIMPLE_MODE_DEFAULT_PRESET_IDS = [...QUICK_OVERVIEW_PRESET_IDS] as const

const INTERACTION_ROLES: readonly CardRole[] = ['handtrap', 'disruption'] as const

const OBSOLETE_SYSTEM_PATTERN_NAMES = new Set([
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
  // v7: old preset names replaced by unified vocabulary
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
])

export const PATTERN_PRESET_DEFINITIONS: readonly PatternPresetDefinition[] = [
  {
    id: 'starter_opening',
    category: 'consistency',
    title: 'Salida básica',
    description: 'La condición mínima para que la mano juegue. Sin starter, no arrancás.',
    technicalSubtitle: 'con 1+ Starter',
    kind: 'opening',
    simpleLabel: 'Salida básica',
    recommended: true,
    build: () =>
      createMatcherPattern('Salida básica', 'opening', [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
      ]),
    describeProbability: (probability) =>
      `El deck abre al menos un Starter en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'starter_extender_opening',
    category: 'consistency',
    title: 'Salida con seguimiento',
    description: 'Arranque con seguimiento real para armar un board.',
    technicalSubtitle: 'Starter + Extender',
    kind: 'opening',
    simpleLabel: 'Salida con seguimiento',
    recommended: false,
    build: () =>
      createMatcherPattern(
        'Salida con seguimiento',
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 2,
        },
      ),
    describeProbability: (probability) =>
      `La mano combina Starter y Extender en ${formatProbability(probability)} de los casos, lo que mejora la continuidad de la jugada.`,
  },
  {
    id: 'starter_protection_opening',
    category: 'interaction',
    title: 'Salida con interacción',
    description: 'Salir y poder frenar al rival en el mismo turno.',
    technicalSubtitle: 'Starter + (Handtrap o Disruption)',
    kind: 'opening',
    simpleLabel: 'Salida con interacción',
    recommended: false,
    build: (cards) => {
      const interactionPool = collectCardIdsByRoles(cards, INTERACTION_ROLES)

      if (interactionPool.length === 0) {
        return null
      }

      return createMatcherPattern(
        'Salida con interacción',
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'card_pool', value: interactionPool }, quantity: 1, kind: 'include' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 2,
        },
      )
    },
    describeProbability: (probability) =>
      `La mano abre Starter con protección en ${formatProbability(probability)} de los casos.`,
  },
  {
    id: 'engine_interaction_opening',
    category: 'interaction',
    title: 'Engine + interacción',
    description: 'Balance entre avanzar tu plan y defenderte.',
    technicalSubtitle: 'Engine + (Handtrap o Disruption)',
    kind: 'opening',
    simpleLabel: 'Engine + interacción',
    recommended: false,
    build: (cards) => {
      const interactionPool = collectCardIdsByRoles(cards, INTERACTION_ROLES)

      if (interactionPool.length === 0) {
        return null
      }

      return createMatcherPattern(
        'Engine + interacción',
        'opening',
        [
          { matcher: { type: 'origin', value: 'engine' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'card_pool', value: interactionPool }, quantity: 1, kind: 'include' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 2,
        },
      )
    },
    describeProbability: (probability) =>
      `El deck combina engine con interacción en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'no_starter_problem',
    category: 'problems',
    title: 'Mano sin Starter',
    description: 'La mano no encuentra un arranque claro.',
    technicalSubtitle: 'sin Starter',
    kind: 'problem',
    simpleLabel: 'Mano sin Starter',
    recommended: true,
    build: () =>
      createMatcherPattern('Mano sin Starter', 'problem', [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'exclude' },
      ]),
    describeProbability: (probability) =>
      `El deck no abre una carta que inicie la jugada en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'double_brick_problem',
    category: 'problems',
    title: '2+ Bricks en mano',
    description: 'Manos pesadas con cartas que no arrancan solas.',
    technicalSubtitle: 'con 2+ Brick',
    kind: 'problem',
    simpleLabel: '2+ Bricks en mano',
    recommended: true,
    build: () =>
      createMatcherPattern('2+ Bricks en mano', 'problem', [
        { matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' },
      ]),
    describeProbability: (probability) =>
      `El riesgo de abrir 2 o más Bricks aparece en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'triple_non_engine_problem',
    category: 'problems',
    title: '3+ Non-engine en mano',
    description: 'Exceso de cartas defensivas sin plan propio.',
    technicalSubtitle: 'con 3+ Non-engine',
    kind: 'problem',
    simpleLabel: '3+ Non-engine en mano',
    recommended: false,
    build: () =>
      createMatcherPattern('3+ Non-engine en mano', 'problem', [
        { matcher: { type: 'origin', value: 'non_engine' }, quantity: 3, kind: 'include' },
      ]),
    describeProbability: (probability) =>
      `La mano carga 3 o más cartas non-engine en ${formatProbability(probability)} de los casos.`,
  },
  {
    id: 'no_interaction_problem',
    category: 'problems',
    title: 'Mano sin interacción',
    description: 'Manos pasivas que no frenan al rival.',
    technicalSubtitle: 'sin Handtrap ni Disruption',
    kind: 'problem',
    simpleLabel: 'Mano sin interacción',
    recommended: false,
    build: () =>
      createMatcherPattern(
        'Mano sin interacción',
        'problem',
        [
          { matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'exclude' },
          { matcher: { type: 'role', value: 'disruption' }, quantity: 1, kind: 'exclude' },
        ],
        {
          allowSharedCards: true,
          matchMode: 'all',
          minimumMatches: 2,
        },
      ),
    describeProbability: (probability) =>
      `El deck se queda sin Handtrap ni Disruption en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'extender_without_starter_problem',
    category: 'problems',
    title: 'Extender sin Starter',
    description: 'Parece jugable pero no tiene punto de arranque real.',
    technicalSubtitle: 'Extender y 0 Starter',
    kind: 'problem',
    simpleLabel: 'Extender sin Starter',
    recommended: false,
    build: () =>
      createMatcherPattern(
        'Extender sin Starter',
        'problem',
        [
          { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'exclude' },
        ],
        {
          allowSharedCards: true,
          matchMode: 'all',
          minimumMatches: 2,
        },
      ),
    describeProbability: (probability) =>
      `La mano abre Extender sin Starter en ${formatProbability(probability)} de los casos, un falso positivo de jugabilidad.`,
  },
] as const

export function buildPatternPresets(cards: CardEntry[]): PatternPreset[] {
  return PATTERN_PRESET_DEFINITIONS.flatMap((definition) => {
    const pattern = definition.build(cards)

    if (!pattern) {
      return []
    }

    return [
      {
        id: definition.id,
        category: definition.category,
        title: definition.title,
        description: definition.description,
        technicalSubtitle: definition.technicalSubtitle,
        kind: definition.kind,
        simpleLabel: definition.simpleLabel,
        recommended: definition.recommended === true,
        pattern,
        describeProbability: definition.describeProbability,
      },
    ]
  })
}

export function getSelectedSimplePresetIdsFromPatterns(
  patterns: HandPattern[],
  availablePresets: PatternPreset[],
): string[] {
  const activePatternKeys = new Set(patterns.map((pattern) => getPatternDefinitionKey(pattern)))

  return availablePresets.flatMap((preset) =>
    preset.simpleLabel && activePatternKeys.has(getPatternDefinitionKey(preset.pattern))
      ? [preset.id]
      : [],
  )
}

export function toggleSimplePresetPattern(
  patterns: HandPattern[],
  preset: PatternPreset,
): HandPattern[] {
  const presetDefinitionKey = getPatternDefinitionKey(preset.pattern)
  const hasMatchingPattern = patterns.some(
    (pattern) => getPatternDefinitionKey(pattern) === presetDefinitionKey,
  )

  if (hasMatchingPattern) {
    return patterns.filter(
      (pattern) => getPatternDefinitionKey(pattern) !== presetDefinitionKey,
    )
  }

  return [...patterns, preset.pattern]
}

export function isObsoleteSystemPatternName(value: string): boolean {
  return OBSOLETE_SYSTEM_PATTERN_NAMES.has(normalizePatternName(value))
}

function collectCardIdsByRoles(cards: CardEntry[], roles: readonly CardRole[]): string[] {
  const expectedRoles = new Set<CardRole>(roles)

  return cards
    .filter((card) => card.roles.some((role) => expectedRoles.has(role)))
    .map((card) => card.id)
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(3)}%`
}
