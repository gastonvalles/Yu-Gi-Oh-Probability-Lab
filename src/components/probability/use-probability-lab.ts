import { useDeferredValue, useMemo } from 'react'

import { getDeckModelStatus } from '../../app/deck-model-status'
import { curatePatterns } from '../../app/pattern-curation'
import { AUTO_BASE_PRESET_IDS, buildPatternPresets } from '../../app/pattern-presets'
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
import { buildDeterministicCheckSet } from './probability-lab-helpers'

export type LabReadiness =
  | { status: 'empty-deck' }
  | { status: 'needs-classification'; message: string }
  | { status: 'ready' }

/** Modelo del Probability Lab: reglas activas, readiness y resultados por turno. */
export function useProbabilityLab(
  derivedMainCards: CardEntry[],
  patterns: HandPattern[],
  handSize: number,
  isEditingDeck: boolean,
) {
  const availablePresets = useMemo(() => buildPatternPresets(derivedMainCards), [derivedMainCards])
  const activePatterns = useMemo(
    () => curatePatterns(patterns, derivedMainCards, { includeDefaults: false }),
    [derivedMainCards, patterns],
  )
  const modelStatus = useMemo(
    () => getDeckModelStatus(derivedMainCards, activePatterns),
    [derivedMainCards, activePatterns],
  )
  const readiness = useMemo(() => buildReadiness(derivedMainCards), [derivedMainCards])

  // Las 3 reglas universales siempre cuentan; las del usuario se suman sin duplicar definiciones.
  const allChecks = useMemo(() => {
    const presetById = new Map(availablePresets.map((preset) => [preset.id, preset]))
    const universal = AUTO_BASE_PRESET_IDS.flatMap((presetId) => {
      const preset = presetById.get(presetId)
      return preset ? [preset.pattern] : []
    })
    const calculable = activePatterns.filter((pattern) => pattern.conditions.some((condition) => condition.matcher !== null))

    return buildDeterministicCheckSet([...universal, ...calculable])
  }, [activePatterns, availablePresets])

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
    activePatterns,
    allChecks,
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
