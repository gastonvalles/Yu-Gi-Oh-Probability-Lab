import { useEffect, useState } from 'react'

import type { ComparisonRules } from './build-comparison'
import {
  MAX_MEASURED_CHANGES,
  applyChangeToMain,
  changeEffectOf,
  measureSnapshot,
  oddsInputOf,
  oddsKeyOf,
  type ChangeEffectResult,
  type MeasureSnapshot,
} from './change-effects'
import type { MainChange } from './change-pairs'
import { requestLabOdds } from './lab-odds-client'
import type { DeckCardInstance } from './model'

export interface ChangeEffectsState {
  /** Por `MainChange.key`. */
  results: Record<string, ChangeEffectResult>
  /** Las medidas de A sin cambios (lo que se resta). */
  base: MeasureSnapshot | null
  /** Cambios ya medidos de los que se miden (sin los pendientes de clasificar ni los que pasan el tope). */
  progress: { done: number; total: number }
  isDone: boolean
}

const IDLE: ChangeEffectsState = { results: {}, base: null, progress: { done: 0, total: 0 }, isDone: true }
/** Dos a la vez: queda un worker libre para lo que la persona está esperando (y esos pedidos, además, tienen prioridad). */
const CONCURRENCY = 2

/**
 * Mide cada cambio solo sobre el Main de A (`main`), en los workers, con prioridad baja y caché por contenido (volver a abrir Comparar no
 * repite nada). Cancelable: si cambian A, los cambios o las reglas (o se desmonta), no se piden más y lo que llega tarde se ignora.
 * `changes` y `rules` tienen que venir memoizados.
 */
export function useChangeEffects(
  main: DeckCardInstance[] | null,
  changes: readonly MainChange[],
  rules: ComparisonRules,
  enabled = true,
): ChangeEffectsState {
  const [state, setState] = useState<ChangeEffectsState>(IDLE)

  useEffect(() => {
    if (!enabled || !main || changes.length === 0) {
      setState(IDLE)
      return
    }

    let cancelled = false
    const measured = changes.filter((change) => !change.pending).slice(0, MAX_MEASURED_CHANGES)
    const results: Record<string, ChangeEffectResult> = Object.fromEntries(
      changes.map((change) => [
        change.key,
        change.pending ? { status: 'pending' } : measured.includes(change) ? { status: 'loading' } : { status: 'skipped' },
      ]),
    )
    let done = 0
    const publish = (base: MeasureSnapshot | null) =>
      setState({ results: { ...results }, base, progress: { done, total: measured.length }, isDone: done === measured.length })

    publish(null)

    const baseInput = oddsInputOf(main, rules)

    void requestLabOdds(oddsKeyOf(baseInput), baseInput, 'low').then(async (baseOdds) => {
      if (cancelled) {
        return
      }

      if (!baseOdds) {
        for (const change of measured) {
          results[change.key] = { status: 'blocked' }
        }

        done = measured.length
        publish(null)
        return
      }

      const base = measureSnapshot(baseOdds, baseInput)
      let next = 0
      const lane = async () => {
        while (!cancelled && next < measured.length) {
          const change = measured[next]!
          next += 1

          const input = oddsInputOf(applyChangeToMain(main, change), rules)
          const odds = await requestLabOdds(oddsKeyOf(input), input, 'low')

          if (cancelled) {
            return
          }

          results[change.key] = odds ? { status: 'done', effect: changeEffectOf(base, measureSnapshot(odds, input)) } : { status: 'blocked' }
          done += 1
          publish(base)
        }
      }

      publish(base)
      await Promise.all(Array.from({ length: CONCURRENCY }, lane))
    })

    return () => {
      cancelled = true
    }
  }, [changes, enabled, main, rules])

  return state
}
