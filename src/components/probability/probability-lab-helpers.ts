import type { PatternPreset, SystemRuleTier } from '../../app/pattern-presets'
import { getPatternDefinitionKey } from '../../app/patterns'
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
  /** Turno en que la regla se da claramente más (sólo reglas que valen en ambos turnos). */
  turnLean: TurnLean | null
}

export interface TurnLean {
  favored: 'first' | 'second'
  first: number
  second: number
}

/** Diferencia mínima entre 1º y 2º para avisarla: por debajo es ruido. */
export const TURN_LEAN_MIN_GAP = 0.05

/** Detecta si una regla ocurre claramente más yendo 1º o 2º. */
export function detectTurnLean(first: number | undefined, second: number | undefined): TurnLean | null {
  if (first === undefined || second === undefined || Math.abs(first - second) < TURN_LEAN_MIN_GAP) {
    return null
  }

  return { favored: first > second ? 'first' : 'second', first, second }
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
  viewPatternResults,
  view,
}: {
  presets: PatternPreset[]
  customPatterns: HandPattern[]
  disabledGenericRuleIds: readonly string[]
  derivedMainCards: CardEntry[]
  patternResults: PatternProbability[]
  /** Resultados por turno, para avisar qué reglas se inclinan a 1º o 2º. */
  viewPatternResults: { first: PatternProbability[]; second: PatternProbability[] }
  view: TurnView
}): RuleEntryGroups {
  const resultById = new Map(patternResults.map((result) => [result.patternId, result]))
  const disabled = new Set(disabledGenericRuleIds)
  const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
  const probabilityIn = (results: PatternProbability[], patternId: string) =>
    results.find((result) => result.patternId === patternId)?.probability
  const withResult = (
    entry: Omit<RuleEntry, 'probability' | 'possible' | 'appliesToView' | 'turnLean'>,
  ): RuleEntry => {
    const appliesToView = view === 'average' || entry.turnContext === 'either' || entry.turnContext === view
    const result = entry.enabled && appliesToView ? resultById.get(entry.patternId) : undefined
    const turnLean =
      entry.enabled && entry.turnContext === 'either'
        ? detectTurnLean(
            probabilityIn(viewPatternResults.first, entry.patternId),
            probabilityIn(viewPatternResults.second, entry.patternId),
          )
        : null
    return {
      ...entry,
      appliesToView,
      probability: result?.probability ?? null,
      possible: result?.possible ?? false,
      turnLean,
    }
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
  const presetTitleByKey = new Map(presets.map((preset) => [getPatternDefinitionKey(preset.pattern), preset.title]))
  const customEntries = customPatterns.map((pattern) => {
    const isComplete = pattern.conditions.length > 0 && pattern.conditions.every((condition) => condition.matcher !== null)
    // Una regla propia idéntica a una del sistema no suma al cálculo: se avisa en vez de mostrar "—".
    const duplicateOf = isComplete ? presetTitleByKey.get(getPatternDefinitionKey(pattern)) : undefined

    return withResult({
      patternId: pattern.id,
      presetId: null,
      tier: 'custom',
      kind: pattern.kind,
      name: pattern.name.trim() || (pattern.kind === 'opening' ? 'Salida sin nombre' : 'Problema sin nombre'),
      summary: isComplete ? buildPatternCompactSummary(pattern, cardById) : 'Falta completar las condiciones',
      description: duplicateOf ? `Es igual a “${duplicateOf}”, que ya se cuenta: no cambia el resultado.` : null,
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
