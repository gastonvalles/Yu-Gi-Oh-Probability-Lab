import { describe, expect, it } from 'vitest'

import { compareBuilds } from '../app/build-comparison'
import { createMatcherPattern } from '../app/pattern-factory'
import { computeLabResults } from '../app/probability-lab'
import { buildActiveRuleSet } from '../app/pattern-presets'
import { DECK_A, DECK_B, HANDS, RULES } from './support/comparison-fixtures'

describe('comparador: cuántas manos, de cuántas', () => {
  it('las manos limpias traen la cuenta exacta del Lab para cada build, yendo 1º y 2º (el promedio no tiene una)', () => {
    const { clean } = compareBuilds({ name: 'A', cards: DECK_A }, { name: 'B', cards: DECK_B }, RULES)
    const labA = computeLabResults(DECK_A, buildActiveRuleSet(DECK_A, [], []), 5)

    if (labA.status !== 'ok' || !clean) throw new Error('Se esperaba un resultado')
    expect(clean.first.countsA).toEqual({ hands: labA.results.first.cleanHands, total: HANDS.a5 })
    // Yendo 2º el motor pondera las manos y trae decimales: acá la cantidad es entera.
    expect(clean.second.countsA).toEqual({ hands: Math.round(labA.results.second.cleanHands!), total: HANDS.a6 })
    expect(clean.second.countsA!.hands).toBeGreaterThan(0)
    // Con handtraps, el motor trae decimales yendo 2º: la cuenta que se muestra tiene que ser entera.
    expect(Number.isInteger(labA.results.second.cleanHands)).toBe(false)
    expect(Number.isInteger(clean.second.countsB!.hands)).toBe(true)
    // Con más cartas, B tiene más manos posibles: no se comparan cantidades sueltas sino cada una sobre su total.
    expect(clean.first.countsB?.total).toBe(HANDS.b5)
    expect(clean.second.countsB?.total).toBe(HANDS.b6)
    expect(clean.average.countsA).toBeNull()
    expect(clean.average.countsB).toBeNull()
    // La cuenta y el porcentaje cuentan lo mismo.
    expect(clean.first.countsA!.hands / clean.first.countsA!.total).toBeCloseTo(clean.first.a, 10)
  })

  it('cada regla trae, por turno, su probabilidad y en cuántas manos pasa; una que ese turno no mira no tiene valor, y una que la build no evalúa vale 0', () => {
    const onlyFirst = createMatcherPattern('Starter 1º', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }], { turnContext: 'first' })
    const withCard = createMatcherPattern('Con s3', 'opening', [{ matcher: { type: 'card', value: 's3' }, quantity: 1, kind: 'include' }])
    const { rules } = compareBuilds({ name: 'A', cards: DECK_A }, { name: 'B', cards: DECK_B }, { ...RULES, patterns: [onlyFirst, withCard] })

    const first = rules.find((row) => row.name === 'Starter 1º')!
    expect(first.turns.first.a).toMatchObject({ counts: { total: HANDS.a5 } })
    expect(first.turns.first.a!.counts.hands / HANDS.a5).toBeCloseTo(first.turns.first.a!.probability, 10)
    expect(first.turns.second.a).toBeNull()
    expect(first.turns.second.b).toBeNull()

    // A no tiene la carta: ahí la regla se cumple en 0 de todas sus manos.
    const missing = rules.find((row) => row.name === 'Con s3')!
    expect(missing.turns.first.a).toEqual({ probability: 0, counts: { hands: 0, total: HANDS.a5 } })
    expect(missing.turns.second.b!.counts.total).toBe(HANDS.b6)
    expect(missing.turns.second.b!.counts.hands).toBeGreaterThan(0)
  })
})
