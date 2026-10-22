import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { labComputationKey, peekLabComputation, requestLabComputation, type LabComputationInput } from '../../app/lab-computation-client'
import { buildActiveRuleSet } from '../../app/pattern-presets'
import { computeLabResults, type LabComputation } from '../../app/probability-lab'
import type { CardEntry, HandPattern, TurnContext, TurnView } from '../../types'

export interface DraftImpact {
  /** % de manos en que se cumple la regla sola, por turno (null si no aplica a ese turno). */
  rule: { first: number | null; second: number | null; main: number | null; scope: TurnContext }
  /** Manos buenas del Lab en el turno en que vale la regla (el promedio si vale siempre): con lo guardado vs. con el borrador. */
  clean: { before: number; after: number } | null
}

/** Las manos buenas de hoy, por vista de turno (lo que ya mide el Lab). */
export type CleanByView = Readonly<Record<TurnView, number>>

interface DraftImpactInput {
  draft: HandPattern | null
  cards: CardEntry[]
  customPatterns: HandPattern[]
  disabledGenericRuleIds: readonly string[]
  handSize: number
  cleanBefore: CleanByView | null
}

/** La vista de turno que mira una regla: la suya si vale en uno solo, el promedio si vale siempre. */
export function turnViewOf(scope: TurnContext): TurnView {
  return scope === 'either' ? 'average' : scope
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
  cleanBefore: CleanByView | null,
): DraftImpact | null {
  if (alone.status !== 'ok') {
    return null
  }

  const scope = draft.turnContext
  const first = scope === 'second' ? null : probabilityOf(alone.results.first.patternResults, draft.id)
  const second = scope === 'first' ? null : probabilityOf(alone.results.second.patternResults, draft.id)
  const main = scope === 'either' ? probabilityOf(alone.results.average.patternResults, draft.id) : (first ?? second)
  const view = turnViewOf(scope)
  const clean =
    cleanBefore !== null && full.status === 'ok'
      ? { before: cleanBefore[view], after: full.results[view].cleanProbability }
      : null

  return { rule: { first, second, main, scope }, clean }
}

/** Cuánto se da la regla del borrador y cómo movería las manos buenas (sin tocar el store). Versión síncrona de lo que hace el hook en workers: sirve para probar la matemática. */
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

/** Un cálculo del Lab de vista previa (no se guarda en el dispositivo), p. ej. cómo quedarían tus manos sin una regla. `input` va memorizado; null = nada. */
export function useLabPreview(input: LabComputationInput | null): LabComputation | null {
  const key = input ? labComputationKey(input) : null
  const [settled, setSettled] = useState<{ key: string; computation: LabComputation } | null>(null)

  useEffect(() => {
    if (!input || !key) {
      return
    }

    let cancelled = false

    void requestPreview(input).then((computation) => {
      if (!cancelled) {
        setSettled({ key, computation })
      }
    })

    return () => {
      cancelled = true
    }
  }, [input, key])

  if (!key) {
    return null
  }

  return peekLabComputation(key) ?? (settled?.key === key ? settled.computation : null)
}

/**
 * Vista previa en vivo del borrador: valores diferidos para que escribir no se trabe y cálculo en
 * workers (cada edición dispara dos enumeraciones completas; en el hilo principal congelaban el editor).
 * `impact` es el de la regla como está o, mientras se calcula (`pending`), el último que hubo; con la regla a medias, null y sin calcular.
 */
export function useDraftImpact(input: DraftImpactInput): { impact: DraftImpact | null; pending: boolean } {
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

  if (!calculations || !deferredDraft) {
    return { impact: null, pending: false }
  }

  // Si ya estaba calculado (borrador sin cambios de fondo) se muestra de inmediato; si no, el último valor mientras se calcula.
  const aloneCached = peekLabComputation(labComputationKey(calculations.alone))
  const fullCached = peekLabComputation(labComputationKey(calculations.full))

  if (aloneCached && fullCached) {
    return { impact: toDraftImpact(deferredDraft, aloneCached, fullCached, cleanBefore), pending: false }
  }

  // El borrador cambió y todavía no llegó (o el valor diferido va un paso atrás del que se ve): se está calculando.
  return { impact: settled?.impact ?? null, pending: settled?.calculations !== calculations || deferredDraft !== input.draft }
}
