// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_CARD_SEARCH_FILTERS } from '../app/card-search'
import { DesktopSearchPanel } from '../components/search/DesktopSearchPanel'
import { MobileCardSearch } from '../components/search/MobileCardSearch'
import type { CardSearchViewState } from '../components/search/search-types'
import type { ApiCardSearchResult } from '../ygoprodeck'

// Se cuentan los dibujos del arte: cada fila dibuja uno, así que es la cantidad de veces que se dibujó esa fila.
const renders = vi.hoisted(() => ({ byName: {} as Record<string, number> }))

vi.mock('../components/CardArt', () => ({
  CardArt: ({ name }: { name: string }) => {
    renders.byName[name] = (renders.byName[name] ?? 0) + 1

    return <i />
  },
}))

const apiCard = (ygoprodeckId: number, name: string, tcg: 'limited' | null = null): ApiCardSearchResult => ({
  ygoprodeckId, name, cardType: 'Effect Monster', frameType: 'effect', description: null, race: 'Zombie', attribute: 'FIRE', level: 3,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg, ocg: null, goat: null }, genesys: { points: null },
})

const RESULTS = [apiCard(1, 'Carta 1', 'limited'), apiCard(2, 'Carta 2'), apiCard(3, 'Carta 3'), apiCard(4, 'Carta 4')]

// Lo que arma el padre en cada dibujo: objetos y callbacks nuevos aunque los resultados sean los mismos.
const searchState = (overrides: Partial<CardSearchViewState> = {}): CardSearchViewState => ({
  deckFormat: 'unlimited', query: 'carta', status: 'success', results: RESULTS, rawResultCount: RESULTS.length, errorMessage: '', hasMore: false,
  isLoadingMore: false, filters: DEFAULT_CARD_SEARCH_FILTERS, activeFilterCount: 0, hasSearchCriteria: true, maxedOutResultIds: new Set(), ...overrides,
})
const searchActions = () => ({ onQueryChange: vi.fn(), onFilterChange: vi.fn(), onClearFilters: vi.fn(), onLoadMore: vi.fn() })

type DesktopProps = ComponentProps<typeof DesktopSearchPanel>
type MobileProps = ComponentProps<typeof MobileCardSearch>

const desktopProps = (overrides: Partial<DesktopProps> = {}): DesktopProps => ({
  search: searchState(),
  actions: searchActions(),
  deckCopyCounts: new Map(),
  activeDragSearchCardId: null,
  selectedCardId: null,
  onResultClick: vi.fn(),
  onAddCard: vi.fn(() => true),
  onResultPointerDown: vi.fn(),
  ...overrides,
})

const mobileProps = (overrides: Partial<MobileProps> = {}): MobileProps => ({
  search: searchState(),
  actions: searchActions(),
  deckCopyCounts: new Map(),
  zoneCounts: { main: 0, extra: 0, side: 0 },
  onAddCard: vi.fn(() => true),
  onOpenDetail: vi.fn(),
  onClose: vi.fn(),
  ...overrides,
})

const desktopRow = (name: string) => screen.getByText(name).closest('article') as HTMLElement
const mobileRow = (name: string) => screen.getByText(name).closest('li') as HTMLElement
const addButton = (row: HTMLElement) => row.querySelector('button:last-of-type') as HTMLButtonElement
const ONCE = (...names: string[]) => Object.fromEntries(names.map((name) => [name, 1]))

beforeEach(() => {
  renders.byName = {}
  window.scrollTo = () => {}
  Element.prototype.scrollTo = () => {}
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('las filas del buscador de escritorio', () => {
  it('redibujar el panel con los mismos resultados y callbacks nuevos no vuelve a dibujar ninguna fila', () => {
    const { rerender } = render(<DesktopSearchPanel {...desktopProps()} />)
    expect(renders.byName).toEqual(ONCE('Carta 1', 'Carta 2', 'Carta 3', 'Carta 4'))

    // Como al escribir el nombre del deck: el padre se dibuja y todo lo que pasa son identidades nuevas.
    rerender(<DesktopSearchPanel {...desktopProps()} />)
    rerender(<DesktopSearchPanel {...desktopProps()} />)

    expect(renders.byName).toEqual(ONCE('Carta 1', 'Carta 2', 'Carta 3', 'Carta 4'))
  })

  it('los clics llegan a los callbacks más nuevos del padre, y el arrastre recibe el evento original', () => {
    const first = desktopProps()
    const { rerender } = render(<DesktopSearchPanel {...first} />)
    const latest = desktopProps()
    const targets: Array<EventTarget | null> = []
    latest.onResultPointerDown = vi.fn((event) => void targets.push(event.currentTarget))
    rerender(<DesktopSearchPanel {...latest} />)

    fireEvent.click(desktopRow('Carta 2'))
    fireEvent.doubleClick(desktopRow('Carta 3'))
    fireEvent.pointerDown(desktopRow('Carta 4'), { button: 0 })

    expect(latest.onResultClick).toHaveBeenCalledTimes(1)
    expect(latest.onResultClick).toHaveBeenCalledWith(2)
    expect(latest.onAddCard).toHaveBeenCalledTimes(1)
    expect(latest.onAddCard).toHaveBeenCalledWith(3)
    expect(latest.onResultPointerDown).toHaveBeenCalledTimes(1)
    expect(latest.onResultPointerDown).toHaveBeenCalledWith(expect.objectContaining({ type: 'pointerdown' }), 4)
    // `currentTarget` sólo existe mientras el evento se despacha: llegó el original y en el acto.
    expect(targets).toEqual([desktopRow('Carta 4')])
    expect(first.onResultClick).not.toHaveBeenCalled()
    expect(first.onAddCard).not.toHaveBeenCalled()
    expect(first.onResultPointerDown).not.toHaveBeenCalled()
  })

  it('arrastrar, elegir, llegar al máximo o sumar copias sólo vuelve a dibujar la fila que cambia', () => {
    const { rerender } = render(<DesktopSearchPanel {...desktopProps()} />)

    renders.byName = {}
    rerender(<DesktopSearchPanel {...desktopProps({ activeDragSearchCardId: 2 })} />)
    expect(renders.byName).toEqual(ONCE('Carta 2'))
    expect(desktopRow('Carta 2')).toHaveClass('opacity-35')

    renders.byName = {}
    rerender(<DesktopSearchPanel {...desktopProps({ selectedCardId: 3 })} />)
    expect(renders.byName).toEqual(ONCE('Carta 2', 'Carta 3'))
    expect(desktopRow('Carta 2')).not.toHaveClass('opacity-35')
    expect(desktopRow('Carta 3')).toHaveClass('bg-primary/20')

    renders.byName = {}
    rerender(<DesktopSearchPanel {...desktopProps({ selectedCardId: 3, search: searchState({ maxedOutResultIds: new Set([1]) }) })} />)
    expect(renders.byName).toEqual(ONCE('Carta 1'))
    expect(desktopRow('Carta 1')).toHaveAttribute('aria-disabled', 'true')
    expect(addButton(desktopRow('Carta 1'))).toBeDisabled()

    renders.byName = {}
    rerender(<DesktopSearchPanel {...desktopProps({ selectedCardId: 3, deckCopyCounts: new Map([[4, 2]]), search: searchState({ maxedOutResultIds: new Set([1]) }) })} />)
    expect(renders.byName).toEqual(ONCE('Carta 4'))
    expect(within(desktopRow('Carta 4')).getByText('×2')).toBeInTheDocument()
  })

  it('agregar con "+" marca sólo esa fila durante 900 ms', () => {
    render(<DesktopSearchPanel {...desktopProps()} />)
    renders.byName = {}

    fireEvent.click(addButton(desktopRow('Carta 2')))
    expect(renders.byName).toEqual(ONCE('Carta 2'))
    expect(addButton(desktopRow('Carta 2'))).toHaveClass('bg-success-solid')

    act(() => void vi.advanceTimersByTime(900))
    expect(renders.byName).toEqual({ 'Carta 2': 2 })
    expect(addButton(desktopRow('Carta 2'))).not.toHaveClass('bg-success-solid')
  })
})

describe('las filas del buscador de celular', () => {
  it('redibujar con los mismos resultados y callbacks nuevos no vuelve a dibujar ninguna fila', () => {
    const { rerender } = render(<MobileCardSearch {...mobileProps()} />)
    expect(renders.byName).toEqual(ONCE('Carta 1', 'Carta 2', 'Carta 3', 'Carta 4'))

    rerender(<MobileCardSearch {...mobileProps()} />)
    rerender(<MobileCardSearch {...mobileProps()} />)

    expect(renders.byName).toEqual(ONCE('Carta 1', 'Carta 2', 'Carta 3', 'Carta 4'))
  })

  it('abrir el detalle y agregar llegan a los callbacks más nuevos del padre', () => {
    const first = mobileProps()
    const { rerender } = render(<MobileCardSearch {...first} />)
    const latest = mobileProps()
    rerender(<MobileCardSearch {...latest} />)

    fireEvent.click(mobileRow('Carta 3').querySelector('button') as HTMLButtonElement)
    fireEvent.click(addButton(mobileRow('Carta 2')))

    expect(latest.onOpenDetail).toHaveBeenCalledTimes(1)
    expect(latest.onOpenDetail).toHaveBeenCalledWith(3)
    expect(latest.onAddCard).toHaveBeenCalledTimes(1)
    expect(latest.onAddCard).toHaveBeenCalledWith(2)
    expect(first.onOpenDetail).not.toHaveBeenCalled()
    expect(first.onAddCard).not.toHaveBeenCalled()
  })

  it('agregar con "+" marca sólo esa fila durante 900 ms', () => {
    render(<MobileCardSearch {...mobileProps()} />)
    renders.byName = {}

    fireEvent.click(addButton(mobileRow('Carta 2')))
    expect(renders.byName).toEqual(ONCE('Carta 2'))
    expect(addButton(mobileRow('Carta 2'))).toHaveClass('bg-success/25')

    act(() => void vi.advanceTimersByTime(900))
    expect(renders.byName).toEqual({ 'Carta 2': 2 })
    expect(addButton(mobileRow('Carta 2'))).not.toHaveClass('bg-success/25')
  })

  it('cambiar el formato vuelve a dibujar las filas con la etiqueta del formato nuevo', () => {
    const { rerender } = render(<MobileCardSearch {...mobileProps({ search: searchState({ deckFormat: 'tcg' }) })} />)
    // «N de M» dice el límite del formato: en TCG la carta es limitada (1) y en OCG no.
    expect(within(mobileRow('Carta 1')).getByText('0 de 1')).toBeInTheDocument()

    renders.byName = {}
    rerender(<MobileCardSearch {...mobileProps({ search: searchState({ deckFormat: 'ocg' }) })} />)

    expect(renders.byName).toEqual(ONCE('Carta 1', 'Carta 2', 'Carta 3', 'Carta 4'))
    expect(within(mobileRow('Carta 1')).getByText('0 de 3')).toBeInTheDocument()
  })
})
