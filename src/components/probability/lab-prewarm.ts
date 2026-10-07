import { requestLabComputation } from '../../app/lab-computation-client'
import { curatePatterns } from '../../app/pattern-curation'
import { buildActiveRuleSet, type SystemRuleNames } from '../../app/pattern-presets'
import type { CardEntry, HandPattern } from '../../types'
import { buildReadiness } from './use-probability-lab'

export interface PrewarmInput {
  derivedMainCards: CardEntry[]
  patterns: HandPattern[]
  disabledGenericRuleIds: readonly string[]
  systemRuleNames: SystemRuleNames
  handSize: number
}

/**
 * Calcula el Lab de fondo (en workers) si el deck está listo. Arma las reglas con la misma función que el
 * Lab, así la clave por contenido coincide y al abrir la pestaña el resultado ya está.
 */
export function prewarmLab({ derivedMainCards, patterns, disabledGenericRuleIds, systemRuleNames, handSize }: PrewarmInput): void {
  if (buildReadiness(derivedMainCards).status !== 'ready') {
    return
  }

  const checks = buildActiveRuleSet(derivedMainCards, curatePatterns(patterns, derivedMainCards), disabledGenericRuleIds, systemRuleNames)

  if (checks.length > 0) {
    void requestLabComputation({ cards: derivedMainCards, patterns: checks, handSize })
  }
}
