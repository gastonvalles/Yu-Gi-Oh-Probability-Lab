import type { CardEntry, CardRole, HandPattern, PatternKind } from '../types'
import { createMatcherPattern } from './pattern-factory'
import { getPatternDefinitionKey } from './patterns'

export type PatternPresetCategory = 'consistency' | 'interaction' | 'problems' | 'advanced'

export interface PatternPresetDefinition {
  id: string
  category: PatternPresetCategory
  title: string
  description: string
  kind: PatternKind
  simpleLabel?: string
  recommended?: boolean
  build: (cards: CardEntry[]) => HandPattern | null
}

export interface PatternPreset {
  id: string
  category: PatternPresetCategory
  title: string
  description: string
  kind: PatternKind
  simpleLabel?: string
  recommended: boolean
  pattern: HandPattern
}

export const QUICK_OVERVIEW_PRESET_IDS = [
  'starter_opening',
  'starter_extender_opening',
  'interaction_opening',
  'no_starter_problem',
  'double_brick_problem',
  'triple_non_engine_problem',
] as const

export const AUTO_BASE_PRESET_IDS = [
  'starter_opening',
  'starter_extender_opening',
  'engine_interaction_opening',
  'no_starter_problem',
  'double_brick_problem',
  'triple_non_engine_problem',
] as const

export const SIMPLE_MODE_DEFAULT_PRESET_IDS = [
  'starter_opening',
  'interaction_opening',
  'no_starter_problem',
  'double_brick_problem',
] as const

export const PATTERN_PRESET_DEFINITIONS: readonly PatternPresetDefinition[] = [
  {
    id: 'starter_opening',
    category: 'consistency',
    title: 'Abrir Starter',
    description: 'Ve al menos un Starter.',
    kind: 'opening',
    simpleLabel: 'Abrir Starter',
    recommended: true,
    build: () =>
      createMatcherPattern('Al menos 1 Starter', 'opening', [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
      ]),
  },
  {
    id: 'starter_extender_opening',
    category: 'consistency',
    title: 'Starter + Extender',
    description: 'Ve starter y extender sin pisarse.',
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
  },
  {
    id: 'interaction_opening',
    category: 'interaction',
    title: 'Al menos 1 interacción',
    description: 'Ve Handtrap o Disruption.',
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
  },
  {
    id: 'no_starter_problem',
    category: 'problems',
    title: 'Sin Starter',
    description: 'La mano sale sin Starter.',
    kind: 'problem',
    simpleLabel: 'Evitar manos sin Starter',
    recommended: true,
    build: () =>
      createMatcherPattern('Sin Starter', 'problem', [
        { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'exclude' },
      ]),
  },
  {
    id: 'double_brick_problem',
    category: 'problems',
    title: '2 o más Bricks',
    description: 'La mano trae 2 o más Bricks.',
    kind: 'problem',
    simpleLabel: 'Evitar 2 o más Bricks',
    recommended: true,
    build: () =>
      createMatcherPattern('2 o más Bricks', 'problem', [
        { matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' },
      ]),
  },
  {
    id: 'triple_non_engine_problem',
    category: 'problems',
    title: '3 o más Non-engine',
    description: 'La mano carga demasiado Non-engine.',
    kind: 'problem',
    simpleLabel: 'Evitar demasiado Non-engine',
    build: () =>
      createMatcherPattern('3 o más Non-engine', 'problem', [
        { matcher: { type: 'origin', value: 'non_engine' }, quantity: 3, kind: 'include' },
      ]),
  },
  {
    id: 'starter_extender_no_brick_opening',
    category: 'advanced',
    title: 'Starter + Extender sin Brick',
    description: 'Abre starter y extender sin brick.',
    kind: 'opening',
    build: () =>
      createMatcherPattern(
        'Starter + Extender sin Brick',
        'opening',
        [
          { matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'role', value: 'extender' }, quantity: 1, kind: 'include' },
          { matcher: { type: 'role', value: 'brick' }, quantity: 1, kind: 'exclude' },
        ],
        {
          allowSharedCards: false,
          matchMode: 'all',
          minimumMatches: 3,
        },
      ),
  },
  {
    id: 'engine_interaction_opening',
    category: 'advanced',
    title: 'Engine + Interacción',
    description: 'Ve engine más interacción.',
    kind: 'opening',
    build: (cards) => {
      const interactionPool = collectCardIdsByRoles(cards, ['handtrap', 'disruption'])

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
        kind: definition.kind,
        simpleLabel: definition.simpleLabel,
        recommended: definition.recommended === true,
        pattern,
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

function collectCardIdsByRoles(cards: CardEntry[], roles: CardRole[]): string[] {
  const expectedRoles = new Set<CardRole>(roles)

  return cards
    .filter((card) => card.roles.some((role) => expectedRoles.has(role)))
    .map((card) => card.id)
}
