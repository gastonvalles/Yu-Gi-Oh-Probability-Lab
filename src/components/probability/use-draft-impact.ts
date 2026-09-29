import { useDeferredValue, useMemo } from 'react'

import { buildActiveRuleSet } from '../../app/pattern-presets'
import { computeLabResults } from '../../app/probability-lab'
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

function isComplete(pattern: HandPattern): boolean {
  return pattern.conditions.length > 0 && pattern.conditions.every((condition) => condition.matcher !== null)
}

function probabilityOf(results: { patternId: string; probability: number }[], patternId: string): number | null {
  return results.find((result) => result.patternId === patternId)?.probability ?? null
}

/** Cuánto se da la regla del borrador y cómo movería las manos limpias (sin tocar el store). */
export function computeDraftImpact({
  draft,
  cards,
  customPatterns,
  disabledGenericRuleIds,
  handSize,
  cleanBefore,
}: DraftImpactInput): DraftImpact | null {
  if (!draft || !isComplete(draft)) {
    return null
  }

  // La regla sola se mide en ambos turnos: si fuera "Solo 1º", el turno 2º quedaría
  // sin reglas y el cálculo se bloquearía. Después se oculta el turno que no aplica.
  const alone = computeLabResults(cards, [{ ...draft, turnContext: 'either' }], handSize)

  if (alone.status !== 'ok') {
    return null
  }

  const scope = draft.turnContext
  const first = scope === 'second' ? null : probabilityOf(alone.results.first.patternResults, draft.id)
  const second = scope === 'first' ? null : probabilityOf(alone.results.second.patternResults, draft.id)
  const main = scope === 'either' ? probabilityOf(alone.results.average.patternResults, draft.id) : (first ?? second)

  const withDraft = [...customPatterns.filter((pattern) => pattern.id !== draft.id), draft]
  const full = computeLabResults(cards, buildActiveRuleSet(cards, withDraft, disabledGenericRuleIds), handSize)
  const clean =
    cleanBefore !== null && full.status === 'ok'
      ? { before: cleanBefore, after: full.results.average.cleanProbability }
      : null

  return { rule: { first, second, main, scope }, clean }
}

/** Vista previa en vivo del borrador, con valores diferidos para que escribir no se trabe. */
export function useDraftImpact(input: DraftImpactInput): DraftImpact | null {
  const deferredDraft = useDeferredValue(input.draft)
  const { cards, cleanBefore, customPatterns, disabledGenericRuleIds, handSize } = input

  return useMemo(
    () => computeDraftImpact({ draft: deferredDraft, cards, cleanBefore, customPatterns, disabledGenericRuleIds, handSize }),
    [cards, cleanBefore, customPatterns, deferredDraft, disabledGenericRuleIds, handSize],
  )
}
