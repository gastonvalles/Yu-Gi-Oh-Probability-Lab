import type { PatternPreset, SystemRuleTier } from '../../app/pattern-presets'
import type { CardEntry, HandPattern, PatternKind, PatternProbability, TurnContext, TurnView } from '../../types'
import { buildPatternCompactSummary } from './pattern-helpers'

export type RuleTier = SystemRuleTier | 'custom'

export interface RuleEntry {
  patternId: string
  /** Id del catálogo para universales y genéricas. */
  presetId: string | null
  tier: RuleTier
  kind: PatternKind
  name: string
  /** Condición en pocas palabras. */
  summary: string
  /** Qué mide y por qué importa (sólo reglas del sistema). */
  description: string | null
  turnContext: TurnContext
  enabled: boolean
  /** La vista de turno activa incluye esta regla (una "Solo 2º" no aplica yendo 1º). */
  appliesToView: boolean
  /** Configurada y calculable: tiene al menos una condición completa. */
  isComplete: boolean
  probability: number | null
  possible: boolean
}

export interface RuleEntryGroups {
  universal: RuleEntry[]
  generic: RuleEntry[]
  custom: RuleEntry[]
}

/** Arma la lista de reglas en tres niveles con su % para la vista activa. */
export function buildRuleEntryGroups({
  presets,
  customPatterns,
  disabledGenericRuleIds,
  derivedMainCards,
  patternResults,
  view,
}: {
  presets: PatternPreset[]
  customPatterns: HandPattern[]
  disabledGenericRuleIds: readonly string[]
  derivedMainCards: CardEntry[]
  patternResults: PatternProbability[]
  view: TurnView
}): RuleEntryGroups {
  const resultById = new Map(patternResults.map((result) => [result.patternId, result]))
  const disabled = new Set(disabledGenericRuleIds)
  const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
  const withResult = (entry: Omit<RuleEntry, 'probability' | 'possible' | 'appliesToView'>): RuleEntry => {
    const appliesToView = view === 'average' || entry.turnContext === 'either' || entry.turnContext === view
    const result = entry.enabled && appliesToView ? resultById.get(entry.patternId) : undefined
    return { ...entry, appliesToView, probability: result?.probability ?? null, possible: result?.possible ?? false }
  }
  const systemEntries = presets.map((preset) =>
    withResult({
      patternId: preset.pattern.id,
      presetId: preset.id,
      tier: preset.tier,
      kind: preset.kind,
      name: preset.title,
      summary: preset.technicalSubtitle,
      description: preset.description,
      turnContext: preset.pattern.turnContext,
      enabled: preset.tier === 'universal' || !disabled.has(preset.id),
      isComplete: true,
    }),
  )
  const customEntries = customPatterns.map((pattern) => {
    const isComplete = pattern.conditions.length > 0 && pattern.conditions.every((condition) => condition.matcher !== null)

    return withResult({
      patternId: pattern.id,
      presetId: null,
      tier: 'custom',
      kind: pattern.kind,
      name: pattern.name.trim() || (pattern.kind === 'opening' ? 'Salida sin nombre' : 'Problema sin nombre'),
      summary: isComplete ? buildPatternCompactSummary(pattern, cardById) : 'Falta completar las condiciones',
      description: null,
      turnContext: pattern.turnContext,
      enabled: true,
      isComplete,
    })
  })

  return {
    universal: systemEntries.filter((entry) => entry.tier === 'universal'),
    generic: systemEntries.filter((entry) => entry.tier === 'generic'),
    custom: customEntries,
  }
}
