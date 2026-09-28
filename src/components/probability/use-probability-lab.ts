import { useDeferredValue, useMemo } from 'react'

import { getDeckModelStatus } from '../../app/deck-model-status'
import { curatePatterns } from '../../app/pattern-curation'
import { buildActiveRuleSet, buildPatternPresets } from '../../app/pattern-presets'
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
) {
  const availablePresets = useMemo(() => buildPatternPresets(derivedMainCards), [derivedMainCards])
  const customPatterns = useMemo(() => curatePatterns(patterns, derivedMainCards), [derivedMainCards, patterns])
  const readiness = useMemo(() => buildReadiness(derivedMainCards), [derivedMainCards])

  const allChecks = useMemo(
    () => buildActiveRuleSet(derivedMainCards, customPatterns, disabledGenericRuleIds),
    [customPatterns, derivedMainCards, disabledGenericRuleIds],
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
