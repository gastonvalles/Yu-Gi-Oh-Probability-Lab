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

describe('comparador: el informe responde primero y deja el detalle para quien lo pide', () => {
  const bars = () => screen.getAllByRole('img', { name: /^Clean hands of build [AB]: \d+\.\d%$/ })
  const rows = () => [...document.querySelectorAll('li > details')]
  const nameOf = (row: Element) => row.querySelector('summary span.font-semibold')?.textContent
  /** Los puntos de diferencia de la barra de una fila ("B · 15.0 pp" → 15). */
  const gapOf = (row: Element) => Number(/(\d+\.\d) pp/.exec(row.querySelector('summary')!.textContent!)?.[1] ?? 0)
  const en = (value: number) => value.toLocaleString('en-US')
  const moreRows = () => screen.queryByText(/^See the other \d+$/)?.closest('details') ?? null

  it('la respuesta es una sola: una barra de manos limpias por build, en promedio de los dos turnos, sin selector de turno', () => {
    const { comparison } = renderReport()

    expect(bars()).toHaveLength(2)
    expect(bars().map((bar) => bar.getAttribute('aria-label'))).toEqual([
      `Clean hands of build A: ${(comparison.clean!.average.a * 100).toFixed(1)}%`,
      `Clean hands of build B: ${(comparison.clean!.average.b * 100).toFixed(1)}%`,
    ])
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('las cantidades de manos van plegadas: cuántas son limpias de las posibles, por build y por turno', () => {
    const { comparison } = renderReport()
    const { first, second } = comparison.clean!
    const section = screen.getByText('See how many hands').closest('details')!

    // Plegado: no se ve hasta pedirlo.
    expect(section.open).toBe(false)
    fireEvent.click(section.querySelector('summary')!)
    expect(section.open).toBe(true)

    const lines = [...section.querySelectorAll('li')].map((line) => line.textContent)
    expect(lines).toEqual([
      `AGoing first${en(first.countsA!.hands)} of ${en(HANDS.a5)} hands`,
      `AGoing second${en(second.countsA!.hands)} of ${en(HANDS.a6)} hands`,
      `BGoing first${en(first.countsB!.hands)} of ${en(HANDS.b5)} hands`,
      `BGoing second${en(second.countsB!.hands)} of ${en(HANDS.b6)} hands`,
    ])
  })

  it('de entrada se ven las diferencias mayores (como mucho cinco, de mayor a menor) y el resto queda a un toque', () => {
    renderReport()
    const shown = rows().filter((row) => !moreRows()?.contains(row))
    const folded = rows().filter((row) => moreRows()?.contains(row))
    const all = [...shown, ...folded]

    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThanOrEqual(5)
    expect(all.length).toBeGreaterThan(5)
    expect(moreRows()).not.toBeNull()
    expect(screen.getByText(`See the other ${folded.length}`)).toBeInTheDocument()

    // Todas juntas, de la mayor diferencia a la menor; lo que se ve de entrada es lo más distinto.
    const gaps = all.map(gapOf)
    expect(gaps).toEqual([...gaps].sort((left, right) => right - left))
    // Cada fila está plegada: los porcentajes y las manos se ven recién al tocarla.
    expect(all.every((row) => !(row as HTMLDetailsElement).open)).toBe(true)
    // Y dice de qué es: un rol, o una regla (salida o problema).
    expect(all.some((row) => row.textContent!.includes('Role'))).toBe(true)
    expect(all.some((row) => /Opening|Problem/.test(row.textContent!))).toBe(true)
  })

  it('cada barra dice a quién apunta (izquierda A, derecha B) y por cuántos puntos', () => {
    renderReport()

    for (const row of rows()) {
      expect(row.querySelector('summary')!.textContent).toMatch(/[AB] · \d+\.\d pp|=$/)
    }
  })

  it('al tocar una fila se ven los dos porcentajes y, por turno, en cuántas manos pasa en cada build', () => {
    const { comparison } = renderReport()
    const starters = rows().find((row) => nameOf(row) === 'Starters')!
    const role = (turn: 'first' | 'second') => comparison.a.roles[turn].find((entry) => entry.key === 'starter')!
    const detail = within(starters as HTMLElement)

    fireEvent.click(starters.querySelector('summary')!)
    expect((starters as HTMLDetailsElement).open).toBe(true)
    expect(detail.getAllByText(/^\d+\.\d%$/)).toHaveLength(2)
    expect(detail.getByText(`Going first: ${en(Math.round(role('first').atLeastOne * HANDS.a5))} of ${en(HANDS.a5)} hands`)).toBeInTheDocument()
    expect(detail.getByText(new RegExp(`^Going second: .* of ${en(HANDS.b6)} hands$`))).toBeInTheDocument()
  })

  it('una regla que vale para un solo turno sólo dice las manos de ese turno', () => {
    const onlyFirst = createMatcherPattern('Solo mi 1º', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 2, kind: 'include' }], { turnContext: 'first' })
    renderReport([onlyFirst])
    const row = rows().find((entry) => nameOf(entry) === 'Solo mi 1º')!

    expect(row.textContent).toContain('First only')
    expect(within(row as HTMLElement).queryAllByText(/^Going first: /).length).toBe(2)
    expect(within(row as HTMLElement).queryAllByText(/^Going second: /).length).toBe(0)
  })

  it('lo que no cambia ni medio punto no se muestra de entrada, y sigue ahí para quien lo busque', () => {
    // Mismo tamaño y mismos roles salvo un starter: Bricks, Interacción y Extenders no se mueven.
    const close = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('s9', 1, ['starter']), card('b1', 3, ['brick']), card('h1', 3, ['handtrap']), ...filler(27)]
    const comparison = compareBuilds({ name: 'A', cards: DECK_A }, { name: 'B', cards: close }, RULES)
    render(<ComparisonReport comparison={comparison} isCurrentDeck={{ A: true, B: false }} onShowCards={() => {}} />)

    const folded = moreRows()!
    const hidden = [...folded.querySelectorAll('li > details')].map(nameOf)
    const shown = rows().filter((row) => !folded.contains(row)).map(nameOf)

    expect(hidden).toContain('Bricks')
    expect(shown).not.toContain('Bricks')
    expect(shown).toContain('Starters')
    // Los que están plegados no suman diferencias de relieve: ninguna de las de arriba es menor que ellas.
    const lowest = Math.min(...rows().filter((row) => !folded.contains(row)).map(gapOf))
    expect(Math.max(...[...folded.querySelectorAll('li > details')].map(gapOf))).toBeLessThanOrEqual(lowest)
  })

  it('si no cambia nada, lo dice en vez de dejar una lista de barras vacías', () => {
    const comparison = compareBuilds({ name: 'A', cards: DECK_A }, { name: 'B', cards: DECK_A.map((entry) => ({ ...entry, id: `b-${entry.id}` })) }, RULES)
    render(<ComparisonReport comparison={comparison} isCurrentDeck={{ A: true, B: false }} onShowCards={() => {}} />)

    expect(screen.getByText('No role or rule changes by more than 0.5 pp.')).toBeInTheDocument()
    expect(rows().length).toBeGreaterThan(0)
    expect(rows().every((row) => moreRows()!.contains(row))).toBe(true)
  })
})
