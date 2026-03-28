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
  'starter_opening',
  'minimal_playable_opening',
  'starter_extender_opening',
  'interaction_opening',
  'starter_protection_opening',
  'engine_interaction_opening',
  'no_starter_problem',
  'double_brick_problem',
  'triple_non_engine_problem',
  'no_interaction_problem',
  'extender_without_starter_problem',
] as const

export const AUTO_BASE_PRESET_IDS = [...QUICK_OVERVIEW_PRESET_IDS] as const

export const SIMPLE_MODE_DEFAULT_PRESET_IDS = [...QUICK_OVERVIEW_PRESET_IDS] as const

const ENGINE_COMBO_ROLES: readonly CardRole[] = [
  'starter',
  'extender',
  'enabler',
  'searcher',
  'draw',
  'combo_piece',
] as const

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
])

export const PATTERN_PRESET_DEFINITIONS: readonly PatternPresetDefinition[] = [
  {
    id: 'starter_opening',
    category: 'consistency',
    title: 'Al menos 1 Starter',
    description: 'Condición base de jugabilidad: la mano abre una carta que inicia la línea.',
    technicalSubtitle: 'con 1+ Starter',
    kind: 'opening',
    simpleLabel: 'Abrir Starter',
    recommended: true,
    build: () =>
      createMatcherPattern('Al menos 1 Starter', 'opening', [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
      ]),
    describeProbability: (probability) =>
      `El deck abre al menos un Starter en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'minimal_playable_opening',
    category: 'consistency',
    title: 'Mano jugable mínima',
    description: 'Detecta manos que juegan con Starter o con una pareja engine capaz de arrancar.',
    technicalSubtitle: 'Starter o 2 nombres engine de arranque',
    kind: 'opening',
    simpleLabel: 'Mano jugable mínima',
    recommended: true,
    build: (cards) => {
      const engineComboPool = collectEngineComboCardIds(cards)

      if (engineComboPool.length < 2) {
        return null
      }

      return createMatcherPattern(
        'Mano jugable mínima',
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          {
            matcher: { type: 'card_pool', value: engineComboPool },
            quantity: 2,
            kind: 'include',
            distinct: true,
          },
        ],
        {
          allowSharedCards: true,
          matchMode: 'any',
          minimumMatches: 1,
        },
      )
    },
    describeProbability: (probability) =>
      `El deck encuentra una mano jugable mínima en ${formatProbability(probability)} de las manos, incluso cuando el arranque viene de 2 piezas engine.`,
  },
  {
    id: 'starter_extender_opening',
    category: 'consistency',
    title: 'Starter + Extender',
    description: 'Mide continuidad de jugada con arranque y seguimiento real.',
    technicalSubtitle: 'Starter + Extender',
    kind: 'opening',
    simpleLabel: 'Abrir Starter + Extender',
    recommended: true,
    build: () =>
      createMatcherPattern(
        'Starter + Extender',
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
    id: 'interaction_opening',
    category: 'interaction',
    title: 'Al menos 1 interacción',
    description: 'Mide capacidad de frenar al rival desde la mano o con una pieza defensiva.',
    technicalSubtitle: 'con Handtrap o Disruption',
    kind: 'opening',
    simpleLabel: 'Tener interacción',
    recommended: true,
    build: () =>
      createMatcherPattern(
        'Al menos 1 interacción',
        'opening',
        [
          { matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'role', value: 'disruption' }, quantity: 1, kind: 'include' },
        ],
        {
          allowSharedCards: true,
          matchMode: 'any',
          minimumMatches: 1,
        },
      ),
    describeProbability: (probability) =>
      `El deck abre al menos una interacción en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'starter_protection_opening',
    category: 'interaction',
    title: 'Starter + protección',
    description: 'Mide si la mano no solo juega, sino que además puede resistir interacción.',
    technicalSubtitle: 'Starter + (Handtrap o Disruption)',
    kind: 'opening',
    simpleLabel: 'Starter + protección',
    recommended: true,
    build: (cards) => {
      const interactionPool = collectCardIdsByRoles(cards, INTERACTION_ROLES)

      if (interactionPool.length === 0) {
        return null
      }

      return createMatcherPattern(
        'Starter + protección',
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
    title: 'Engine + Interacción',
    description: 'Mide el balance entre avanzar el plan propio y defenderse.',
    technicalSubtitle: 'Engine + (Handtrap o Disruption)',
    kind: 'opening',
    simpleLabel: 'Engine + Interacción',
    recommended: true,
    build: (cards) => {
      const interactionPool = collectCardIdsByRoles(cards, INTERACTION_ROLES)

      if (interactionPool.length === 0) {
        return null
      }

      return createMatcherPattern(
        'Engine + Interacción',
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
    title: 'Sin Starter',
    description: 'La mano no encuentra un arranque claro.',
    technicalSubtitle: 'sin Starter',
    kind: 'problem',
    simpleLabel: 'Evitar manos sin Starter',
    recommended: true,
    build: () =>
      createMatcherPattern('Sin Starter', 'problem', [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'exclude' },
      ]),
    describeProbability: (probability) =>
      `El deck no abre una carta que inicie la jugada en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'double_brick_problem',
    category: 'problems',
    title: '2 o más Bricks',
    description: 'Mide manos pesadas o demasiado dependientes de acompañamiento.',
    technicalSubtitle: 'con 2+ Brick',
    kind: 'problem',
    simpleLabel: 'Evitar 2 o más Bricks',
    recommended: true,
    build: () =>
      createMatcherPattern('2 o más Bricks', 'problem', [
        { matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' },
      ]),
    describeProbability: (probability) =>
      `El riesgo de abrir 2 o más Bricks aparece en ${formatProbability(probability)} de las manos.`,
  },
  {
    id: 'triple_non_engine_problem',
    category: 'problems',
    title: '3 o más Non-engine',
    description: 'Detecta exceso de cartas que no avanzan el plan principal.',
    technicalSubtitle: 'con 3+ Non-engine',
    kind: 'problem',
    simpleLabel: 'Evitar 3 o más Non-engine',
    recommended: true,
    build: () =>
      createMatcherPattern('3 o más Non-engine', 'problem', [
        { matcher: { type: 'origin', value: 'non_engine' }, quantity: 3, kind: 'include' },
      ]),
    describeProbability: (probability) =>
      `La mano carga 3 o más cartas non-engine en ${formatProbability(probability)} de los casos.`,
  },
  {
    id: 'no_interaction_problem',
    category: 'problems',
    title: 'Sin interacción',
    description: 'Detecta manos pasivas que no frenan al rival.',
    technicalSubtitle: 'sin Handtrap ni Disruption',
    kind: 'problem',
    simpleLabel: 'Evitar manos sin interacción',
    recommended: true,
    build: () =>
      createMatcherPattern(
        'Sin interacción',
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
    description: 'Marca manos engañosas: parecen jugables, pero no tienen punto real de arranque.',
    technicalSubtitle: 'Extender y 0 Starter',
    kind: 'problem',
    simpleLabel: 'Evitar Extender sin Starter',
    recommended: true,
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

function collectEngineComboCardIds(cards: CardEntry[]): string[] {
  const expectedRoles = new Set<CardRole>(ENGINE_COMBO_ROLES)

  return cards
    .filter(
      (card) =>
        (card.origin === 'engine' || card.origin === 'hybrid') &&
        card.roles.some((role) => expectedRoles.has(role)),
    )
    .map((card) => card.id)
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(3)}%`
}
