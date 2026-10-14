import { useEffect, useMemo, useState } from 'react'

import { requestLabOdds } from '../../app/lab-odds-client'
import {
  buildCandidates,
  buildMaxedHint,
  buildMissingRoleHint,
  findCulprit,
  type PerTurnResults,
  listCauses,
  pickBest,
  pickTradeoff,
  toOutcomes,
  type Evaluation,
  type Culprit,
  type Outcome,
} from '../../app/lab-suggestion'
import { labInputSignature, type LabViewResult } from '../../app/probability-lab'
import type { CardEntry, HandPattern, TurnView } from '../../types'

interface SuggestionAnalysis {
  /** Cambio que más sube las manos limpias. */
  best: Outcome | null
  /** Si nada sube: el que más baja el problema (cuesta salidas). */
  tradeoff: Outcome | null
  /** Variantes que se pudieron comparar (0 = ninguna era evaluable). */
  compared: number
}

interface SuggestionState {
  status: 'loading' | 'done'
  /** Variantes ya calculadas y total a calcular. */
  progress: { done: number; total: number }
  analysis: SuggestionAnalysis
}

const EMPTY_ANALYSIS: SuggestionAnalysis = { best: null, tradeoff: null, compared: 0 }

/**
 * Qué es lo que más frena al deck y qué cambio de una carta lo mejora más. Cada variante se calcula
 * en el worker (y se recuerda por contenido), así no frena la pantalla.
 */
export function useLabSuggestion(
  cards: CardEntry[],
  checks: HandPattern[],
  handSize: number,
  view: TurnView,
  result: LabViewResult,
  maxCopiesOf: (card: CardEntry) => number,
  perTurn: PerTurnResults,
) {
  // En el Promedio el culpable se pondera con los dos turnos; en 1º o 2º se mira solo ese.
  const culprit = useMemo<Culprit | null>(() => findCulprit(result, view === 'average' ? perTurn : undefined), [perTurn, result, view])
  const baseClean = result.cleanProbability
  const [state, setState] = useState<SuggestionState>({ status: 'loading', progress: { done: 0, total: 0 }, analysis: EMPTY_ANALYSIS })

  useEffect(() => {
    if (!culprit) {
      return
    }

    let cancelled = false
    const candidates = buildCandidates(culprit, cards, checks, maxCopiesOf)
    setState({ status: candidates.length === 0 ? 'done' : 'loading', progress: { done: 0, total: candidates.length }, analysis: EMPTY_ANALYSIS })

    const evaluated: Evaluation[] = []
    const onlyView = view === 'average' ? undefined : view

    // Cada variante llega por separado: se muestra la mejor hasta el momento sin esperar a las demás.
    void Promise.all(
      candidates.map(async (candidate) => {
        // Las variantes se prueban con prioridad baja: si la persona edita, su resultado no espera detrás de estas.
        const odds = await requestLabOdds(
          `suggest|${onlyView ?? 'both'}|${labInputSignature(candidate.cards, checks, handSize)}`,
          { cards: candidate.cards, patterns: checks, handSize, view: onlyView },
          'low',
        )

        if (cancelled) {
          return
        }

        evaluated.push({ candidate, odds })
        const outcomes = toOutcomes(culprit, view, evaluated)
        setState({
          status: evaluated.length === candidates.length ? 'done' : 'loading',
          progress: { done: evaluated.length, total: candidates.length },
          analysis: { best: pickBest(outcomes, baseClean), tradeoff: pickTradeoff(outcomes, culprit.probability), compared: outcomes.length },
        })
      }),
    )

    return () => {
      cancelled = true
    }
  }, [baseClean, cards, checks, culprit, handSize, maxCopiesOf, view])

  const hint = useMemo(
    () => (culprit ? (buildMissingRoleHint(culprit, cards, checks) ?? buildMaxedHint(culprit, cards, checks, maxCopiesOf)) : null),
    [culprit, cards, checks, maxCopiesOf],
  )
  const causes = useMemo(() => (culprit ? listCauses(culprit, cards, checks) : []), [culprit, cards, checks])

  return { culprit, state, hint, causes }
}
