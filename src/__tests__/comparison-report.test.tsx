// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { compareBuilds } from '../app/build-comparison'
import { createMatcherPattern } from '../app/pattern-factory'
import { computeLabResults } from '../app/probability-lab'
import { buildActiveRuleSet } from '../app/pattern-presets'
import { ComparisonReport } from '../components/comparison/ComparisonReport'
import { applyLocale } from '../i18n'
import type { CardEntry, CardRole, HandPattern } from '../types'

function card(id: string, copies: number, roles: CardRole[]): CardEntry {
  return { id, name: `Card ${id}`, copies, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false }
}

const filler = (count: number) => Array.from({ length: count }, (_, index) => card(`f${index}`, 1, ['enabler']))
// A: 40 cartas con 6 starters, 3 bricks y 3 handtraps. B: 42 cartas, con un starter más y sin bricks: tiene más cartas, así que tiene más manos posibles.
// Las handtraps importan: sin ellas, yendo 2º no hay una sola mano limpia y las cuentas dan 0.
const DECK_A = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('b1', 3, ['brick']), card('h1', 3, ['handtrap']), ...filler(28)]
const DECK_B = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('s3', 3, ['starter']), card('h1', 3, ['handtrap']), ...filler(30)]
const RULES = { patterns: [], disabledGenericRuleIds: [], handSize: 5 }

// Combinaciones de 5 y 6 cartas de un deck de 40 y de 42.
const HANDS = { a5: 658_008, a6: 3_838_380, b5: 850_668, b6: 5_245_786 }

beforeEach(() => {
  applyLocale('en')
})

afterEach(() => {
  applyLocale('es')
})

function renderReport(patterns: HandPattern[] = []) {
  const comparison = compareBuilds({ name: 'A', cards: DECK_A }, { name: 'B', cards: DECK_B }, { ...RULES, patterns })
  return { comparison, ...render(<ComparisonReport comparison={comparison} isCurrentDeck={{ A: true, B: false }} onShowCards={() => {}} />) }
}

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

describe('comparador: el informe muestra las cantidades y la diferencia a simple vista', () => {
  it('debajo de cada anillo de yendo 1º y 2º dice cuántas manos son limpias de las posibles; el promedio no lleva cuenta', () => {
    const { comparison } = renderReport()
    const { clean } = comparison

    for (const total of [HANDS.a5, HANDS.a6, HANDS.b5, HANDS.b6]) {
      expect(screen.getByText(`of ${total.toLocaleString('en-US')}`)).toBeInTheDocument()
    }

    expect(screen.getByText(clean!.first.countsA!.hands.toLocaleString('en-US'))).toBeInTheDocument()
    expect(screen.getAllByText(/^of [\d,]+$/)).toHaveLength(4)
  })

  it('el detalle va por turno: elegido uno, cada rol y regla dice en cuántas manos pasa en cada build; el promedio no', () => {
    const { comparison } = renderReport()
    const detail = within(screen.getByText('Where each one wins').closest('details')!)

    // Por defecto, el promedio: sin cuentas por fila.
    expect(detail.queryByText(/ hands$/)).toBeNull()

    fireEvent.click(detail.getByRole('radio', { name: 'Going first' }))
    const starters = comparison.a.roles.first.find((role) => role.key === 'starter')!
    const expected = `${Math.round(starters.atLeastOne * HANDS.a5).toLocaleString('en-US')} of ${HANDS.a5.toLocaleString('en-US')} hands`

    // El rol Starter y la regla "Al menos 1 Starter" valen lo mismo: puede salir en más de una fila.
    expect(detail.getAllByText(expected).length).toBeGreaterThan(0)
    expect(detail.getAllByText(new RegExp(`of ${HANDS.b5.toLocaleString('en-US')} hands$`)).length).toBeGreaterThan(0)

    fireEvent.click(detail.getByRole('radio', { name: 'Going second' }))
    expect(detail.getAllByText(new RegExp(`of ${HANDS.b6.toLocaleString('en-US')} hands$`)).length).toBeGreaterThan(0)
    expect(detail.queryByText(new RegExp(`of ${HANDS.b5.toLocaleString('en-US')} hands$`))).toBeNull()

    fireEvent.click(detail.getByRole('radio', { name: 'Average' }))
    expect(detail.queryByText(/ hands$/)).toBeNull()
  })

  it('una regla que ese turno no mira desaparece del turno elegido', () => {
    const onlyFirst = createMatcherPattern('Solo mi 1º', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 2, kind: 'include' }], { turnContext: 'first' })
    renderReport([onlyFirst])
    const detail = within(screen.getByText('Where each one wins').closest('details')!)

    fireEvent.click(detail.getByRole('radio', { name: 'Going first' }))
    expect(detail.getByText('Solo mi 1º')).toBeInTheDocument()

    fireEvent.click(detail.getByRole('radio', { name: 'Going second' }))
    expect(detail.queryByText('Solo mi 1º')).toBeNull()
  })

  it('cada fila marca quién gana y por cuánto, y lo más distinto va primero', () => {
    renderReport()
    const detail = within(screen.getByText('Where each one wins').closest('details')!)
    const chips = detail.getAllByTitle(/^Better: [AB]$/)

    // El chip lleva la letra del que gana y la diferencia en puntos.
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) expect(chip.textContent).toMatch(/^[AB]\+\d+\.\d$/)

    // Las filas de cada grupo salen de mayor a menor diferencia.
    const gaps = (group: string) => {
      const list = detail.getByText(group).closest('div')!.parentElement!.querySelector('ul')!
      return [...list.querySelectorAll('li')].map((row) => Number((row.querySelector('[title^="Better"]')?.textContent ?? 'A+0').slice(2)))
    }

    for (const group of ['Roles', 'Rules']) {
      const values = gaps(group)
      expect(values).toEqual([...values].sort((left, right) => right - left))
    }
  })

  it('arriba del detalle cuenta en cuántas filas gana cada build y cuántas empatan', () => {
    renderReport()
    const detail = within(screen.getByText('Where each one wins').closest('details')!)

    expect(detail.getAllByText(/^wins in \d+$/)).toHaveLength(2)
    expect(detail.getByText(/^\d+ tied$/)).toBeInTheDocument()
  })
})
