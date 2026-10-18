// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_CARD_SEARCH_FILTERS, type CardSearchFilters } from '../app/card-search'
import { MobileCardSearch } from '../components/search/MobileCardSearch'
import { SearchFiltersForm } from '../components/search/SearchFiltersForm'
import type { CardSearchViewState } from '../components/search/search-types'
import { useSearchFilterContext } from '../components/search/use-search-filter-context'
import { SideDrawer } from '../components/ui/SideDrawer'
import type { DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../components/CardArt', () => ({ CardArt: () => <i /> }))

function Form({ filters = DEFAULT_CARD_SEARCH_FILTERS, format = 'tcg', activeFilterCount = 0, onClear = () => {} }: { filters?: CardSearchFilters; format?: DeckFormat; activeFilterCount?: number; onClear?: () => void }) {
  const context = useSearchFilterContext(filters, format, () => {})

  return <SearchFiltersForm id="filters" layout="desktop" filters={filters} context={context} activeFilterCount={activeFilterCount} onFilterChange={() => {}} onClearFilters={onClear} />
}

beforeEach(() => {
  window.scrollTo = () => {}
  Element.prototype.scrollTo = () => {}
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(cleanup)

const before = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('los filtros de la búsqueda', () => {
  it('van de lo que más se usa a lo que menos: las prohibidas, el atributo y el nivel, el arquetipo y, plegado, lo demás', () => {
    render(<Form filters={{ ...DEFAULT_CARD_SEARCH_FILTERS, quickType: 'monster' }} />)

    const legal = screen.getByText('Ocultar prohibidas')
    const attribute = screen.getByText('Atributo')
    const archetype = screen.getByText('Arquetipo')
    const more = screen.getByRole('button', { name: 'Más filtros' })

    expect(before(legal, attribute)).toBe(true)
    expect(before(attribute, archetype)).toBe(true)
    expect(before(archetype, more)).toBe(true)
  })

  it('«Más filtros» arranca plegado, se abre y se cierra, y anuncia su estado', () => {
    render(<Form filters={{ ...DEFAULT_CARD_SEARCH_FILTERS, quickType: 'monster' }} />)

    const more = screen.getByRole('button', { name: 'Más filtros' })

    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/^Texto del efecto/)).not.toBeInTheDocument()
    expect(screen.queryByText('Tipo de monstruo')).not.toBeInTheDocument()

    fireEvent.click(more)

    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(more).toHaveAttribute('aria-controls', 'filters-more')
    expect(screen.getByText(/^Texto del efecto/)).toBeInTheDocument()
    expect(screen.getByText('Tipo de monstruo')).toBeInTheDocument()

    fireEvent.click(more)

    expect(screen.queryByText('Tipo de monstruo')).not.toBeInTheDocument()
  })

  it('arranca abierto, con cuántos hay puestos, si alguno de los plegados ya está puesto', () => {
    render(<Form filters={{ ...DEFAULT_CARD_SEARCH_FILTERS, quickType: 'monster', description: 'add 1', race: 'Zombie' }} activeFilterCount={2} />)

    const more = screen.getByRole('button', { name: /Más filtros/ })

    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(within(more).getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/^Texto del efecto/)).toBeInTheDocument()
  })

  it('«Limpiar filtros» sólo está cuando hay filtros, sin caja, y el renglón de arriba no cambia de alto', () => {
    const onClear = vi.fn()
    const { rerender } = render(<Form onClear={onClear} />)

    expect(screen.getByText('Sin filtros activos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    expect(screen.getByText('Sin filtros activos').parentElement).toHaveClass('min-h-9')

    rerender(<Form onClear={onClear} activeFilterCount={2} />)

    expect(screen.getByText('2 filtros activos')).toBeInTheDocument()

    const clear = screen.getByRole('button', { name: 'Limpiar filtros' })

    expect(clear).not.toHaveClass('border')
    fireEvent.click(clear)

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('sin lista de prohibidas en el formato (libre), el interruptor no está', () => {
    render(<Form format="unlimited" />)

    expect(screen.queryByText('Ocultar prohibidas')).not.toBeInTheDocument()
  })
})

const card = (ygoprodeckId: number, name: string): ApiCardSearchResult => ({
  ygoprodeckId, name, cardType: 'Effect Monster', frameType: 'effect', description: null, race: 'Zombie', attribute: 'FIRE', level: 3,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
})

describe('el botón de volver de los filtros del celular', () => {
  const search = (overrides: Partial<CardSearchViewState>): CardSearchViewState => ({
    deckFormat: 'unlimited', query: 'carta', status: 'success', results: [card(1, 'Carta 1'), card(2, 'Carta 2'), card(3, 'Carta 3')], rawResultCount: 3, errorMessage: '', hasMore: false,
    isLoadingMore: false, filters: DEFAULT_CARD_SEARCH_FILTERS, activeFilterCount: 0, hasSearchCriteria: true, maxedOutResultIds: new Set(), ...overrides,
  })
  const open = (overrides: Partial<CardSearchViewState>) => {
    render(
      <MobileCardSearch
        search={search(overrides)}
        actions={{ onQueryChange: vi.fn(), onFilterChange: vi.fn(), onClearFilters: vi.fn(), onLoadMore: vi.fn() }}
        deckCopyCounts={new Map()}
        zoneCounts={{ main: 0, extra: 0, side: 0 }}
        onAddCard={() => true}
        onOpenDetail={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
  }

  it('dice cuántos resultados dan los filtros, con «+» si hay más por traer', () => {
    open({})

    expect(screen.getByRole('button', { name: 'Ver 3 resultados' })).toBeInTheDocument()

    cleanup()
    open({ hasMore: true })

    expect(screen.getByRole('button', { name: 'Ver 3+ resultados' })).toBeInTheDocument()
  })

  it('con uno dice «resultado», y mientras busca o si no hay ninguno, sólo «Ver resultados»', () => {
    open({ results: [card(1, 'Carta 1')] })

    expect(screen.getByRole('button', { name: 'Ver 1 resultado' })).toBeInTheDocument()

    cleanup()
    open({ status: 'loading' })

    expect(screen.getByRole('button', { name: 'Ver resultados' })).toBeInTheDocument()

    cleanup()
    open({ results: [] })

    expect(screen.getByRole('button', { name: 'Ver resultados' })).toBeInTheDocument()
  })
})

describe('el cajón lateral', () => {
  it('por defecto mide la mitad de la pantalla y lleva relleno; el de la búsqueda mide la columna del builder y no lleva relleno (el panel trae el suyo)', () => {
    const { rerender } = render(
      <SideDrawer isOpen onClose={() => {}} title="Chat">
        <p>contenido</p>
      </SideDrawer>,
    )

    expect(screen.getByRole('dialog')).toHaveClass('w-1/2')
    expect(screen.getByText('contenido').parentElement).toHaveClass('p-3')

    rerender(
      <SideDrawer isOpen onClose={() => {}} title="Buscar" size="column">
        <p>contenido</p>
      </SideDrawer>,
    )

    expect(screen.getByRole('dialog')).toHaveClass('w-[max(22.5rem,calc((100vw-15rem)*0.3))]')
    expect(screen.getByRole('dialog')).not.toHaveClass('w-1/2')
    expect(screen.getByText('contenido').parentElement).toHaveClass('p-0')
  })
})
