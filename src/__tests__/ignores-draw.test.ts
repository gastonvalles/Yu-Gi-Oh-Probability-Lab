import { describe, expect, it } from 'vitest'

import { createMatcherPattern } from '../app/pattern-factory'
import { buildDerivedDeckGroupMap } from '../app/deck-groups'
import { computeLabResults } from '../app/probability-lab'
import { buildPracticeDeck, evaluatePracticeHand, type PracticeHandCard } from '../components/probability/practice'
import type { CardEntry } from '../types'

const card = (id: string, copies: number, roles: CardEntry['roles']): CardEntry => ({
  id, name: id, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false,
})
const cards = [card('m', 3, ['handtrap']), card('s', 3, ['starter']), card('f', 34, ['combo_piece'])]
const rule = (ignoresDraw: boolean) => ({
  ...createMatcherPattern('2+ M', 'opening', [{ matcher: { type: 'card', value: 'm' }, quantity: 2, kind: 'include' }], { turnContext: 'second' }),
  ignoresDraw,
})
const choose = (n: number, k: number) => (k < 0 || k > n ? 0 : Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce((a, b) => a * b, 1))
const atLeast2of3 = (hand: number) => (choose(3, 2) * choose(37, hand - 2) + choose(3, 3) * choose(37, hand - 3)) / choose(40, hand)

describe('reglas que ignoran la carta robada yendo 2º', () => {
  it('la regla "Solo 2º" cuenta las 6 cartas por defecto', () => {
    const lab = computeLabResults(cards, [rule(false), createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])], 5)
    if (lab.status !== 'ok') throw new Error('blocked')
    expect(lab.results.second.patternResults.find((r) => r.name === '2+ M')!.probability).toBeCloseTo(atLeast2of3(6), 9)
  })

  it('con "no contar el robo" da el mismo % que yendo 1º (5 cartas)', () => {
    const lab = computeLabResults(cards, [rule(true), createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])], 5)
    if (lab.status !== 'ok') throw new Error('blocked')
    expect(lab.results.second.patternResults.find((r) => r.name === '2+ M')!.probability).toBeCloseTo(atLeast2of3(5), 9)
  })

  it('en la práctica la carta robada no cuenta para esa regla', () => {
    const deck = buildPracticeDeck(cards)
    const pick = (ids: string[]): PracticeHandCard[] => ids.map((id, i) => ({ ...deck.find((c) => c.cardId === id)!, drawId: `${id}-${i}` }))
    const hand = pick(['m', 'f', 'f', 'f', 'f', 'm'])
    const groups = buildDerivedDeckGroupMap(cards)

    expect(evaluatePracticeHand(hand, [rule(false)], cards, groups, 'second', 5).matches).toHaveLength(1)
    expect(evaluatePracticeHand(hand, [rule(true)], cards, groups, 'second', 5).matches).toHaveLength(0)
  })
})
