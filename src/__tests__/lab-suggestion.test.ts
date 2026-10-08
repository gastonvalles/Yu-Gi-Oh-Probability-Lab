import { describe, expect, it } from 'vitest'

import { computeLabOdds } from '../app/lab-odds'
import { buildCandidates, findCulprit, pickBest, toOutcomes, type Evaluation } from '../app/lab-suggestion'
import { createMatcherPattern } from '../app/pattern-factory'
import { computeLabResults } from '../app/probability-lab'
import type { CardEntry, CardRole, HandPattern } from '../types'

function card(id: string, copies: number, roles: CardRole[], origin: CardEntry['origin'] = 'engine'): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin, roles, needsReview: false }
}

// 20 starters sueltos (casi siempre hay salida) y 6 bricks: el problema "2+ Brick" pesa más que no tener salida.
const deck = (): CardEntry[] => [
  ...Array.from({ length: 20 }, (_, index) => card(`s${index}`, 1, ['starter'])),
  card('brick', 6, ['brick'], 'non_engine'),
  ...Array.from({ length: 14 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine')),
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
  it('ante un problema por presencia propone mover un lugar de brick a starter y mejora las limpias', () => {
    const cards = deck()
    const checks = [opening, problem]
    const result = averageOf(cards, checks)
    const culprit = findCulprit(result)

    expect(culprit?.kind).toBe('problem')

    const candidates = buildCandidates(culprit!, cards, checks)
    // El motor exige 40 cartas: todo cambio mantiene el tamaño del deck (sacar = cambiar por una carta neutra).
    expect(candidates.every((candidate) => candidate.cards.reduce((n, c) => n + c.copies, 0) === 40)).toBe(true)
    expect(candidates.some((candidate) => candidate.swap.from === 'brick' && candidate.swap.to === 'starter')).toBe(true)

    const outcomes = toOutcomes(culprit!, 'average', evaluate(candidates, checks))
    const best = pickBest(outcomes, result.cleanProbability)

    expect(best).not.toBeNull()
    expect(best!.cleanProbability).toBeGreaterThan(result.cleanProbability)
    expect(best!.culpritProbability).toBeLessThan(culprit!.probability)
    expect(best!.swap.from).toBe('brick')
  })

  it('si el problema son las manos sin salida cambia una carta que no abre por un starter', () => {
    const cards = [card('starter', 1, ['starter']), ...Array.from({ length: 39 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine'))]
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

  it('no propone sacar piezas del engine aunque cuenten como brick: son parte del combo', () => {
    const cards = [
      card('combo', 4, ['enabler', 'brick'], 'engine'),
      card('filler', 2, ['brick'], 'non_engine'),
      ...Array.from({ length: 34 }, (_, index) => card(`f${index}`, 1, ['starter'])),
    ]
    const checks = [opening, problem]
    const result = averageOf(cards, checks)
    const culprit = { kind: 'problem' as const, patternId: problem.id, name: problem.name, probability: result.patternResults.find((entry) => entry.patternId === problem.id)!.probability }
    const removed = buildCandidates(culprit, cards, checks).flatMap((candidate) => candidate.changes.filter((change) => change.action === 'remove').map((change) => change.card.id))

    expect(removed).toContain('filler')
    expect(removed).not.toContain('combo')
  })

  it('si el problema no se puede bajar sin perder salidas, recomienda subir las salidas por otro lado', () => {
    const cards = [
      card('both', 4, ['starter', 'brick']),
      card('pure', 1, ['starter']),
      ...Array.from({ length: 35 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine')),
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

  it('funciona con reglas que sólo aplican yendo 2º (no existen yendo 1º)', () => {
    const secondOnly = createMatcherPattern('Sin starter yendo 2º', 'problem', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'exclude' }], {
      turnContext: 'second',
    })
    const cards = [card('starter', 1, ['starter']), ...Array.from({ length: 39 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine'))]
    // El Lab necesita al menos una regla que valga yendo 1º para calcular ambas vistas.
    const checks = [opening, secondOnly]
    const result = computeLabResults(cards, checks, 5)

    if (result.status !== 'ok') throw new Error('no calculable')

    const culprit = { kind: 'problem' as const, patternId: secondOnly.id, name: secondOnly.name, probability: result.results.second.patternResults.find((entry) => entry.patternId === secondOnly.id)!.probability }
    const outcomes = toOutcomes(culprit, 'second', evaluate(buildCandidates(culprit, cards, checks), checks))
    const best = pickBest(outcomes, result.results.second.cleanProbability)

    expect(outcomes.length).toBeGreaterThan(0)
    expect(best?.changes.find((change) => change.action === 'add')?.card.id).toBe('starter')
    expect(best!.culpritProbability).toBeLessThan(culprit.probability)
  })

  it('no sugiere sumar copias que la banlist no permite', () => {
    const cards = [card('starter', 1, ['starter']), card('free', 1, ['extender']), ...Array.from({ length: 38 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine'))]
    const culprit = { kind: 'no-opening' as const, patternId: null, name: 'x', probability: 0.5 }
    // "starter" está limitada a 1 copia: no se puede sumar otra.
    const candidates = buildCandidates(culprit, cards, [opening], (entry) => (entry.id === 'starter' ? 1 : 3))
    const added = candidates.flatMap((candidate) => candidate.changes.filter((change) => change.action === 'add').map((change) => change.card.id))

    expect(added).not.toContain('starter')
    expect(added).toContain('free')
  })

  it('el lugar sale primero del relleno, después de los bricks y recién después de la interacción', () => {
    const cards = [
      card('starter', 1, ['starter']),
      card('ash', 3, ['handtrap', 'disruption'], 'non_engine'),
      card('brick', 1, ['brick'], 'non_engine'),
      ...Array.from({ length: 35 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine')),
    ]
    const culprit = { kind: 'no-opening' as const, patternId: null, name: 'x', probability: 0.5 }
    const candidates = buildCandidates(culprit, cards, [opening])

    expect(candidates.map((candidate) => candidate.swap.from)).toEqual(['filler', 'brick', 'interaction'])
    expect(candidates.every((candidate) => candidate.swap.to === 'starter')).toBe(true)
  })

  it('con un problema por ausencia de handtraps propone "sacá un starter y meté una handtrap" entre las opciones', () => {
    const cards = [
      ...Array.from({ length: 12 }, (_, index) => card(`s${index}`, 2, ['starter'])),
      card('ht', 1, ['handtrap'], 'non_engine'),
      card('brick', 1, ['brick'], 'non_engine'),
      card('f', 1, ['recovery'], 'non_engine'),
    ]
    const noAnswer = createMatcherPattern('Sin handtrap', 'problem', [{ matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'exclude' }])
    const culprit = { kind: 'problem' as const, patternId: noAnswer.id, name: noAnswer.name, probability: 0.6 }
    const swaps = buildCandidates(culprit, cards, [opening, noAnswer]).map((candidate) => `${candidate.swap.from}>${candidate.swap.to}`)

    expect(swaps).toContain('starter>interaction')
    expect(swaps).toContain('filler>interaction')
  })

  it('nunca propone cambiar una carta por otra de la misma familia (p. ej. un starter por otro starter)', () => {
    const cards = [
      ...Array.from({ length: 12 }, (_, index) => card(`s${index}`, 2, ['starter'])),
      // Una carta que es starter y además handtrap: entra por su handtrap, no "como starter".
      card('both', 1, ['starter', 'handtrap'], 'non_engine'),
      card('brick', 1, ['brick'], 'non_engine'),
      card('f', 1, ['recovery'], 'non_engine'),
    ]
    const noAnswer = createMatcherPattern('Sin handtrap', 'problem', [{ matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'exclude' }])
    const culprit = { kind: 'problem' as const, patternId: noAnswer.id, name: noAnswer.name, probability: 0.6 }
    const candidates = buildCandidates(culprit, cards, [opening, noAnswer])

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((candidate) => candidate.swap.from !== candidate.swap.to)).toBe(true)
    expect(candidates.map((candidate) => `${candidate.swap.from}>${candidate.swap.to}`)).toContain('starter>interaction')
  })

  it('reconoce el problema por ausencia aunque la regla cuente un pool de cartas (como las reglas del sistema)', () => {
    const cards = [
      ...Array.from({ length: 12 }, (_, index) => card(`s${index}`, 2, ['starter'])),
      card('ht', 1, ['handtrap'], 'non_engine'),
      card('f', 1, ['recovery'], 'non_engine'),
    ]
    const poolRule = createMatcherPattern('Sin interrupción', 'problem', [{ matcher: { type: 'card_pool', value: ['ht'] }, quantity: 1, kind: 'exclude' }], { turnContext: 'second' })
    const culprit = { kind: 'problem' as const, patternId: poolRule.id, name: poolRule.name, probability: 0.6 }
    const swaps = buildCandidates(culprit, cards, [opening, poolRule]).map((candidate) => `${candidate.swap.from}>${candidate.swap.to}`)

    expect(swaps.length).toBeGreaterThan(0)
    expect(swaps.every((swap) => swap.endsWith('>interaction'))).toBe(true)
  })

  it('en el Promedio una regla "Solo 2º" pesa la mitad: el culpable global puede ser otro que el de 2º', () => {
    const cards = [
      card('ht', 6, ['handtrap'], 'non_engine'),
      card('brick', 6, ['brick'], 'non_engine'),
      ...Array.from({ length: 14 }, (_, index) => card(`s${index}`, 1, ['starter'])),
      ...Array.from({ length: 14 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine')),
    ]
    const noAnswer = createMatcherPattern('Sin handtrap yendo 2º', 'problem', [{ matcher: { type: 'role', value: 'handtrap' }, quantity: 1, kind: 'exclude' }], {
      turnContext: 'second',
    })
    const computation = computeLabResults(cards, [opening, problem, noAnswer], 5)

    if (computation.status !== 'ok') throw new Error('no calculable')

    const { first, second, average } = computation.results

    expect(findCulprit(second)?.patternId).toBe(noAnswer.id)
    expect(findCulprit(average, { first, second })?.patternId).toBe(problem.id)
  })
})
