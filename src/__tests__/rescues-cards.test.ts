import { describe, expect, it } from 'vitest'

import { buildDerivedDeckGroupMap } from '../app/deck-groups'
import { createMatcherPattern } from '../app/pattern-factory'
import { computeLabResults } from '../app/probability-lab'
import { buildPracticeDeck, evaluatePracticeHand, type PracticeHandCard } from '../components/probability/practice'
import type { CardEntry } from '../types'

const card = (id: string, copies: number, roles: CardEntry['roles']): CardEntry => ({
  id, name: id, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false,
})
const cards = [card('g', 3, ['garnet']), card('r', 3, ['combo_piece']), card('s', 3, ['starter']), card('f', 31, ['combo_piece'])]

const problem = createMatcherPattern('2+ muertas', 'problem', [
  { matcher: { type: 'card_pool', value: ['g', 'r'] }, quantity: 2, kind: 'include' },
])
const combo = (rescuesCards: boolean) => ({
  ...createMatcherPattern('G + R', 'opening', [
    { matcher: { type: 'card', value: 'g' }, quantity: 1, kind: 'include' },
    { matcher: { type: 'card', value: 'r' }, quantity: 1, kind: 'include' },
  ]),
  rescuesCards,
})
const starter = createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])

describe('salidas que rescatan las cartas que usan', () => {
  it('en la práctica el problema no aparece si la salida rescatadora usa esas cartas', () => {
    const deck = buildPracticeDeck(cards)
    const pick = (ids: string[]): PracticeHandCard[] => ids.map((id, i) => ({ ...deck.find((c) => c.cardId === id)!, drawId: `${id}-${i}` }))
    const hand = pick(['g', 'r', 'f', 'f', 'f'])
    const groups = buildDerivedDeckGroupMap(cards)

    expect(evaluatePracticeHand(hand, [combo(false), problem], cards, groups, 'first').problemMatches).toHaveLength(1)
    expect(evaluatePracticeHand(hand, [combo(true), problem], cards, groups, 'first').problemMatches).toHaveLength(0)
  })

  it('en el Lab baja el % del problema y suben las manos limpias', () => {
    const run = (rescues: boolean) => {
      const lab = computeLabResults(cards, [combo(rescues), starter, problem], 5)
      if (lab.status !== 'ok') throw new Error('blocked')
      return lab.results.first
    }
    const without = run(false)
    const withRescue = run(true)

    expect(withRescue.patternResults.find((r) => r.name === '2+ muertas')!.probability).toBeLessThan(
      without.patternResults.find((r) => r.name === '2+ muertas')!.probability,
    )
    expect(withRescue.cleanProbability).toBeGreaterThan(without.cleanProbability)
    // La salida y el resto no cambian.
    expect(withRescue.patternResults.find((r) => r.name === 'G + R')!.probability).toBeCloseTo(
      without.patternResults.find((r) => r.name === 'G + R')!.probability,
      12,
    )
  })
})
