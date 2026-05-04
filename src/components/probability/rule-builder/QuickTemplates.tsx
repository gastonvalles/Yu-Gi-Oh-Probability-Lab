import { useMemo } from 'react'

import type { CardEntry, PatternKind } from '../../../types'
import {
  PATTERN_PRESET_DEFINITIONS,
  type PatternPresetDefinition,
} from '../../../app/pattern-presets'
import { buildPatternCompactSummary } from '../pattern-helpers'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface QuickTemplatesProps {
  derivedMainCards: CardEntry[]
  actions: PatternEditorActions
  patternId: string
  patternKind: PatternKind
  onTemplateApplied: (newPatternId: string) => void
}

/** 4 salidas universales, ordenadas por importancia. */
const OPENING_TEMPLATE_IDS: readonly string[] = [
  'starter_opening',
  'starter_extender_opening',
  'starter_protection_opening',
  'engine_interaction_opening',
]

/** 5 problemas universales, ordenados por impacto. */
const PROBLEM_TEMPLATE_IDS: readonly string[] = [
  'no_starter_problem',
  'double_brick_problem',
  'no_interaction_problem',
  'triple_non_engine_problem',
  'extender_without_starter_problem',
]

const TEMPLATE_LABELS: Record<string, string> = {
  // Salidas
  starter_opening: 'Salida básica',
  starter_extender_opening: 'Salida con seguimiento',
  starter_protection_opening: 'Salida con interacción',
  engine_interaction_opening: 'Engine + interacción',
  // Problemas
  no_starter_problem: 'Mano sin Starter',
  double_brick_problem: '2+ Bricks en mano',
  no_interaction_problem: 'Mano sin interacción',
  triple_non_engine_problem: '3+ Non-engine en mano',
  extender_without_starter_problem: 'Extender sin Starter',
}

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  // Salidas
  starter_opening: 'La condición mínima para que la mano juegue. Sin starter, no arrancás.',
  starter_extender_opening: 'Arranque con seguimiento real para armar un board.',
  starter_protection_opening: 'Salir y poder frenar al rival en el mismo turno.',
  engine_interaction_opening: 'Balance entre avanzar tu plan y defenderte.',
  // Problemas
  no_starter_problem: 'La mano no encuentra un arranque claro.',
  double_brick_problem: 'Manos pesadas con cartas que no arrancan solas.',
  no_interaction_problem: 'Manos pasivas que no frenan al rival.',
  triple_non_engine_problem: 'Exceso de cartas defensivas sin plan propio.',
  extender_without_starter_problem: 'Parece jugable pero no tiene punto de arranque real.',
}

interface BuiltTemplate {
  presetId: string
  label: string
  description: string
  preview: string
  definition: PatternPresetDefinition
}

export function QuickTemplates({
  derivedMainCards,
  actions,
  patternId,
  patternKind,
  onTemplateApplied,
}: QuickTemplatesProps) {
  const templates = useMemo(
    () => buildTemplates(derivedMainCards, patternKind),
    [derivedMainCards, patternKind],
  )

  if (templates.length === 0) {
    return null
  }

  const handleSelect = (template: BuiltTemplate) => {
    const builtPattern = template.definition.build(derivedMainCards)

    if (!builtPattern) {
      return
    }

    actions.appendPattern(builtPattern)
    actions.removePattern(patternId)

    onTemplateApplied(builtPattern.id)
  }

  return (
    <div className="grid gap-2">
      {templates.map((template) => (
        <button
          key={template.presetId}
          type="button"
          className="surface-card grid gap-1 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[rgb(var(--primary-rgb)/0.04)]"
          onClick={() => handleSelect(template)}
        >
          <strong className="text-[0.86rem] text-(--text-main)">{template.label}</strong>
          <span className="text-[0.74rem] leading-[1.16] text-(--text-muted)">
            {template.description}
          </span>
          <span className="text-[0.72rem] leading-[1.14] text-(--text-soft)">
            → {template.preview}
          </span>
        </button>
      ))}
    </div>
  )
}

function buildTemplates(derivedMainCards: CardEntry[], kind: PatternKind): BuiltTemplate[] {
  const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
  const presetById = new Map(
    PATTERN_PRESET_DEFINITIONS.map((def) => [def.id, def]),
  )
  const templateIds = kind === 'opening' ? OPENING_TEMPLATE_IDS : PROBLEM_TEMPLATE_IDS

  return templateIds.flatMap((presetId) => {
    const definition = presetById.get(presetId)

    if (!definition) {
      return []
    }

    const pattern = definition.build(derivedMainCards)

    if (!pattern) {
      return []
    }

    const preview = buildPatternCompactSummary(pattern, cardById)

    return [{
      presetId,
      label: TEMPLATE_LABELS[presetId] ?? definition.title,
      description: TEMPLATE_DESCRIPTIONS[presetId] ?? definition.description,
      preview,
      definition,
    }]
  })
}
