import { useDeferredValue, useMemo } from 'react'

import { buildActiveRuleSet } from '../../app/pattern-presets'
import { computeLabResults } from '../../app/probability-lab'
import type { CardEntry, HandPattern } from '../../types'

export interface DraftImpact {
  /** % de manos en que se cumple la regla sola, por turno (null si no aplica a ese turno). */
  rule: { first: number | null; second: number | null; average: number | null }
  /** Manos limpias del Lab (promedio) con la regla guardada vs. con el borrador. */
  clean: { before: number; after: number } | null
}

function isComplete(pattern: HandPattern): boolean {
  return pattern.conditions.length > 0 && pattern.conditions.every((condition) => condition.matcher !== null)
}

function probabilityOf(results: { patternId: string; probability: number }[], patternId: string): number | null {
  return results.find((result) => result.patternId === patternId)?.probability ?? null
}

/**
 * Vista previa en vivo del borrador: cuánto se da la regla y cómo movería las manos
 * limpias. No toca el store: el Lab de fondo sólo cambia al guardar.
 */
export function useDraftImpact({
  draft,
  cards,
  customPatterns,
  disabledGenericRuleIds,
  handSize,
  cleanBefore,
}: {
  draft: HandPattern | null
  cards: CardEntry[]
  customPatterns: HandPattern[]
  disabledGenericRuleIds: readonly string[]
  handSize: number
  cleanBefore: number | null
}): DraftImpact | null {
  const deferredDraft = useDeferredValue(draft)

  return useMemo(() => {
    if (!deferredDraft || !isComplete(deferredDraft)) {
      return null
    }

    const alone = computeLabResults(cards, [deferredDraft], handSize)

    if (alone.status !== 'ok') {
      return null
    }

    const { first, second, average } = alone.results
    const rule = {
      first: probabilityOf(first.patternResults, deferredDraft.id),
      second: probabilityOf(second.patternResults, deferredDraft.id),
      average: probabilityOf(average.patternResults, deferredDraft.id),
    }

    const withDraft = [
      ...customPatterns.filter((pattern) => pattern.id !== deferredDraft.id),
      deferredDraft,
    ]
    const full = computeLabResults(cards, buildActiveRuleSet(cards, withDraft, disabledGenericRuleIds), handSize)
    const clean =
      cleanBefore !== null && full.status === 'ok'
        ? { before: cleanBefore, after: full.results.average.cleanProbability }
        : null

    return { rule, clean }
  }, [cards, cleanBefore, customPatterns, deferredDraft, disabledGenericRuleIds, handSize])
}
