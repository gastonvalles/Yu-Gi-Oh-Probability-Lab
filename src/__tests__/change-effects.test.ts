/** @vitest-environment jsdom */
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { compareBuilds } from '../app/build-comparison'
import { swapInDeck } from '../app/build-draft'
import { deriveMainDeckCardsFromZone } from '../app/calculator-state'
import {
  MAX_MEASURED_CHANGES,
  applyChangeToMain,
  changeEffectOf,
  handsOf,
  measureSnapshot,
  oddsInputOf,
  roleMeasure,
  ruleMeasure,
  whatMovesMeasure,
  type ChangeEffectResult,
} from '../app/change-effects'
import { pairChanges, type MainChange } from '../app/change-pairs'
import { computeLabOdds } from '../app/lab-odds'
import { computeLabResults } from '../app/probability-lab'
import { buildRoleDistributions } from '../app/role-distribution'
import type { BuildZones } from '../app/saved-builds'
import { useChangeEffects } from '../app/use-change-effects'
import { copies, fortyCardMain } from './support/deck-fixtures'

afterEach(cleanup)

const RULES = { patterns: [], disabledGenericRuleIds: [], handSize: 5 }
const A: BuildZones = { main: fortyCardMain(), extra: [], side: [] }

function swapped(deck: BuildZones, out: number, inn: number): BuildZones {
  const result = swapInDeck(deck, { kind: 'swap', out, in: inn }, 'unlimited')

  if (!result.ok) throw new Error('el cambio tenía que poder hacerse')
  return result.zones
}

/** El efecto de un cambio calculado en el hilo de la prueba (lo mismo que hace el hook en los workers). */
function effectOf(main: BuildZones['main'], change: MainChange) {
  const baseInput = oddsInputOf(main, RULES)
  const afterInput = oddsInputOf(applyChangeToMain(main, change), RULES)

  return changeEffectOf(measureSnapshot(computeLabOdds(baseInput)!, baseInput), measureSnapshot(computeLabOdds(afterInput)!, afterInput))
}

describe('el efecto de cada cambio', () => {
  // B = A con una Handtrap menos y un Starter Uno más: un solo cambio, así su efecto es toda la diferencia entre A y B.
  const B = swapped(A, 10, 1)
  const [change] = pairChanges(A, B).main

  it('con un solo cambio, su efecto es exactamente lo que Comparar dice entre A y B', () => {
    const effect = effectOf(A.main, change!)
    const comparison = compareBuilds(
      { name: 'A', cards: deriveMainDeckCardsFromZone(A.main) },
      { name: 'B', cards: deriveMainDeckCardsFromZone(B.main) },
      RULES,
    )

    expect(effect.delta.clean?.average).toBeCloseTo(comparison.clean!.average.delta, 12)
    expect(effect.delta.clean?.first).toBeCloseTo(comparison.clean!.first.delta, 12)
    expect(effect.delta.clean?.second).toBeCloseTo(comparison.clean!.second.delta, 12)
    expect(comparison.rules.length).toBeGreaterThan(0)

    for (const row of comparison.rules) {
      expect(effect.delta[ruleMeasure(row.id)]?.average).toBeCloseTo(row.delta!, 12)
    }

    const starters = (deck: BuildZones) => buildRoleDistributions(deriveMainDeckCardsFromZone(deck.main), [5])[0]!.atLeastOne
    expect(effect.delta[roleMeasure('starter')]?.first).toBeCloseTo(starters(B) - starters(A), 12)
  })

  it('las cuentas de manos son las del motor (N de M)', () => {
    const effect = effectOf(A.main, change!)
    const lab = computeLabResults(deriveMainDeckCardsFromZone(B.main), oddsInputOf(B.main, RULES).patterns, 5)

    if (lab.status !== 'ok') throw new Error('se esperaba un resultado')
    expect(handsOf(effect.after, 'clean', 'first')).toEqual({ hands: lab.results.first.cleanHands, total: 658_008 })
    expect(handsOf(effect.after, 'noOpening', 'second')?.total).toBe(3_838_380)
  })

  it('«qué la mueve»: los cambios que mueven la medida, del que más al que menos, sin los que no', () => {
    const small = { key: 'small', out: null, in: null, copies: 1, pending: false }
    const big = { ...small, key: 'big' }
    const none = { ...small, key: 'none' }
    const done = (value: number): ChangeEffectResult => ({
      status: 'done',
      effect: { delta: { noOpening: { first: value, second: value, average: value } }, after: { values: {}, totals: { first: 0, second: 0 } } },
    })
    const results = { small: done(-0.01), big: done(0.05), none: done(0.0001) }

    expect(whatMovesMeasure([small, big, none], results, 'noOpening', 'average').map((mover) => [mover.change.key, mover.delta])).toEqual([
      ['big', 0.05],
      ['small', -0.01],
    ])
  })
})

describe('useChangeEffects', () => {
  it('mide cada cambio en segundo plano y deja los pendientes de clasificar sin medir', async () => {
    // Una Handtrap por un Starter Uno, y un relleno por una carta sin clasificar (ese no se puede medir todavía).
    const b = { main: [...swapped(A, 10, 1).main.slice(0, -1), ...copies(77, 'Sin clasificar', 1, [], { origin: null })], extra: [], side: [] }
    const changes = pairChanges(A, b).main
    const { result } = renderHook(() => useChangeEffects(A.main, changes, RULES))

    await waitFor(() => expect(result.current.isDone).toBe(true))

    const measured = changes.filter((entry) => !entry.pending)
    expect(changes.some((entry) => entry.pending)).toBe(true)
    expect(result.current.progress).toEqual({ done: measured.length, total: measured.length })

    for (const entry of changes) {
      const state = result.current.results[entry.key]

      if (entry.pending) {
        expect(state).toEqual({ status: 'pending' })
      } else {
        expect(state?.status).toBe('done')
        expect(state?.status === 'done' && state.effect.delta.clean?.average).toBeCloseTo(effectOf(A.main, entry).delta.clean!.average!, 12)
      }
    }
  })

  it(`mide como mucho ${MAX_MEASURED_CHANGES} cambios: los demás quedan sin medir`, async () => {
    // Nueve cartas distintas que salen (una copia de cada una) y nueve nuevas que entran: nueve cambios.
    const outs = [10, 20, 900, 901, 902, 903, 904, 905, 906]
    const kept = [...A.main]

    for (const out of outs) {
      kept.splice(kept.findIndex((card) => card.apiCard.ygoprodeckId === out), 1)
    }

    const b = { main: [...kept, ...outs.flatMap((_, index) => copies(600 + index, `Nueva ${index}`, 1, ['starter']))], extra: [], side: [] }
    const changes = pairChanges(A, b).main
    const { result } = renderHook(() => useChangeEffects(A.main, changes, RULES))

    expect(changes.length).toBeGreaterThan(MAX_MEASURED_CHANGES)
    await waitFor(() => expect(result.current.isDone).toBe(true), { timeout: 10_000 })
    expect(Object.values(result.current.results).filter((state) => state.status === 'skipped')).toHaveLength(changes.length - MAX_MEASURED_CHANGES)
  })
})
