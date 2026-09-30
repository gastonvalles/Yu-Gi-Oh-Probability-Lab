import { describe, expect, it } from 'vitest'

import { buildVerdict, compareBuilds, computeCardDiffs } from '../app/build-comparison'
import { createMatcherPattern } from '../app/pattern-factory'
import { computeLabResults } from '../app/probability-lab'
import { buildActiveRuleSet } from '../app/pattern-presets'
import type { CardEntry, CardRole } from '../types'

function card(id: string, copies: number, roles: CardRole[], origin: CardEntry['origin'] = 'engine'): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin, roles, needsReview: false }
}

const filler = (count: number, prefix = 'f') =>
  Array.from({ length: count }, (_, index) => card(`${prefix}${index}`, 1, ['combo_piece']))

const BASE = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('b1', 3, ['brick']), ...filler(31)]
const RULES = { patterns: [], disabledGenericRuleIds: [], handSize: 5 }

describe('compareBuilds', () => {
  it('usa el mismo cálculo que el Lab (1º, 2º y promedio)', () => {
    const comparison = compareBuilds({ name: 'A', cards: BASE }, { name: 'B', cards: BASE }, RULES)
    const lab = computeLabResults(BASE, buildActiveRuleSet(BASE, [], []), 5)

    if (lab.status !== 'ok') throw new Error('Se esperaba un resultado')
    expect(comparison.clean?.first.a).toBeCloseTo(lab.results.first.cleanProbability)
    expect(comparison.clean?.second.a).toBeCloseTo(lab.results.second.cleanProbability)
    expect(comparison.clean?.average.a).toBeCloseTo(lab.results.average.cleanProbability)
    expect(comparison.verdict.kind).toBe('identical')
  })

  it('una build con más starters y menos bricks gana, y se listan los cambios', () => {
    const better = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('s3', 3, ['starter']), ...filler(31)]
    const comparison = compareBuilds({ name: 'Vieja', cards: BASE }, { name: 'Nueva', cards: better }, RULES)

    expect(comparison.clean!.average.delta).toBeGreaterThan(0)
    expect(comparison.verdict.kind).toBe('b')
    expect(comparison.cardDiffs.map((diff) => [diff.cardId, diff.delta])).toEqual([['s3', 3], ['b1', -3]])
  })

  it('usa las reglas propias con cartas concretas; si una build no tiene la carta, ahí no se cumple', () => {
    const combo = createMatcherPattern('Combo s1', 'opening', [{ matcher: { type: 'card', value: 's1' }, quantity: 1, kind: 'include' }])
    const withoutS1 = [card('s2', 3, ['starter']), card('b1', 3, ['brick']), ...filler(34)]
    const comparison = compareBuilds(
      { name: 'A', cards: BASE },
      { name: 'B', cards: withoutS1 },
      { ...RULES, patterns: [combo] },
    )
    const row = comparison.rules.find((rule) => rule.id === combo.id)

    expect(row?.a).toBeGreaterThan(0)
    expect(row?.b).toBe(0)
    expect(row?.missingCardsIn).toEqual(['B'])
  })

  it('las reglas "Solo 2º" no afectan las manos yendo 1º', () => {
    const onlySecond = createMatcherPattern(
      'Brick yendo 2º',
      'problem',
      [{ matcher: { type: 'role', value: 'brick' }, quantity: 1, kind: 'include' }],
      { turnContext: 'second' },
    )
    // Sin interacción en el mazo de prueba, la genérica "Sin respuesta yendo 2º" taparía el efecto.
    const rules = { ...RULES, disabledGenericRuleIds: ['no_answer_second_problem'] }
    const plain = compareBuilds({ name: 'A', cards: BASE }, { name: 'B', cards: BASE }, rules)
    const withRule = compareBuilds({ name: 'A', cards: BASE }, { name: 'B', cards: BASE }, { ...rules, patterns: [onlySecond] })

    expect(withRule.clean!.first.a).toBeCloseTo(plain.clean!.first.a)
    expect(withRule.clean!.second.a).toBeLessThan(plain.clean!.second.a)
  })

  it('marca cartas sin clasificar y no calcula con un Main Deck demasiado chico', () => {
    const pending = [...BASE.slice(0, -1), { ...card('x', 1, []), origin: null }]
    const comparison = compareBuilds({ name: 'A', cards: BASE }, { name: 'B', cards: pending }, RULES)
    expect(comparison.b.pendingCards.map((entry) => entry.id)).toEqual(['x'])

    const tiny = compareBuilds({ name: 'A', cards: BASE }, { name: 'B', cards: [card('s1', 3, ['starter'])] }, RULES)
    expect(tiny.verdict.kind).toBe('incomplete')
  })
})

describe('computeCardDiffs', () => {
  it('ignora cartas iguales y ordena primero lo que suma B', () => {
    const diffs = computeCardDiffs([card('a', 3, []), card('b', 2, [])], [card('a', 3, []), card('b', 3, []), card('c', 1, [])])
    expect(diffs.map((diff) => `${diff.cardId}:${diff.delta}`)).toEqual(['b:1', 'c:1'])
  })
})

describe('buildVerdict', () => {
  const clean = (first: number, second: number) => ({
    first: { a: 0.5, b: 0.5 + first, delta: first },
    second: { a: 0.5, b: 0.5 + second, delta: second },
    average: { a: 0.5, b: 0.5 + (first + second) / 2, delta: (first + second) / 2 },
  })

  it('detecta empate, ganador y cuando depende del turno', () => {
    expect(buildVerdict('A', 'B', clean(0.001, -0.002), false).kind).toBe('equivalent')
    expect(buildVerdict('A', 'B', clean(0.03, 0.02), false).kind).toBe('b')
    expect(buildVerdict('A', 'B', clean(0.03, -0.02), false).kind).toBe('split')
    expect(buildVerdict('A', 'B', null, false).kind).toBe('incomplete')
  })
})
