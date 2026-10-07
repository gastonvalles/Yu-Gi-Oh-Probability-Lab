import { useEffect, useMemo, useState } from 'react'

import { requestLabOdds } from '../../app/lab-odds-client'
import {
  buildCandidates,
  buildMaxedHint,
  buildMissingRoleHint,
  findCulprit,
  listCauses,
  pickBest,
  pickTradeoff,
  toOutcomes,
  type Evaluation,
  type Culprit,
  type Outcome,
} from '../../app/lab-suggestion'
import type { LabViewResult } from '../../app/probability-lab'
import type { CardEntry, HandPattern, TurnView } from '../../types'

export interface SuggestionAnalysis {
  /** Cambio que más sube las manos limpias. */
  best: Outcome | null
  /** Si nada sube: el que más baja el problema (cuesta salidas). */
  tradeoff: Outcome | null
}

interface SuggestionState {
  status: 'loading' | 'done'
  analysis: SuggestionAnalysis
}

const EMPTY_ANALYSIS: SuggestionAnalysis = { best: null, tradeoff: null }

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
) {
  const culprit = useMemo<Culprit | null>(() => findCulprit(result), [result])
  const baseClean = result.cleanProbability
  const [state, setState] = useState<SuggestionState>({ status: 'loading', analysis: EMPTY_ANALYSIS })

  useEffect(() => {
    if (!culprit) {
      return
    }

    let cancelled = false
    setState({ status: 'loading', analysis: EMPTY_ANALYSIS })
    const candidates = buildCandidates(culprit, cards, checks)

    const evaluated: Evaluation[] = []
    const onlyView = view === 'average' ? undefined : view

    // Cada variante llega por separado: se muestra la mejor hasta el momento sin esperar a las demás.
    void Promise.all(
      candidates.map(async (candidate) => {
        const odds = await requestLabOdds(JSON.stringify(['suggest', handSize, onlyView, candidate.cards, checks]), {
          cards: candidate.cards,
          patterns: checks,
          handSize,
          view: onlyView,
        })

        if (cancelled) {
          return
        }

        evaluated.push({ candidate, odds })
        const outcomes = toOutcomes(culprit, view, evaluated)
        setState({
          status: evaluated.length === candidates.length ? 'done' : 'loading',
          analysis: { best: pickBest(outcomes, baseClean), tradeoff: pickTradeoff(outcomes, culprit.probability) },
        })
      }),
    )

    return () => {
      cancelled = true
    }
  }, [baseClean, cards, checks, culprit, handSize, view])

  const hint = useMemo(
    () => (culprit ? (buildMissingRoleHint(culprit, cards, checks) ?? buildMaxedHint(culprit, cards, checks)) : null),
    [culprit, cards, checks],
  )
  const causes = useMemo(() => (culprit ? listCauses(culprit, cards, checks) : []), [culprit, cards, checks])

  return { culprit, state, hint, causes }
}
