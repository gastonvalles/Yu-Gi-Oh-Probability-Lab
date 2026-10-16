// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { compareBuilds, type BuildComparison } from '../app/build-comparison'
import { getDerivedCardId } from '../app/calculator-state'
import type { DeckCardInstance } from '../app/model'
import { createMatcherPattern } from '../app/pattern-factory'
import { BuildNotes, VerdictLine } from '../components/comparison/ComparisonSummary'
import { CompareStage } from '../components/comparison/CompareStage'
import { DeckResults } from '../components/comparison/DeckResults'
import type { Side } from '../components/comparison/comparison-rows'
import { applyLocale } from '../i18n'
import type { HandPattern } from '../types'
import { DECK_A, DECK_B, HANDS, RULES, card, filler } from './support/comparison-fixtures'

// Mismo tamaño y mismos roles que A salvo un starter: casi todo igual, así que hay filas que no cambian (y no tienen que verse).
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

const renderPanels = (comparison: BuildComparison) =>
  render(
    <>
      {(['A', 'B'] as const).map((side) => (
        <div key={side} data-testid={side}>
          <DeckResults side={side} comparison={comparison} />
        </div>
      ))}
    </>,
  )
const panel = (side: Side) => within(screen.getByTestId(side))
// Cada tarjeta de resultado trae su anillo (role meter): su nombre es la etiqueta de la fila y su texto, el número "de cada 100".
const heroOf = (side: Side) => panel(side).getByRole('meter', { name: 'out of every 100 hands are good' })
const START = 'Get going well (more is better)'
const STUCK = 'Get stuck (less is better)'
const cardsOf = (side: Side, group?: string) =>
  [...screen.getByTestId(side).querySelectorAll('section[aria-label] li')].filter((item) => !group || item.closest('section')!.getAttribute('aria-label') === group)
const labelOf = (item: Element) => item.querySelector('[role="meter"]')!.getAttribute('aria-label')
const valueOf = (item: Element) => Number(item.querySelector('[role="meter"]')!.textContent)
const marked = (item: Element) => item.textContent!.includes('Better')
const cardNamed = (side: Side, name: string) => cardsOf(side).find((item) => labelOf(item) === name)!

describe('resultados de un mazo: los suyos, solos, con todo a la vista', () => {
  it('el anillo grande dice cuántas manos buenas da "de cada 100", y sólo el mazo mejor lleva ✓', () => {
    const comparison = compare()
    renderPanels(comparison)
    const best: Side = comparison.verdict.kind === 'a' ? 'A' : 'B'
    const number = (side: Side) => Math.round(comparison.clean!.average[side === 'A' ? 'a' : 'b'] * 100)

    for (const side of ['A', 'B'] as const) {
      const hero = heroOf(side)

      expect(hero).toHaveAttribute('aria-valuenow', String(number(side)))
      expect(hero.parentElement!.textContent?.includes('Better'), side).toBe(side === best)
    }
  })

  it('al lado del anillo va cuánto más o menos da que el otro mazo (▲/▼ con los puntos, en verde si conviene)', () => {
    const comparison = compare()
    renderPanels(comparison)
    const { a, b } = comparison.clean!.average
    const points = (Math.abs(Math.round(b * 1000) - Math.round(a * 1000)) / 10).toFixed(1)
    const best: Side = b > a ? 'B' : 'A'
    const worst: Side = best === 'A' ? 'B' : 'A'
    const heroBox = (side: Side) => heroOf(side).parentElement!

    expect(heroBox(best).textContent).toContain(`▲ ${points}`)
    expect(heroBox(best).textContent).toContain(`${points} points more than build ${worst}`)
    expect(heroBox(worst).textContent).toContain(`▼ ${points}`)
    expect(heroBox(worst).textContent).toContain(`${points} points less than build ${best}`)
    expect(heroBox(best).innerHTML).toContain('text-success-soft')
    expect(heroBox(worst).innerHTML).toContain('text-danger-soft')
  })

  it('las cantidades exactas de manos buenas están a la vista (sin desplegar nada) y son sólo de ese mazo, por turno', () => {
    const comparison = compare()
    renderPanels(comparison)
    const { first, second } = comparison.clean!

    for (const [side, key, totals] of [['A', 'countsA', [HANDS.a5, HANDS.a6]], ['B', 'countsB', [HANDS.b5, HANDS.b6]]] as const) {
      const tiles = [...screen.getByTestId(side).querySelector('ul')!.querySelectorAll('li')]

      expect(tiles).toHaveLength(2)
      expect(tiles[0]!.textContent).toContain('Going first')
      expect(tiles[0]!.textContent).toContain(`${en(first[key]!.hands)} of ${en(totals[0])} hands`)
      expect(tiles[1]!.textContent).toContain('Going second')
      expect(tiles[1]!.textContent).toContain(`${en(second[key]!.hands)} of ${en(totals[1])} hands`)
      expect(within(tiles[0] as HTMLElement).getByRole('meter')).toBeInTheDocument()
    }

    expect(document.querySelector('details')).toBeNull()
  })

  it('las filas que cambian son tarjetas, con su título y los grupos "arrancan bien" y "se traban"', () => {
    renderPanels(compare())

    for (const side of ['A', 'B'] as const) {
      expect(panel(side).getByText('out of every 100 hands…')).toBeInTheDocument()
      expect(cardsOf(side).length).toBeGreaterThan(3)
      expect(cardsOf(side, STUCK).map(labelOf)).toContain('Have Bricks')
      expect(cardsOf(side, START).map(labelOf)).not.toContain('Have Bricks')
    }
  })

  it('cada tarjeta trae las cantidades exactas de ese mazo por turno, a la vista, y no hay nada que desplegar', () => {
    renderPanels(compare())

    for (const [side, totals] of [['A', [HANDS.a5, HANDS.a6]], ['B', [HANDS.b5, HANDS.b6]]] as const) {
      const item = cardNamed(side, 'Have Bricks')

      expect(item.textContent).toMatch(new RegExp(`Going first: .* of ${en(totals[0])} handsGoing second: .* of ${en(totals[1])} hands`))
      expect(within(item as HTMLElement).queryByRole('button')).toBeNull()
    }
  })

  it('los dos mazos muestran las mismas tarjetas en el mismo orden (para leerlas de lado a lado), y el ✓ va al mejor: el mayor en lo que se quiere tener y el menor en lo que traba', () => {
    renderPanels(compare())
    const a = cardsOf('A')
    const b = cardsOf('B')

    expect(a.map(labelOf)).toEqual(b.map(labelOf))
    expect(a.length).toBeGreaterThan(3)

    for (const [index, cardA] of a.entries()) {
      const cardB = b[index]!
      const higherIsBetter = cardA.closest('section')!.getAttribute('aria-label') === START
      const [va, vb] = [valueOf(cardA), valueOf(cardB)]

      // Sólo hay tarjetas que difieren, así que en cada una gana alguien (y sólo uno).
      expect([marked(cardA), marked(cardB)], `${labelOf(cardA)}: ${va} / ${vb}`).toEqual(vb > va === higherIsBetter ? [false, true] : [true, false])
    }

    // El caso que más se confunde: B tiene menos bricks (0 de 3) y es el mejor.
    expect([marked(cardNamed('A', 'Have Bricks')), marked(cardNamed('B', 'Have Bricks'))]).toEqual([false, true])
  })

  it('los números son "de cada 100" sin signo %', () => {
    renderPanels(compare())

    for (const item of [...cardsOf('A'), ...cardsOf('B')]) {
      expect(item.querySelector('[role="meter"]')!.textContent).toMatch(/^\d+\.\d$/)
    }
  })

  it('cada tarjeta dice cuánto se aparta del otro mazo: ▲/▼ con los puntos, y verde o rojo según convenga (en lo que traba, menos es mejor)', () => {
    renderPanels(compare())

    for (const side of ['A', 'B'] as const) {
      for (const item of cardsOf(side)) {
        const higherIsBetter = item.closest('section')!.getAttribute('aria-label') === START
        const other = cardsOf(side === 'A' ? 'B' : 'A').find((candidate) => labelOf(candidate) === labelOf(item))!
        const diff = valueOf(item) - valueOf(other)
        const good = diff > 0 === higherIsBetter

        expect(item.textContent, labelOf(item)!).toContain(diff > 0 ? '▲' : '▼')
        expect(item.innerHTML.includes('text-success-soft'), labelOf(item)!).toBe(good)
        expect(marked(item), labelOf(item)!).toBe(good)
      }
    }
  })

  it('lo que no cambia no se muestra, y no hay un filtro para pedirlo: se están comparando', () => {
    const comparison = compare([], CLOSE_B)
    renderPanels(comparison)
    const labels = cardsOf('A').map(labelOf)

    // Mismos roles y mismo tamaño: Bricks no cambia, así que no está en ninguno de los dos.
    expect(labels).not.toContain('Have Bricks')
    expect(cardsOf('B').map(labelOf)).toEqual(labels)
    expect(labels).toContain('Basic opening')
    for (const [index, cardA] of cardsOf('A').entries()) {
      expect(Math.abs(valueOf(cardA) - valueOf(cardsOf('B')[index]!))).toBeGreaterThanOrEqual(0.5 - 1e-9)
    }

    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText(/Only differences/)).toBeNull()
  })

  it('en cada grupo, las tarjetas van de la mayor diferencia a la menor, y un rol que repite una regla no sale dos veces', () => {
    renderPanels(compare())

    for (const group of [START, STUCK]) {
      const a = cardsOf('A', group)
      const b = cardsOf('B', group)
      const gaps = a.map((item, index) => Math.abs(valueOf(item) - valueOf(b[index]!)))

      expect(gaps).toEqual([...gaps].sort((left, right) => right - left))
      // Dos tarjetas del mismo grupo con los mismos dos valores serían lo mismo dicho dos veces (un rol que repite una regla).
      const pairs = a.map((item, index) => `${valueOf(item)}|${valueOf(b[index]!)}`)
      expect(new Set(pairs).size).toBe(pairs.length)
    }
  })

  it('una regla que vale para un solo turno lo dice y sólo trae las manos de ese turno', () => {
    const onlyFirst = createMatcherPattern('Solo mi 1º', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 2, kind: 'include' }], { turnContext: 'first' })
    renderPanels(compare([onlyFirst]))
    const item = cardNamed('A', 'Solo mi 1º')

    expect(item.textContent).toContain('First only')
    expect(item.textContent).toContain('Going first:')
    expect(item.textContent).not.toContain('Going second:')
  })

  it('la regla que le falta una carta a un mazo se lo avisa a ese mazo y sólo a ese', () => {
    const withCard = createMatcherPattern('Con s3', 'opening', [{ matcher: { type: 'card', value: 's3' }, quantity: 1, kind: 'include' }])
    renderPanels(compare([withCard]))

    expect(cardNamed('A', 'Con s3').textContent).toContain('This build is missing a card from the rule.')
    expect(cardNamed('B', 'Con s3').textContent).not.toContain('missing a card')
  })

  it('si no cambia nada, lo dice y no deja listas vacías ni un botón para ver lo que no cambia', () => {
    const comparison = compareBuilds({ name: 'Alpha deck', cards: DECK_A }, { name: 'Beta deck', cards: DECK_A.map((entry) => ({ ...entry, id: `b-${entry.id}` })) }, RULES)
    renderPanels(comparison)

    expect(screen.getAllByText('Both builds perform the same')).toHaveLength(2)
    expect(screen.getAllByText('Nothing changes by more than 0.5 points, so there is nothing to compare.')).toHaveLength(2)
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('mientras se calcula, muestra una carga en vez de anillos vacíos', () => {
    const computing = compareBuilds({ name: 'Alpha deck', cards: DECK_A }, { name: 'Beta deck', cards: DECK_B }, RULES, { a: undefined, b: undefined })
    render(<DeckResults side="A" comparison={computing} />)

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('meter')).toBeNull()
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

/** Una carta de la lista (sólo lo que la grilla lee). */
const instance = (id: number, name: string, n = 0) =>
  ({ instanceId: `${id}-${n}`, name, apiCard: { ygoprodeckId: id, imageUrl: null, imageUrlSmall: null }, origin: 'manual', roles: ['starter'], needsReview: false }) as unknown as DeckCardInstance

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
  const scrim = () => document.querySelector('[data-results-scrim]') as HTMLElement

  it('en escritorio se ven las dos listas con el VS en el medio (sólo "VS", sin rótulo), y los resultados no se ven hasta tocarlo', () => {
    stage()
    const [listA, listB] = ['Build A: Alpha deck', 'Build B: Beta deck'].map((name) => screen.getByRole('region', { name }))

    expect(vs()).toHaveTextContent('VS')
    expect(vs()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Results')).toBeNull()
    // El orden: lista A, VS, lista B.
    expect(listA!.compareDocumentPosition(vs()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(vs().compareDocumentPosition(listB!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Los dos cajones existen pero cerrados: fuera de pantalla, invisibles y fuera del foco; y sin velo.
    expect(drawers()).toHaveLength(2)
    for (const drawer of drawers()) {
      expect(drawer).toHaveAttribute('inert')
      expect(drawer).toHaveAttribute('aria-hidden', 'true')
      expect(drawer.className).toContain('invisible')
    }
    expect(scrim().className).toContain('opacity-0')
  })

  it('el VS abre dos cajones anchos, uno desde cada borde, con sombra y un velo de fondo, y los resultados separados por mazo; el VS de nuevo, Escape, el velo o la X los cierran', () => {
    stage()
    const [left, right] = drawers() as [HTMLElement, HTMLElement]

    fireEvent.click(vs())
    expect(vs()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText('Close')).toBeNull()
    for (const drawer of [left, right]) {
      expect(drawer).not.toHaveAttribute('inert')
      expect(drawer.className).toContain('visible')
      expect(drawer.className).toContain('translate-x-0')
      // Llegan casi hasta el VS (la mitad de la pantalla menos lo que ocupa el VS) y no son más anchos que lo que se lee bien.
      expect(drawer.className).toContain('w-[min(46rem,calc(50vw-4.5rem))]')
    }
    expect(left.className).toContain('left-0')
    expect(right.className).toContain('right-0')
    // Proyectan sombra hacia adentro: contra el fondo no son planos.
    expect(left.className).toContain('shadow-[16px_0_48px')
    expect(right.className).toContain('shadow-[-16px_0_48px')
    expect(scrim().className).toContain('opacity-100')
    // El de la izquierda es del mazo A y el de la derecha del B, cada uno con lo suyo (sus ▲/▼ se miden contra el otro).
    expect(within(left).getByRole('heading', { name: 'Alpha deck' })).toBeInTheDocument()
    expect(within(right).getByRole('heading', { name: 'Beta deck' })).toBeInTheDocument()
    expect(within(left).getAllByRole('meter', { name: 'out of every 100 hands are good' })).toHaveLength(1)
    expect(within(left).getAllByText(/build B$/).length).toBeGreaterThan(0)
    expect(within(left).queryByText(/build A$/)).toBeNull()
    expect(within(right).getAllByText(/build A$/).length).toBeGreaterThan(0)
    expect(within(right).queryByText(/build B$/)).toBeNull()

    fireEvent.click(vs())
    expect(vs()).toHaveAttribute('aria-expanded', 'false')
    // Cerrados salen de la pantalla del todo (su ancho más lo que los separa del borde).
    expect(left.className).toContain('-translate-x-[calc(100%+var(--edge,0px))]')
    expect(right.className).toContain(' translate-x-[calc(100%+var(--edge,0px))]')
    expect(left).toHaveAttribute('inert')
    expect(scrim().className).toContain('opacity-0')

    fireEvent.click(vs())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(vs()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(vs())
    fireEvent.click(scrim())
    expect(vs()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(vs())
    fireEvent.click(within(right).getByRole('button', { name: 'Close' }))
    expect(vs()).toHaveAttribute('aria-expanded', 'false')
  })

  it('los cajones se pegan al VS, uno a cada lado, del mismo ancho, y no lo tapan aunque el menú lateral le corra el centro a la página', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.getAttribute('aria-label') === 'See each deck’s results' ? { left: 777, right: 853, width: 76 } : { left: 0, right: 0, width: 0 }) as DOMRect
    })
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 1400, configurable: true })
    stage()
    fireEvent.click(vs())
    const [left, right] = drawers() as [HTMLElement, HTMLElement]

    // A la derecha del VS queda lo menos (1400 − 853 − 12 = 535): los dos miden eso, y cada uno termina a 12px del VS.
    expect(left.style.width).toBe('535px')
    expect(right.style.width).toBe('535px')
    expect(left.style.left).toBe('230px')
    expect(right.style.left).toBe('865px')
    expect(Number.parseFloat(left.style.left) + 535).toBeLessThan(777)
    expect(Number.parseFloat(right.style.left)).toBeGreaterThan(853)
    // Para cerrarse salen del todo: A hacia la izquierda (lo que lo separa del borde), B hacia la derecha (nada: ya toca el borde).
    expect(left.style.getPropertyValue('--edge')).toBe('230px')
    expect(right.style.getPropertyValue('--edge')).toBe('0px')

    rect.mockRestore()
    Reflect.deleteProperty(document.documentElement, 'clientWidth')
  })

  it('abrir o cerrar los cajones no mueve las listas: la columna del medio es fija y el VS no cambia de contenido', () => {
    stage()
    const grid = screen.getByRole('region', { name: 'Build A: Alpha deck' }).parentElement!

    // Una columna fija (no `auto`): lo que haya en el VS no le cambia el ancho a las listas.
    expect(grid.className).toContain('min-[1101px]:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)]')
    expect(vs().parentElement!.parentElement!.textContent).toBe('VS')
    fireEvent.click(vs())
    expect(grid.className).toContain('_5rem_')
    expect(vs().parentElement!.parentElement!.textContent).toBe('VS')
  })

  it('lo que no cambia no está en ninguno de los dos cajones', () => {
    stage(compare([], CLOSE_B))
    fireEvent.click(vs())
    const [left, right] = drawers() as [HTMLElement, HTMLElement]

    expect(within(left).queryByText('Have Bricks')).toBeNull()
    expect(within(right).queryByText('Have Bricks')).toBeNull()
    expect(within(left).getByText('Basic opening')).toBeInTheDocument()
    expect(within(right).getByText('Basic opening')).toBeInTheDocument()
  })

  it('mientras no hay resultados, el VS abre igual y no hay anillos', () => {
    stage(null)
    fireEvent.click(vs())

    expect(drawers()).toHaveLength(2)
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('en el celular no hay cajones: el VS abre una hoja con los dos mazos uno debajo del otro', () => {
    desktop = false
    stage()

    expect(drawers()).toHaveLength(0)
    expect(scrim()).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(vs())
    const dialog = within(screen.getByRole('dialog'))
    const [boxA, boxB] = ['Build A: Alpha deck', 'Build B: Beta deck'].map((name) => dialog.getByRole('region', { name }))

    expect(dialog.getByText('Results by deck')).toBeInTheDocument()
    expect(within(boxA!).getAllByRole('meter', { name: 'out of every 100 hands are good' })).toHaveLength(1)
    expect(within(boxB!).getAllByRole('meter', { name: 'out of every 100 hands are good' })).toHaveLength(1)
    // A arriba, B abajo.
    expect(boxA!.compareDocumentPosition(boxB!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('las listas: contenedores a la par y cambios a la vista', () => {
  const listOf = (build: { name: string; main: DeckCardInstance[]; extra?: DeckCardInstance[]; side?: DeckCardInstance[] }) => ({
    name: build.name,
    zones: { main: build.main, extra: build.extra ?? [], side: build.side ?? [] },
    onCardClick: vi.fn(),
  })
  const stage = (a: ReturnType<typeof listOf>, b: ReturnType<typeof listOf>, deltaByCardId = new Map<string, number>()) =>
    render(
      <Provider store={configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' }) => state } })}>
        <CompareStage a={a} b={b} comparison={null} deltaByCardId={deltaByCardId} />
      </Provider>,
    )
  const list = (side: 'A' | 'B') => screen.getByRole('region', { name: new RegExp(`^Build ${side}:`) })
  const zoneLabels = (side: 'A' | 'B') => [...list(side).querySelectorAll('span.uppercase')].map((label) => label.textContent)

  it('en escritorio las dos listas comparten las filas de la grilla: la misma zona queda a la par aunque un mazo tenga más cartas o no tenga extra', () => {
    stage(listOf({ name: 'Alpha deck', main: [instance(1, 'Uno'), instance(2, 'Dos')] }), listOf({ name: 'Beta deck', main: [instance(1, 'Uno')], extra: [instance(3, 'Tres')] }))

    // Encabezado + Main + Extra: tres filas compartidas (subgrid), cada lista en su columna, y el VS ocupa las mismas tres.
    for (const [side, column] of [['A', '1'], ['B', '3']] as const) {
      expect(list(side).style.gridTemplateRows).toBe('subgrid')
      expect(list(side).style.gridRow).toBe('1 / span 3')
      expect(list(side).style.gridColumn).toBe(column)
    }
    expect(vsBox().style.gridColumn).toBe('2')
    expect(vsBox().style.gridRow).toBe('1 / span 3')
    // A no tiene extra pero la muestra vacía: así su Main no queda corrido contra el del otro mazo.
    expect(zoneLabels('A')).toEqual(['Main [2]', 'Extra [0]'])
    expect(zoneLabels('B')).toEqual(['Main [1]', 'Extra [1]'])
  })

  it('en el celular cada lista va sola, sin filas compartidas y sin zonas vacías', () => {
    desktop = false
    stage(listOf({ name: 'Alpha deck', main: [instance(1, 'Uno')] }), listOf({ name: 'Beta deck', main: [instance(1, 'Uno')], extra: [instance(3, 'Tres')] }))

    expect(list('A').style.gridTemplateRows).toBe('')
    expect(zoneLabels('A')).toEqual(['Main [1]'])
    expect(zoneLabels('B')).toEqual(['Main [1]', 'Extra [1]'])
  })

  it('las cartas que cambian se marcan fuerte (aro grueso y la cantidad en la primera copia: +N en B, −N en A) y las que no cambian se apagan', () => {
    const [one, two] = [instance(1, 'Uno'), instance(2, 'Dos')]
    const delta = new Map([[getDerivedCardId(1), 2], [getDerivedCardId(4), -1]])

    stage(
      listOf({ name: 'Alpha deck', main: [instance(4, 'Cuatro'), two] }),
      listOf({ name: 'Beta deck', main: [one, instance(1, 'Uno', 1), instance(2, 'Dos', 1)] }),
      delta,
    )
    const inB = within(list('B'))
    const inA = within(list('A'))
    const [firstCopy, secondCopy] = inB.getAllByTitle('Uno')

    expect(firstCopy!.className).toContain('outline-[3px]')
    expect(firstCopy!.className).toContain('outline-success')
    expect(secondCopy!.className).toContain('outline-success')
    // La cantidad va una sola vez por carta.
    expect(within(firstCopy!).getByText('+2')).toBeInTheDocument()
    expect(within(secondCopy!).queryByText('+2')).toBeNull()
    expect(inB.getByTitle('Dos').className).toContain('opacity-40')
    expect(inB.getByTitle('Dos').className).not.toContain('outline-success')
    // A marca las que B saca, en rojo y con el signo menos.
    expect(inA.getByTitle('Cuatro').className).toContain('outline-danger')
    expect(within(inA.getByTitle('Cuatro')).getByText('−1')).toBeInTheDocument()
    expect(inA.getByTitle('Dos').className).toContain('opacity-40')
  })

  it('si no hay ninguna diferencia, nada se apaga', () => {
    stage(listOf({ name: 'Alpha deck', main: [instance(1, 'Uno')] }), listOf({ name: 'Beta deck', main: [instance(1, 'Uno', 1)] }))

    expect(within(list('A')).getByTitle('Uno').className).not.toContain('opacity-40')
  })

  function vsBox() {
    return screen.getByRole('button', { name: 'See each deck’s results' }).parentElement!.parentElement!
  }
})
