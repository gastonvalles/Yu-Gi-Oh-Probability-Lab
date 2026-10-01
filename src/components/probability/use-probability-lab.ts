import { useDeferredValue, useMemo } from 'react'

import { getDeckModelStatus } from '../../app/deck-model-status'
import { curatePatterns, hasMissingRequiredCards } from '../../app/pattern-curation'
import { buildActiveRuleSet, buildPatternPresets, type SystemRuleNames } from '../../app/pattern-presets'
import { computeLabResults, type LabComputation } from '../../app/probability-lab'
import { buildRoleDistributions, type RoleDistribution } from '../../app/role-distribution'
import {
  countCardsMissingOrigin,
  countCardsMissingRoles,
  countCardsPendingReview,
  countUnclassifiedCards,
  isClassificationStepComplete,
} from '../../app/role-step'
import type { CardEntry, HandPattern } from '../../types'

const NO_RULE_NAMES: SystemRuleNames = {}

export type LabReadiness =
  | { status: 'empty-deck' }
  | { status: 'needs-classification'; message: string }
  | { status: 'ready' }

/** Modelo del Probability Lab: reglas activas, readiness y resultados por turno. */
export function useProbabilityLab(
  derivedMainCards: CardEntry[],
  patterns: HandPattern[],
  disabledGenericRuleIds: readonly string[],
  handSize: number,
  isEditingDeck: boolean,
  systemRuleNames: SystemRuleNames = NO_RULE_NAMES,
) {
  const availablePresets = useMemo(() => buildPatternPresets(derivedMainCards, systemRuleNames), [derivedMainCards, systemRuleNames])
  const customPatterns = useMemo(() => curatePatterns(patterns, derivedMainCards), [derivedMainCards, patterns])
  // Reglas que piden una carta que ya no está: no se evalúan, pero se muestran para editarlas.
  const unavailablePatterns = useMemo(() => {
    const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
    return patterns.filter((pattern) => !pattern.needsReview && hasMissingRequiredCards(pattern, cardById))
  }, [derivedMainCards, patterns])
  const readiness = useMemo(() => buildReadiness(derivedMainCards), [derivedMainCards])

  const allChecks = useMemo(
    () => buildActiveRuleSet(derivedMainCards, customPatterns, disabledGenericRuleIds, systemRuleNames),
    [customPatterns, derivedMainCards, disabledGenericRuleIds, systemRuleNames],
  )
  const modelStatus = useMemo(
    () => getDeckModelStatus(derivedMainCards, allChecks),
    [derivedMainCards, allChecks],
  )

  // El cálculo usa valores diferidos: la edición de reglas responde al instante.
  const deferredChecks = useDeferredValue(allChecks)
  const deferredCards = useDeferredValue(derivedMainCards)
  const canCalculate = !isEditingDeck && readiness.status === 'ready' && deferredChecks.length > 0
  const computation = useMemo<LabComputation | null>(
    () => (canCalculate ? computeLabResults(deferredCards, deferredChecks, handSize) : null),
    [canCalculate, deferredCards, deferredChecks, handSize],
  )
  const roleDistributions = useMemo<Record<'first' | 'second' | 'average', RoleDistribution[]>>(
    () => ({
      first: buildRoleDistributions(derivedMainCards, [handSize]),
      second: buildRoleDistributions(derivedMainCards, [handSize + 1]),
      average: buildRoleDistributions(derivedMainCards, [handSize, handSize + 1]),
    }),
    [derivedMainCards, handSize],
  )

  return {
    allChecks,
    customPatterns,
    unavailablePatterns,
    availablePresets,
    canCalculate,
    computation,
    isStale: deferredChecks !== allChecks || deferredCards !== derivedMainCards,
    modelStatus,
    readiness,
    roleDistributions,
  }
}

function buildReadiness(cards: CardEntry[]): LabReadiness {
  if (cards.reduce((total, card) => total + card.copies, 0) === 0) {
    return { status: 'empty-deck' }
  }

  if (isClassificationStepComplete(cards)) {
    return { status: 'ready' }
  }

  const message =
    countCardsMissingOrigin(cards) > 0
      ? 'Hay cartas sin origen.'
      : countCardsMissingRoles(cards) > 0
        ? 'Hay cartas sin roles.'
        : countCardsPendingReview(cards) > 0
          ? 'Hay cartas pendientes de revisión.'
          : `Faltan ${countUnclassifiedCards(cards)} cartas por cerrar.`

  return { status: 'needs-classification', message }
}
