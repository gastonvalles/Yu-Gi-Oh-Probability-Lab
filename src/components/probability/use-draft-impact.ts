import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { labComputationKey, peekLabComputation, requestLabComputation, type LabComputationInput } from '../../app/lab-computation-client'
import { buildActiveRuleSet } from '../../app/pattern-presets'
import { computeLabResults, type LabComputation } from '../../app/probability-lab'
import type { CardEntry, HandPattern, TurnContext } from '../../types'

export interface DraftImpact {
  /** % de manos en que se cumple la regla sola, por turno (null si no aplica a ese turno). */
  rule: { first: number | null; second: number | null; main: number | null; scope: TurnContext }
  /** Manos limpias del Lab (promedio) con la regla guardada vs. con el borrador. */
  clean: { before: number; after: number } | null
}

interface DraftImpactInput {
  draft: HandPattern | null
  cards: CardEntry[]
  customPatterns: HandPattern[]
  disabledGenericRuleIds: readonly string[]
  handSize: number
  cleanBefore: number | null
}

/** Cada edición del borrador pide dos cálculos nuevos: guardarlos en el dispositivo (entran 4) desalojaría el resultado del deck de verdad. */
const requestPreview = (input: LabComputationInput) => requestLabComputation(input, labComputationKey(input), { persist: false })

function isComplete(pattern: HandPattern): boolean {
  return pattern.conditions.length > 0 && pattern.conditions.every((condition) => condition.matcher !== null)
}

function probabilityOf(results: { patternId: string; probability: number }[], patternId: string): number | null {
  return results.find((result) => result.patternId === patternId)?.probability ?? null
}

/** Los dos cálculos que necesita el borrador: la regla sola y el Lab completo con ella. */
function draftCalculations({
  draft,
  cards,
  customPatterns,
  disabledGenericRuleIds,
  handSize,
}: DraftImpactInput): { alone: LabComputationInput; full: LabComputationInput } | null {
  if (!draft || !isComplete(draft)) {
    return null
  }

  // La regla sola se mide en ambos turnos: si fuera "Solo 1º", el turno 2º quedaría
  // sin reglas y el cálculo se bloquearía. Después se oculta el turno que no aplica.
  // El nombre no cambia la matemática: se deja vacío para que escribirlo no dispare otro cálculo completo.
  const mathDraft = { ...draft, name: '' }
  const withDraft = [...customPatterns.filter((pattern) => pattern.id !== draft.id), mathDraft]

  return {
    alone: { cards, patterns: [{ ...mathDraft, turnContext: 'either' }], handSize },
    full: { cards, patterns: buildActiveRuleSet(cards, withDraft, disabledGenericRuleIds), handSize },
  }
}

function toDraftImpact(
  draft: HandPattern,
  alone: LabComputation,
  full: LabComputation,
  cleanBefore: number | null,
): DraftImpact | null {
  if (alone.status !== 'ok') {
    return null
  }

  const scope = draft.turnContext
  const first = scope === 'second' ? null : probabilityOf(alone.results.first.patternResults, draft.id)
  const second = scope === 'first' ? null : probabilityOf(alone.results.second.patternResults, draft.id)
  const main = scope === 'either' ? probabilityOf(alone.results.average.patternResults, draft.id) : (first ?? second)
  const clean =
    cleanBefore !== null && full.status === 'ok'
      ? { before: cleanBefore, after: full.results.average.cleanProbability }
      : null

  return { rule: { first, second, main, scope }, clean }
}

/** Cuánto se da la regla del borrador y cómo movería las manos limpias (sin tocar el store). Versión síncrona de lo que hace el hook en workers: sirve para probar la matemática. */
export function computeDraftImpact(input: DraftImpactInput): DraftImpact | null {
  const calculations = draftCalculations(input)

  if (!calculations || !input.draft) {
    return null
  }

  const { alone, full } = calculations

  return toDraftImpact(
    input.draft,
    computeLabResults(alone.cards, alone.patterns, alone.handSize),
    computeLabResults(full.cards, full.patterns, full.handSize),
    input.cleanBefore,
  )
}

/**
 * Vista previa en vivo del borrador: valores diferidos para que escribir no se trabe y cálculo en
 * workers (cada edición dispara dos enumeraciones completas; en el hilo principal congelaban el editor).
 */
export function useDraftImpact(input: DraftImpactInput): DraftImpact | null {
  const deferredDraft = useDeferredValue(input.draft)
  const { cards, cleanBefore, customPatterns, disabledGenericRuleIds, handSize } = input
  const calculations = useMemo(
    () => draftCalculations({ draft: deferredDraft, cards, cleanBefore, customPatterns, disabledGenericRuleIds, handSize }),
    [cards, cleanBefore, customPatterns, deferredDraft, disabledGenericRuleIds, handSize],
  )
  const [settled, setSettled] = useState<{ calculations: typeof calculations; impact: DraftImpact | null } | null>(null)

  useEffect(() => {
    if (!calculations || !deferredDraft) {
      return
    }

    let cancelled = false

    void Promise.all([requestPreview(calculations.alone), requestPreview(calculations.full)]).then(([alone, full]) => {
      if (!cancelled) {
        setSettled({ calculations, impact: toDraftImpact(deferredDraft, alone, full, cleanBefore) })
      }
    })

    return () => {
      cancelled = true
    }
  }, [calculations, cleanBefore, deferredDraft])

  if (!calculations) {
    return null
  }

  // Si ya estaba calculado (borrador sin cambios de fondo) se muestra de inmediato; si no, el último valor.
  const aloneCached = peekLabComputation(labComputationKey(calculations.alone))
  const fullCached = peekLabComputation(labComputationKey(calculations.full))

  if (aloneCached && fullCached && deferredDraft) {
    return toDraftImpact(deferredDraft, aloneCached, fullCached, cleanBefore)
  }

  return settled?.impact ?? null
}
