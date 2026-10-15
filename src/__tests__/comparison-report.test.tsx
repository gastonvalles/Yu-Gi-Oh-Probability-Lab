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

describe('comparador: una respuesta en lenguaje natural y una tabla que se lee en segundos', () => {
  const en = (value: number) => value.toLocaleString('en-US')
  const diffTable = () => screen.getByRole('table', { name: /Share of hands/ })
  const dataRows = () => within(diffTable()).getAllByRole('row').filter((row) => row.querySelector('th[scope="row"]'))
  const labelOf = (row: Element) => row.querySelector('th[scope="row"] span.text-foreground')?.textContent
  const rowNamed = (name: string) => dataRows().find((row) => labelOf(row) === name)!
  /** Los dos valores de una fila (sin el "Better" que sólo lee el lector de pantalla). */
  const valuesOf = (row: Element) => [...row.querySelectorAll('td')].map((cell) => cell.textContent!.replace('Better', '').trim())
  const gapOf = (row: Element) => Math.abs(Number(valuesOf(row)[1]) - Number(valuesOf(row)[0]))
  const bestCell = (row: Element) => [...row.querySelectorAll('td')].findIndex((cell) => cell.textContent!.includes('Better'))

  it('arriba, el veredicto dice cuántas manos buenas da cada build "de cada 100" y marca la mejor', () => {
    const { comparison } = renderReport()
    const { a, b } = comparison.clean!.average
    const best = comparison.verdict.kind === 'a' ? 'A' : 'B'
    const [bestValue, otherValue] = best === 'A' ? [a, b] : [b, a]

    expect(screen.getByText(`Out of every 100 hands, ${best} gives you ${Math.round(bestValue * 100)} good ones and ${best === 'A' ? 'B' : 'A'} ${Math.round(otherValue * 100)}.`)).toBeInTheDocument()
    expect(screen.getByText(String(Math.round(a * 100)))).toBeInTheDocument()
    expect(screen.getByText(String(Math.round(b * 100)))).toBeInTheDocument()
    expect(screen.getAllByText('out of 100')).toHaveLength(2)
    // "Better" aparece una sola vez a la vista (el del otro lado va oculto, sólo para mantener la alineación).
    const verdictCard = screen.getByText(/^Out of every 100 hands, [AB] gives you/).closest('section')!
    expect(within(verdictCard).getAllByText('Better').filter((mark) => !mark.closest('[aria-hidden="true"]'))).toHaveLength(1)
    expect(screen.getByText(/^A good hand has a way to get started/)).toBeInTheDocument()
  })

  it('las cantidades exactas de manos buenas van plegadas, por build y por turno', () => {
    const { comparison } = renderReport()
    const { first, second } = comparison.clean!
    const section = screen.getByText('See how many hands').closest('details')!

    expect(section.open).toBe(false)
    fireEvent.click(section.querySelector('summary')!)
    expect([...section.querySelectorAll('li')].map((line) => line.textContent)).toEqual([
      `AGoing first${en(first.countsA!.hands)} of ${en(HANDS.a5)} hands`,
      `AGoing second${en(second.countsA!.hands)} of ${en(HANDS.a6)} hands`,
      `BGoing first${en(first.countsB!.hands)} of ${en(HANDS.b5)} hands`,
      `BGoing second${en(second.countsB!.hands)} of ${en(HANDS.b6)} hands`,
    ])
  })

  it('es una tabla de verdad: con título, columnas A y B, filas con su encabezado y los grupos "arrancan bien" y "se traban"', () => {
    renderReport()
    const table = within(diffTable())

    expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['out of every 100 hands…', 'A', 'B'])
    expect(table.getAllByRole('rowheader').length).toBeGreaterThan(3)
    expect(table.getByText('Get going well (more is better)')).toBeInTheDocument()
    expect(table.getByText('Get stuck (less is better)')).toBeInTheDocument()
    // Los bricks traban: van al grupo de lo que se traba, y no con lo que arranca bien.
    const stuck = table.getByText('Get stuck (less is better)').closest('tbody')!
    expect(within(stuck).getByText('Have Bricks')).toBeInTheDocument()
    expect(within(table.getByText('Get going well (more is better)').closest('tbody')!).queryByText('Have Bricks')).toBeNull()
  })

  it('los números son "de cada 100" sin signo %, y el ✓ va al mejor: el mayor en lo que se quiere tener, el menor en lo que traba, y a nadie si no hay ni medio punto', () => {
    renderReport()
    fireEvent.click(screen.getByRole('switch', { name: 'Show only differences' }))
    const table = within(diffTable())
    const rowsOf = (group: string) => within(table.getByText(group).closest('tbody')!).getAllByRole('row').filter((row) => row.querySelector('th[scope="row"]'))

    for (const row of dataRows()) {
      expect(valuesOf(row).every((value) => /^\d+\.\d$/.test(value))).toBe(true)
    }

    for (const [group, higherIsBetter] of [['Get going well (more is better)', true], ['Get stuck (less is better)', false]] as const) {
      for (const row of rowsOf(group)) {
        const [a, b] = valuesOf(row).map(Number) as [number, number]

        expect(bestCell(row), `${labelOf(row)}: ${a} / ${b}`).toBe(Math.abs(b - a) < 0.5 - 1e-9 ? -1 : b > a === higherIsBetter ? 1 : 0)
      }
    }

    // El caso que más se confunde: B tiene menos bricks (0 de 3) y es el mejor.
    const bricks = rowNamed('Have Bricks')
    expect(Number(valuesOf(bricks)[1])).toBeLessThan(Number(valuesOf(bricks)[0]))
    expect(bestCell(bricks)).toBe(1)
  })

  it('arranca mostrando sólo lo que difiere, con el conteo; apagar el filtro muestra todas las filas', () => {
    // Mismo tamaño y mismos roles salvo un starter: lo demás no se mueve.
    const close = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('s9', 1, ['starter']), card('b1', 3, ['brick']), card('h1', 3, ['handtrap']), ...filler(27)]
    const comparison = compareBuilds({ name: 'A', cards: DECK_A }, { name: 'B', cards: close }, RULES)
    render(<ComparisonReport comparison={comparison} isCurrentDeck={{ A: true, B: false }} onShowCards={() => {}} />)
    const filter = screen.getByRole('switch', { name: 'Show only differences' })
    const label = () => /^Only differences \((\d+) of (\d+)\)$/.exec(screen.getByText(/^Only differences/).textContent!)!

    expect(filter).toHaveAttribute('aria-checked', 'true')
    const [, shown, total] = label().map(Number)
    expect(shown).toBeGreaterThan(0)
    expect(total).toBeGreaterThan(shown!)
    expect(dataRows()).toHaveLength(shown!)
    expect(dataRows().every((row) => bestCell(row) >= 0)).toBe(true)

    fireEvent.click(filter)
    expect(filter).toHaveAttribute('aria-checked', 'false')
    expect(dataRows()).toHaveLength(total!)
    expect(dataRows().some((row) => bestCell(row) === -1)).toBe(true)
  })

  it('en cada grupo, las filas van de la mayor diferencia a la menor, y un rol que repite una regla no sale dos veces', () => {
    renderReport()
    const table = within(diffTable())

    for (const group of ['Get going well (more is better)', 'Get stuck (less is better)']) {
      const rows = within(table.getByText(group).closest('tbody')!).getAllByRole('row').filter((row) => row.querySelector('th[scope="row"]'))
      const gaps = rows.map(gapOf)

      expect(gaps).toEqual([...gaps].sort((left, right) => right - left))
      // Dos filas del mismo grupo con exactamente los mismos dos valores serían la misma cosa dicha dos veces.
      const pairs = rows.map((row) => valuesOf(row).join('|'))
      expect(new Set(pairs).size).toBe(pairs.length)
    }
  })

  it('al tocar una fila se ven las cantidades exactas por turno en cada build; tocarla de nuevo las esconde', () => {
    const { comparison } = renderReport()
    const row = rowNamed('Have Bricks')
    const button = within(row).getByRole('button')
    const bricks = (turn: 'first' | 'second') => comparison.a.roles[turn].find((entry) => entry.key === 'brick')!

    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/^Going first:/)).toBeNull()

    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const detail = document.getElementById(button.getAttribute('aria-controls')!)!
    expect([...detail.querySelectorAll('li')].map((line) => line.textContent)).toEqual([
      `AGoing first:${en(Math.round(bricks('first').atLeastOne * HANDS.a5))} of ${en(HANDS.a5)} hands`,
      expect.stringMatching(new RegExp(`^AGoing second:.* of ${en(HANDS.a6)} hands$`)),
      expect.stringMatching(new RegExp(`^BGoing first:.* of ${en(HANDS.b5)} hands$`)),
      expect.stringMatching(new RegExp(`^BGoing second:.* of ${en(HANDS.b6)} hands$`)),
    ])

    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(detail.id)).toBeNull()
  })

  it('una regla que vale para un solo turno lo dice y sólo trae las manos de ese turno', () => {
    const onlyFirst = createMatcherPattern('Solo mi 1º', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 2, kind: 'include' }], { turnContext: 'first' })
    renderReport([onlyFirst])
    const row = rowNamed('Solo mi 1º')

    expect(row.textContent).toContain('First only')
    fireEvent.click(within(row).getByRole('button'))
    expect(screen.getAllByText(/^Going first:$/)).toHaveLength(2)
    expect(screen.queryByText(/^Going second:$/)).toBeNull()
  })

  it('si no cambia nada, lo dice y ofrece ver todas las filas', () => {
    const comparison = compareBuilds({ name: 'A', cards: DECK_A }, { name: 'B', cards: DECK_A.map((entry) => ({ ...entry, id: `b-${entry.id}` })) }, RULES)
    render(<ComparisonReport comparison={comparison} isCurrentDeck={{ A: true, B: false }} onShowCards={() => {}} />)

    expect(screen.getByText('Both builds perform the same')).toBeInTheDocument()
    expect(screen.getByText('No row changes by more than 0.5 points.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Share of hands/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show all rows' }))
    expect(dataRows().length).toBeGreaterThan(0)
    expect(screen.queryByText('Both builds perform the same')).toBeNull()
  })

  it('mientras se calcula, muestra una carga en vez de una tabla vacía', () => {
    const computing = compareBuilds({ name: 'A', cards: DECK_A }, { name: 'B', cards: DECK_B }, RULES, { a: undefined, b: undefined })
    render(<ComparisonReport comparison={computing} isCurrentDeck={{ A: true, B: false }} onShowCards={() => {}} />)

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('table', { name: /Share of hands/ })).toBeNull()
  })

  it('las cartas que cambiaron van en una tabla con las copias de cada build', () => {
    renderReport()
    const table = within(screen.getByRole('table', { name: 'Which cards changed' }))

    expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Card', 'A', 'B'])
    const added = table.getByRole('rowheader', { name: 'Card s3' }).closest('tr')!
    expect([...added.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual(['0', '3'])
    const removed = table.getByRole('rowheader', { name: 'Card b1' }).closest('tr')!
    expect([...removed.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual(['3', '0'])
  })
})
