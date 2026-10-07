import { describe, expect, it } from 'vitest'

import { computeLabOdds } from '../app/lab-odds'
import { buildCandidates, findCulprit, pickBest, pickTradeoff, toOutcomes, type Evaluation } from '../app/lab-suggestion'
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

const evaluate = (candidates: ReturnType<typeof buildCandidates>, patterns: HandPattern[]): Evaluation[] =>
  candidates.map((candidate) => ({ candidate, odds: computeLabOdds({ cards: candidate.cards, patterns, handSize: 5 }) }))

describe('lab-suggestion', () => {
  it('ante un problema por presencia propone sacar o cambiar la carta que lo causa y mejora las limpias', () => {
    const cards = deck()
    const checks = [opening, problem]
    const result = averageOf(cards, checks)
    const culprit = findCulprit(result)

    expect(culprit?.kind).toBe('problem')

    const candidates = buildCandidates(culprit!, cards, checks)
    // El motor exige 40 cartas: todo cambio mantiene el tamaño del deck (sacar = cambiar por una carta neutra).
    expect(candidates.every((candidate) => candidate.cards.reduce((n, c) => n + c.copies, 0) === 40)).toBe(true)
    expect(candidates.some((candidate) => candidate.changes.length === 1 && candidate.changes[0].card.id === 'brick')).toBe(true)
    expect(candidates.some((candidate) => candidate.changes.length === 2)).toBe(true)

    const outcomes = toOutcomes(culprit!, 'average', evaluate(candidates, checks))
    const best = pickBest(outcomes, result.cleanProbability)

    expect(best).not.toBeNull()
    expect(best!.cleanProbability).toBeGreaterThan(result.cleanProbability)
    expect(best!.culpritProbability).toBeLessThan(culprit!.probability)
    expect(best!.changes.some((change) => change.action === 'remove' && change.card.id === 'brick')).toBe(true)
  })

  it('si el problema son las manos sin salida cambia una carta que no abre por un starter', () => {
    const cards = [card('starter', 1, ['starter']), ...Array.from({ length: 39 }, (_, index) => card(`f${index}`, 1, ['tech']))]
    const result = averageOf(cards, [opening])
    const culprit = findCulprit(result)

    expect(culprit?.kind).toBe('no-opening')

    const candidates = buildCandidates(culprit!, cards, [opening])
    expect(candidates[0].changes.map((change) => change.action)).toEqual(['remove', 'add'])
    expect(candidates[0].cards.reduce((n, c) => n + c.copies, 0)).toBe(40)

    const best = pickBest(toOutcomes(culprit!, 'average', evaluate(candidates, [opening])), result.cleanProbability)

    expect(best?.changes.find((change) => change.action === 'add')?.card.id).toBe('starter')
    expect(best!.culpritProbability).toBeLessThan(culprit!.probability)
  })

  it('si sacar la carta cuesta más salidas de las que ahorra, no recomienda y deja el costo a la vista', () => {
    // Las cartas del problema también son las únicas que abren: sacarlas baja el problema pero hunde las salidas.
    const cards = [card('both', 4, ['starter', 'brick']), ...Array.from({ length: 36 }, (_, index) => card(`f${index}`, 1, ['tech']))]
    const checks = [opening, problem]
    const result = averageOf(cards, checks)
    const culprit = { kind: 'problem' as const, patternId: problem.id, name: problem.name, probability: result.patternResults.find((entry) => entry.patternId === problem.id)!.probability }
    const outcomes = toOutcomes(culprit, 'average', evaluate(buildCandidates(culprit, cards, checks), checks))

    expect(pickBest(outcomes, result.cleanProbability)).toBeNull()
    expect(pickTradeoff(outcomes, culprit.probability)?.cleanProbability).toBeLessThan(result.cleanProbability)
  })

  it('si el problema no se puede bajar sin perder salidas, recomienda subir las salidas por otro lado', () => {
    const cards = [
      card('both', 4, ['starter', 'brick']),
      card('pure', 1, ['starter']),
      ...Array.from({ length: 35 }, (_, index) => card(`f${index}`, 1, ['tech'])),
    ]
    const checks = [opening, problem]
    const result = averageOf(cards, checks)
    const culprit = { kind: 'problem' as const, patternId: problem.id, name: problem.name, probability: result.patternResults.find((entry) => entry.patternId === problem.id)!.probability }
    const outcomes = toOutcomes(culprit, 'average', evaluate(buildCandidates(culprit, cards, checks), checks))
    const best = pickBest(outcomes, result.cleanProbability)

    expect(best).not.toBeNull()
    expect(best!.changes.find((change) => change.action === 'add')?.card.id).toBe('pure')
    expect(best!.cleanProbability).toBeGreaterThan(result.cleanProbability)
  })
})
