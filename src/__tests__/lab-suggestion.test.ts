import { describe, expect, it } from 'vitest'

import { computeLabOdds } from '../app/lab-odds'
import { buildCandidates, findCulprit, pickBestSuggestion } from '../app/lab-suggestion'
import { createMatcherPattern } from '../app/pattern-factory'
import { computeLabResults } from '../app/probability-lab'
import type { CardEntry, CardRole, HandPattern } from '../types'

function card(id: string, copies: number, roles: CardRole[]): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

// 20 starters sueltos (casi siempre hay salida) y 6 bricks: el problema "2+ Brick" pesa más que no tener salida.
const deck = (): CardEntry[] => [
  ...Array.from({ length: 20 }, (_, index) => card(`s${index}`, 1, ['starter'])),
  card('brick', 6, ['brick']),
  ...Array.from({ length: 14 }, (_, index) => card(`f${index}`, 1, ['tech'])),
]

const opening = createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])
const problem = createMatcherPattern('2+ Brick', 'problem', [{ matcher: { type: 'role', value: 'brick' }, quantity: 2, kind: 'include' }])

function averageOf(cards: CardEntry[], checks: HandPattern[]) {
  const computation = computeLabResults(cards, checks, 5)
  if (computation.status !== 'ok') throw new Error('no calculable')
  return computation.results.average
}

describe('lab-suggestion', () => {
  it('marca como culpable lo que más pesa y propone sacar copias de lo que causa el problema', () => {
    const cards = deck()
    const checks = [opening, problem]
    const result = averageOf(cards, checks)
    const culprit = findCulprit(result)

    expect(culprit?.kind).toBe('problem')

    const candidates = buildCandidates(culprit!, cards, checks)
    expect(candidates.every((candidate) => candidate.action === 'remove')).toBe(true)
    expect(candidates[0].card.id).toBe('brick')
    expect(candidates[0].cards.find((entry) => entry.id === 'brick')?.copies).toBe(5)
  })

  it('sugiere sumar starters cuando el problema son las manos sin salida', () => {
    const cards = [card('starter', 1, ['starter']), ...Array.from({ length: 39 }, (_, index) => card(`f${index}`, 1, ['tech']))]
    const result = averageOf(cards, [opening])
    const culprit = findCulprit(result)

    expect(culprit?.kind).toBe('no-opening')

    const candidates = buildCandidates(culprit!, cards, [opening])
    expect(candidates[0].action).toBe('add')
    expect(candidates[0].cards.find((entry) => entry.id === 'starter')?.copies).toBe(2)

    const evaluated = candidates.map((candidate) => ({ candidate, odds: computeLabOdds({ cards: candidate.cards, patterns: [opening], handSize: 5 }) }))
    const best = pickBestSuggestion(culprit!, result.cleanProbability, 'average', evaluated)

    expect(best?.action).toBe('add')
    expect(best!.cleanProbability).toBeGreaterThan(result.cleanProbability)
    expect(best!.culpritProbability).toBeLessThan(culprit!.probability)
  })

  it('no sugiere nada si ningún cambio mejora lo suficiente', () => {
    const cards = deck()
    const culprit = { kind: 'no-opening' as const, patternId: null, name: 'x', probability: 0.1 }
    const candidate = { action: 'add' as const, card: cards[0], cards }
    const odds = computeLabOdds({ cards, patterns: [opening], handSize: 5 })

    expect(pickBestSuggestion(culprit, 1, 'average', [{ candidate, odds }])).toBeNull()
  })
})
