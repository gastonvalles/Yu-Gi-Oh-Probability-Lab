// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { compareBuilds, type BuildComparison } from '../app/build-comparison'
import { createMatcherPattern } from '../app/pattern-factory'
import { BuildNotes, VerdictLine } from '../components/comparison/ComparisonSummary'
import { CompareStage } from '../components/comparison/CompareStage'
import { DeckResults } from '../components/comparison/DeckResults'
import type { Side } from '../components/comparison/comparison-rows'
import { applyLocale } from '../i18n'
import type { HandPattern } from '../types'
import { DECK_A, DECK_B, HANDS, RULES, card, filler } from './support/comparison-fixtures'

// Mismo tamaño y mismos roles que A salvo un starter: casi todo igual, así que el filtro de "sólo diferencias" tiene algo que esconder.
const CLOSE_B = [card('s1', 3, ['starter']), card('s2', 3, ['starter']), card('s9', 1, ['starter']), card('b1', 3, ['brick']), card('h1', 3, ['handtrap']), ...filler(27)]
const compare = (patterns: HandPattern[] = [], cardsB = DECK_B) => compareBuilds({ name: 'Alpha deck', cards: DECK_A }, { name: 'Beta deck', cards: cardsB }, { ...RULES, patterns })
const en = (value: number) => value.toLocaleString('en-US')

let desktop = true

beforeEach(() => {
  applyLocale('en')
  desktop = true
  window.matchMedia = ((query: string) => ({ matches: desktop, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  applyLocale('es')
})

/** Un mazo con el filtro de "sólo diferencias" propio (en la pantalla es de los dos: acá se prueba cada panel solo). */
function Panel({ comparison, side, initial = true }: { comparison: BuildComparison; side: Side; initial?: boolean }) {
  const [onlyDiffs, setOnlyDiffs] = useState(initial)

  return (
    <div data-testid={side}>
      <DeckResults side={side} comparison={comparison} onlyDiffs={onlyDiffs} onOnlyDiffsChange={setOnlyDiffs} />
    </div>
  )
}

const renderPanels = (comparison: BuildComparison, initial = true) =>
  render(
    <>
      <Panel comparison={comparison} side="A" initial={initial} />
      <Panel comparison={comparison} side="B" initial={initial} />
    </>,
  )
const panel = (side: Side) => within(screen.getByTestId(side))
const tableOf = (side: Side) => panel(side).getByRole('table', { name: `Share of hands that meet each condition, in build ${side}` })
const rowsOf = (side: Side) => within(tableOf(side)).getAllByRole('row').filter((row) => row.querySelector('th[scope="row"]'))
const labelOf = (row: Element) => row.querySelector('th[scope="row"] span.text-foreground')?.textContent
const valueOf = (row: Element) => Number(row.querySelector('td')!.textContent!.replace('Better', '').trim())
const marked = (row: Element) => row.querySelector('td')!.textContent!.includes('Better')
const rowNamed = (side: Side, name: string) => rowsOf(side).find((row) => labelOf(row) === name)!

describe('resultados de un mazo: los suyos, solos', () => {
  it('dice cuántas manos buenas da "de cada 100", y sólo el mazo mejor lleva ✓', () => {
    const comparison = compare()
    renderPanels(comparison)
    const best: Side = comparison.verdict.kind === 'a' ? 'A' : 'B'
    const number = (side: Side) => Math.round(comparison.clean!.average[side === 'A' ? 'a' : 'b'] * 100)

    for (const side of ['A', 'B'] as const) {
      const big = panel(side).getByText(String(number(side)))

      expect(big.parentElement!.textContent).toContain('out of every 100 hands are good')
      expect(big.parentElement!.textContent?.includes('Better'), side).toBe(side === best)
    }
  })

  it('las cantidades exactas de manos buenas van plegadas y son sólo de ese mazo, por turno', () => {
    const comparison = compare()
    renderPanels(comparison)
    const { first, second } = comparison.clean!

    for (const [side, key, totals] of [['A', 'countsA', [HANDS.a5, HANDS.a6]], ['B', 'countsB', [HANDS.b5, HANDS.b6]]] as const) {
      const fold = panel(side).getByText('See how many hands').closest('details')!

      expect(fold.open).toBe(false)
      expect([...fold.querySelectorAll('li')].map((line) => line.textContent)).toEqual([
        `Going first:${en(first[key]!.hands)} of ${en(totals[0])} hands`,
        `Going second:${en(second[key]!.hands)} of ${en(totals[1])} hands`,
      ])
    }
  })

  it('es una tabla de verdad, con su título, una columna del mazo y los grupos "arrancan bien" y "se traban"', () => {
    renderPanels(compare())

    for (const side of ['A', 'B'] as const) {
      const table = within(tableOf(side))

      expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['out of every 100 hands…', side])
      expect(table.getAllByRole('rowheader').length).toBeGreaterThan(3)
      expect(within(table.getByText('Get stuck (less is better)').closest('tbody')!).getByText('Have Bricks')).toBeInTheDocument()
      expect(within(table.getByText('Get going well (more is better)').closest('tbody')!).queryByText('Have Bricks')).toBeNull()
    }
  })

  it('los dos mazos muestran las mismas filas en el mismo orden (para leerlas de lado a lado) y el ✓ va al mejor: el mayor en lo que se quiere tener, el menor en lo que traba, y a nadie bajo medio punto', () => {
    renderPanels(compare(), false)
    const a = rowsOf('A')
    const b = rowsOf('B')

    expect(a.map(labelOf)).toEqual(b.map(labelOf))
    expect(a.length).toBeGreaterThan(3)

    for (const [index, rowA] of a.entries()) {
      const rowB = b[index]!
      const higherIsBetter = !rowA.closest('tbody')!.textContent!.includes('Get stuck')
      const [va, vb] = [valueOf(rowA), valueOf(rowB)]
      const expected = Math.abs(vb - va) < 0.5 - 1e-9 ? null : vb > va === higherIsBetter ? 'B' : 'A'

      expect([marked(rowA), marked(rowB)], `${labelOf(rowA)}: ${va} / ${vb}`).toEqual([expected === 'A', expected === 'B'])
    }

    // El caso que más se confunde: B tiene menos bricks (0 de 3) y es el mejor.
    expect([marked(rowNamed('A', 'Have Bricks')), marked(rowNamed('B', 'Have Bricks'))]).toEqual([false, true])
  })

  it('los números son "de cada 100" sin signo %', () => {
    renderPanels(compare(), false)

    for (const row of [...rowsOf('A'), ...rowsOf('B')]) {
      expect(row.querySelector('td')!.textContent!.replace('Better', '').trim()).toMatch(/^\d+\.\d$/)
    }
  })

  it('arranca mostrando sólo lo que difiere, con el conteo; apagar el filtro muestra todas las filas', () => {
    render(<Panel comparison={compare([], CLOSE_B)} side="A" />)
    const filter = panel('A').getByRole('switch', { name: 'Show only differences' })
    const counter = () => /^Only differences \((\d+) of (\d+)\)$/.exec(panel('A').getByText(/^Only differences/).textContent!)!.slice(1).map(Number) as [number, number]
    const [shown, total] = counter()

    expect(filter).toHaveAttribute('aria-checked', 'true')
    expect(shown).toBeGreaterThan(0)
    expect(total).toBeGreaterThan(shown)
    expect(rowsOf('A')).toHaveLength(shown)

    fireEvent.click(filter)
    expect(filter).toHaveAttribute('aria-checked', 'false')
    expect(rowsOf('A')).toHaveLength(total)
  })

  it('en cada grupo, las filas van de la mayor diferencia a la menor', () => {
    renderPanels(compare(), false)

    for (const group of ['Get going well (more is better)', 'Get stuck (less is better)']) {
      const a = [...within(panel('A').getByText(group).closest('tbody')!).getAllByRole('row')].filter((row) => row.querySelector('th[scope="row"]'))
      const b = [...within(panel('B').getByText(group).closest('tbody')!).getAllByRole('row')].filter((row) => row.querySelector('th[scope="row"]'))
      const gaps = a.map((row, index) => Math.abs(valueOf(row) - valueOf(b[index]!)))

      expect(gaps).toEqual([...gaps].sort((left, right) => right - left))
      // Dos filas del mismo grupo con los mismos dos valores serían lo mismo dicho dos veces (un rol que repite una regla).
      const pairs = a.map((row, index) => `${valueOf(row)}|${valueOf(b[index]!)}`)
      expect(new Set(pairs).size).toBe(pairs.length)
    }
  })

  it('al tocar una fila se ven las cantidades exactas de ese mazo por turno; tocarla de nuevo las esconde', () => {
    renderPanels(compare())
    const row = rowNamed('B', 'Have Bricks')
    const button = within(row).getByRole('button')

    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')

    const detail = document.getElementById(button.getAttribute('aria-controls')!)!
    expect([...detail.querySelectorAll('li')].map((line) => line.textContent)).toEqual([
      expect.stringMatching(new RegExp(`^Going first:.* of ${en(HANDS.b5)} hands$`)),
      expect.stringMatching(new RegExp(`^Going second:.* of ${en(HANDS.b6)} hands$`)),
    ])

    fireEvent.click(button)
    expect(document.getElementById(detail.id)).toBeNull()
    // Y el otro mazo no se movió.
    expect(within(rowNamed('A', 'Have Bricks')).getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('una regla que vale para un solo turno lo dice y sólo trae las manos de ese turno', () => {
    const onlyFirst = createMatcherPattern('Solo mi 1º', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 2, kind: 'include' }], { turnContext: 'first' })
    renderPanels(compare([onlyFirst]))
    const row = rowNamed('A', 'Solo mi 1º')

    expect(row.textContent).toContain('First only')
    const button = within(row).getByRole('button')

    fireEvent.click(button)
    const detail = document.getElementById(button.getAttribute('aria-controls')!)!
    expect([...detail.querySelectorAll('li')].map((line) => line.textContent)).toEqual([expect.stringMatching(/^Going first:/)])
  })

  it('la regla que le falta una carta a un mazo se lo avisa a ese mazo y sólo a ese', () => {
    const withCard = createMatcherPattern('Con s3', 'opening', [{ matcher: { type: 'card', value: 's3' }, quantity: 1, kind: 'include' }])
    renderPanels(compare([withCard]), false)

    expect(rowNamed('A', 'Con s3').textContent).toContain('This build is missing a card from the rule.')
    expect(rowNamed('B', 'Con s3').textContent).not.toContain('missing a card')
  })

  it('si no cambia nada, lo dice y ofrece ver todas las filas', () => {
    const comparison = compareBuilds({ name: 'Alpha deck', cards: DECK_A }, { name: 'Beta deck', cards: DECK_A.map((entry) => ({ ...entry, id: `b-${entry.id}` })) }, RULES)
    render(<Panel comparison={comparison} side="A" />)

    expect(screen.getByText('Both builds perform the same')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show all rows' }))
    expect(rowsOf('A').length).toBeGreaterThan(0)
  })

  it('mientras se calcula, muestra una carga en vez de una tabla vacía', () => {
    const computing = compareBuilds({ name: 'Alpha deck', cards: DECK_A }, { name: 'Beta deck', cards: DECK_B }, RULES, { a: undefined, b: undefined })
    render(<Panel comparison={computing} side="A" />)

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('la respuesta y los avisos', () => {
  it('el veredicto lo dice en lenguaje natural', () => {
    const comparison = compare()
    render(<VerdictLine comparison={comparison} />)
    const { a, b } = comparison.clean!.average
    const best = comparison.verdict.kind === 'a' ? 'A' : 'B'
    const [bestValue, otherValue] = best === 'A' ? [a, b] : [b, a]

    expect(screen.getByText(`Out of every 100 hands, ${best} gives you ${Math.round(bestValue * 100)} good ones and ${best === 'A' ? 'B' : 'A'} ${Math.round(otherValue * 100)}.`)).toBeInTheDocument()
  })

  it('las cartas sin clasificar se avisan y mandan a las marcadas con ? de la lista, sin un botón para cambiar de pestaña', () => {
    const pending = [...DECK_B.slice(0, -1), { ...card('x', 1, []), origin: null }]
    const comparison = compare([], pending)
    render(<BuildNotes side="B" build={comparison.b} canClassifyHere />)

    expect(screen.getByText('Build B: 1 unclassified card')).toBeInTheDocument()
    expect(screen.getByText(/^Tap the cards marked with \?/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('las dos listas con un VS en el medio', () => {
  const empty = { main: [], extra: [], side: [] }
  const stage = (comparison: BuildComparison | null = compare()) =>
    render(
      <CompareStage
        a={{ name: 'Alpha deck', zones: empty, onCardClick: vi.fn() }}
        b={{ name: 'Beta deck', zones: empty, onCardClick: vi.fn() }}
        comparison={comparison}
        deltaByCardId={new Map()}
      />,
    )
  const vs = () => screen.getByRole('button', { name: 'See each deck’s results' })
  const drawers = () => [...document.querySelectorAll('aside[aria-labelledby]')] as HTMLElement[]

  it('en escritorio se ven las dos listas con el VS en el medio, y los resultados no se ven hasta tocarlo', () => {
    stage()
    const [listA, listB] = ['Build A: Alpha deck', 'Build B: Beta deck'].map((name) => screen.getByRole('region', { name }))

    expect(vs()).toHaveTextContent('VS')
    expect(vs()).toHaveAttribute('aria-expanded', 'false')
    // El orden: lista A, VS, lista B.
    expect(listA!.compareDocumentPosition(vs()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(vs().compareDocumentPosition(listB!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Los dos cajones existen pero cerrados: fuera de pantalla y fuera del foco.
    expect(drawers()).toHaveLength(2)
    for (const drawer of drawers()) {
      expect(drawer).toHaveAttribute('inert')
      expect(drawer).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('el VS abre dos cajones, uno desde cada borde, con los resultados separados por mazo; tocarlo de nuevo, Escape o la X los cierran', () => {
    const comparison = compare()
    stage(comparison)
    const [left, right] = drawers() as [HTMLElement, HTMLElement]

    fireEvent.click(vs())
    expect(vs()).toHaveAttribute('aria-expanded', 'true')
    expect(left).not.toHaveAttribute('inert')
    expect(right).not.toHaveAttribute('inert')
    expect(left.className).toContain('left-0')
    expect(right.className).toContain('right-0')
    expect(left.className).toContain('translate-x-0')
    expect(right.className).toContain('translate-x-0')
    // El de la izquierda es del mazo A y el de la derecha del B, cada uno con lo suyo.
    expect(within(left).getByRole('heading', { name: 'Alpha deck' })).toBeInTheDocument()
    expect(within(right).getByRole('heading', { name: 'Beta deck' })).toBeInTheDocument()
    expect(within(left).getByRole('table', { name: /in build A$/ })).toBeInTheDocument()
    expect(within(right).getByRole('table', { name: /in build B$/ })).toBeInTheDocument()
    expect(within(left).queryByRole('table', { name: /in build B$/ })).toBeNull()

    fireEvent.click(vs())
    expect(vs()).toHaveAttribute('aria-expanded', 'false')
    expect(left.className).toContain('-translate-x-full')
    expect(right.className).toContain('translate-x-full')
    expect(left).toHaveAttribute('inert')

    fireEvent.click(vs())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(vs()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(vs())
    fireEvent.click(within(right).getByRole('button', { name: 'Close' }))
    expect(vs()).toHaveAttribute('aria-expanded', 'false')
  })

  it('el filtro de "sólo diferencias" es de los dos mazos: al moverlo en uno se mueve en el otro y las filas siguen alineadas', () => {
    stage(compare([], CLOSE_B))
    const [left, right] = drawers() as [HTMLElement, HTMLElement]
    fireEvent.click(vs())

    const rows = (drawer: HTMLElement) => within(drawer).getAllByRole('row').filter((row) => row.querySelector('th[scope="row"]'))
    const before = rows(left).length

    expect(rows(right)).toHaveLength(before)
    fireEvent.click(within(left).getByRole('switch', { name: 'Show only differences' }))
    expect(within(right).getByRole('switch', { name: 'Show only differences' })).toHaveAttribute('aria-checked', 'false')
    expect(rows(left).length).toBeGreaterThan(before)
    expect(rows(right)).toHaveLength(rows(left).length)
  })

  it('mientras no hay resultados, el VS abre igual y no hay tabla', () => {
    stage(null)
    fireEvent.click(vs())

    expect(drawers()).toHaveLength(2)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('en el celular no hay cajones: el VS abre una hoja con los dos mazos uno debajo del otro', () => {
    desktop = false
    stage()

    expect(drawers()).toHaveLength(0)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(vs())
    const dialog = within(screen.getByRole('dialog'))
    const tables = dialog.getAllByRole('table')

    expect(dialog.getByText('Results by deck')).toBeInTheDocument()
    expect(tables).toHaveLength(2)
    // A arriba, B abajo.
    expect(tables[0]!.compareDocumentPosition(tables[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(dialog.getByRole('region', { name: 'Build A: Alpha deck' })).toContainElement(tables[0]!)
    expect(dialog.getByRole('region', { name: 'Build B: Beta deck' })).toContainElement(tables[1]!)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
