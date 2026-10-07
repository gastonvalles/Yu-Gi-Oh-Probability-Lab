import { useEffect, useMemo, useState } from 'react'

import { requestLabOdds } from '../../app/lab-odds-client'
import {
  buildCandidates,
  buildMissingRoleHint,
  findCulprit,
  listCauses,
  pickBest,
  pickTradeoff,
  toOutcomes,
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

type SuggestionState = { status: 'loading' } | { status: 'done'; analysis: SuggestionAnalysis }

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
  const [state, setState] = useState<SuggestionState>({ status: 'loading' })

  useEffect(() => {
    if (!culprit) {
      return
    }

    let cancelled = false
    setState({ status: 'loading' })
    const candidates = buildCandidates(culprit, cards, checks)

    void Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        odds: await requestLabOdds(JSON.stringify(['suggest', handSize, candidate.cards, checks]), {
          cards: candidate.cards,
          patterns: checks,
          handSize,
        }),
      })),
    ).then((evaluated) => {
      if (cancelled) {
        return
      }

      const outcomes = toOutcomes(culprit, view, evaluated)
      setState({ status: 'done', analysis: { best: pickBest(outcomes, baseClean), tradeoff: pickTradeoff(outcomes, culprit.probability) } })
    })

    return () => {
      cancelled = true
    }
  }, [baseClean, cards, checks, culprit, handSize, view])

  const hint = useMemo(() => (culprit ? buildMissingRoleHint(culprit, cards, checks) : null), [culprit, cards, checks])
  const causes = useMemo(() => (culprit ? listCauses(culprit, cards, checks) : []), [culprit, cards, checks])

  return { culprit, state, hint, causes }
}
