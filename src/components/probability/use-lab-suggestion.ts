import { useEffect, useMemo, useState } from 'react'

import { requestLabOdds } from '../../app/lab-odds-client'
import { buildCandidates, buildMissingRoleHint, findCulprit, pickBestSuggestion, type Culprit, type Suggestion } from '../../app/lab-suggestion'
import type { LabViewResult } from '../../app/probability-lab'
import type { CardEntry, HandPattern, TurnView } from '../../types'

type SuggestionState = { status: 'loading' } | { status: 'done'; suggestion: Suggestion | null }

/**
 * Qué es lo que más frena al deck y, si existe, el cambio de una copia que más lo mejora.
 * Cada variante se calcula en el worker (y se recuerda por contenido), así no frena la pantalla.
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
      if (!cancelled) {
        setState({ status: 'done', suggestion: pickBestSuggestion(culprit, baseClean, view, evaluated) })
      }
    })

    return () => {
      cancelled = true
    }
  }, [baseClean, cards, checks, culprit, handSize, view])

  const hint = useMemo(() => (culprit ? buildMissingRoleHint(culprit, cards, checks) : null), [culprit, cards, checks])

  return { culprit, state, hint }
}
