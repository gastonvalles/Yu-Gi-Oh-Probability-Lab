// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_CARD_SEARCH_FILTERS, type CardSearchFilters } from '../app/card-search'
import { DesktopSearchPanel } from '../components/search/DesktopSearchPanel'
import { MobileCardSearch } from '../components/search/MobileCardSearch'
import { SearchFiltersDrawer } from '../components/search/SearchFiltersDrawer'
import type { CardSearchViewState } from '../components/search/search-types'
import { SideDrawer } from '../components/ui/SideDrawer'
import type { DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../components/CardArt', () => ({ CardArt: () => <i /> }))

beforeEach(() => {
  window.scrollTo = () => {}
  Element.prototype.scrollTo = () => {}
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(cleanup)

interface DrawerOptions {
  filters?: Partial<CardSearchFilters>
  deckFormat?: DeckFormat
  activeFilterCount?: number
  resultCount?: number | null
  hasMore?: boolean
}

function openDrawer({ filters = {}, deckFormat = 'tcg', activeFilterCount = 0, resultCount = null, hasMore = false }: DrawerOptions = {}) {
  const onFilterChange = vi.fn()
  const onClearFilters = vi.fn()
  const onClose = vi.fn()

  render(
    <SearchFiltersDrawer
      isOpen
      onClose={onClose}
      filters={{ ...DEFAULT_CARD_SEARCH_FILTERS, ...filters }}
      deckFormat={deckFormat}
      activeFilterCount={activeFilterCount}
      resultCount={resultCount}
      hasMore={hasMore}
      onFilterChange={onFilterChange}
      onClearFilters={onClearFilters}
    />,
  )

  return { onFilterChange, onClearFilters, onClose, dialog: screen.getByRole('dialog', { name: 'Filtros' }) }
}

describe('el cajón de filtros', () => {
  it('muestra los filtros en el orden pedido —marco, atributo, mágicas y trampas, tipo, habilidades, limitación y efecto—, cada uno en un desplegable, y las estadísticas', () => {
    const { dialog } = openDrawer()
    const triggers = within(dialog).getAllByRole('button').filter((button) => button.hasAttribute('aria-expanded'))

    expect(triggers.map((trigger) => trigger.previousElementSibling?.textContent)).toEqual(['Marco', 'Atributo', 'Mágicas y Trampas', 'Tipo', 'Habilidades', 'Limitación', 'Efecto'])
    // Todos arrancan cerrados y dicen «Cualquiera»; el único título de sección es el de las estadísticas.
    expect(triggers.every((trigger) => trigger.getAttribute('aria-expanded') === 'false')).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Marco Cualquiera' })).toBeInTheDocument()
    expect(within(dialog).getAllByRole('heading', { level: 3 }).slice(1).map((heading) => heading.textContent)).toEqual(['Estadísticas'])
    // El arquetipo es un campo, arriba de todo.
    expect(within(dialog).getByLabelText('Arquetipo')).toBeInTheDocument()
  })

  it('cada filtro es un desplegable de elección múltiple: el campo dice qué hay elegido, se abre con una lista de casillas, un toque suma y otro quita', () => {
    const { dialog, onFilterChange } = openDrawer({ filters: { frames: ['fusion'] } })
    const trigger = within(dialog).getByRole('button', { name: 'Marco Fusión' })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(within(dialog).queryByRole('checkbox', { name: 'Xyz' })).not.toBeInTheDocument()

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('checkbox', { name: 'Fusión' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Xyz' })).not.toBeChecked()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Xyz' }))
    expect(onFilterChange).toHaveBeenLastCalledWith({ frames: ['fusion', 'xyz'] })

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Fusión' }))
    expect(onFilterChange).toHaveBeenLastCalledWith({ frames: [] })

    fireEvent.click(trigger)

    expect(within(dialog).queryByRole('checkbox', { name: 'Xyz' })).not.toBeInTheDocument()
  })

  it('los demás desplegables llevan sus valores: atributo, subtipo de mágica o trampa, tipo de monstruo, habilidad, límite y efecto', () => {
    const { dialog, onFilterChange } = openDrawer()
    const choose = (group: string, option: string) => {
      fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${group} `) }))
      fireEvent.click(within(dialog).getByRole('checkbox', { name: option }))
    }

    choose('Atributo', 'DARK')
    expect(onFilterChange).toHaveBeenLastCalledWith({ attributes: ['DARK'] })
    choose('Mágicas y Trampas', 'Mágica de Juego Rápido')
    expect(onFilterChange).toHaveBeenLastCalledWith({ spellTrapKinds: ['spell:Quick-Play'] })
    choose('Tipo', 'Dragon')
    expect(onFilterChange).toHaveBeenLastCalledWith({ races: ['Dragon'] })
    choose('Habilidades', 'Volteo')
    expect(onFilterChange).toHaveBeenLastCalledWith({ abilities: ['flip'] })
    choose('Limitación', 'Semi-limitada')
    expect(onFilterChange).toHaveBeenLastCalledWith({ limits: ['semi-limited'] })
    choose('Efecto', 'Desterrar')
    expect(onFilterChange).toHaveBeenLastCalledWith({ effects: ['banish'] })
  })

  it('Escape cierra la lista desplegada y no el cajón; con la lista cerrada, cierra el cajón', () => {
    const { dialog, onClose } = openDrawer()
    const trigger = within(dialog).getByRole('button', { name: 'Atributo Cualquiera' })

    fireEvent.click(trigger)
    expect(within(dialog).getByRole('checkbox', { name: 'DARK' })).toBeInTheDocument()

    fireEvent.keyDown(within(dialog).getByRole('checkbox', { name: 'DARK' }), { key: 'Escape' })

    expect(within(dialog).queryByRole('checkbox', { name: 'DARK' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('el efecto se explica (según el texto de la carta, en inglés) y se puede escribir también un texto libre', () => {
    const { dialog, onFilterChange } = openDrawer()

    expect(within(dialog).getByText(/Según lo que dice el texto de la carta/)).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Texto del efecto (inglés)'), { target: { value: 'add 1' } })
    expect(onFilterChange).toHaveBeenLastCalledWith({ description: 'add 1' })
  })

  it('las estadísticas son cotas mínima y máxima que sólo aceptan dígitos', () => {
    const { dialog, onFilterChange } = openDrawer({ filters: { atk: { min: '', max: '3000' } } })

    fireEvent.change(within(dialog).getByLabelText('ATK, mínimo'), { target: { value: '2a5' } })
    expect(onFilterChange).toHaveBeenLastCalledWith({ atk: { min: '25', max: '3000' } })

    fireEvent.change(within(dialog).getByLabelText('DEF, máximo'), { target: { value: '1700' } })
    expect(onFilterChange).toHaveBeenLastCalledWith({ def: { min: '', max: '1700' } })

    fireEvent.change(within(dialog).getByLabelText('Nivel / Rango / Link, mínimo'), { target: { value: '4' } })
    expect(onFilterChange).toHaveBeenLastCalledWith({ level: { min: '4', max: '' } })
  })

  it('la limitación sólo está en los formatos con lista de prohibidas, con «Ocultar prohibidas»; los puntos son de Genesys', () => {
    const tcg = openDrawer()

    expect(within(tcg.dialog).getByRole('button', { name: 'Limitación Cualquiera' })).toBeInTheDocument()
    fireEvent.click(within(tcg.dialog).getByRole('switch', { name: 'Ocultar prohibidas en TCG' }))
    expect(tcg.onFilterChange).toHaveBeenLastCalledWith({ legalOnly: true })
    expect(within(tcg.dialog).queryByLabelText('Puntos Genesys, mínimo')).not.toBeInTheDocument()

    cleanup()

    for (const format of ['unlimited', 'genesys'] as const) {
      const other = openDrawer({ deckFormat: format })

      expect(within(other.dialog).queryByRole('button', { name: 'Limitación Cualquiera' })).not.toBeInTheDocument()
      expect(within(other.dialog).queryByLabelText('Puntos Genesys, mínimo') !== null).toBe(format === 'genesys')
      cleanup()
    }
  })

  it('abajo: «Limpiar filtros» sólo si hay filtros (sin caja), y volver a los resultados, que dice cuántos son', () => {
    const none = openDrawer({ resultCount: 14 })

    expect(within(none.dialog).queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    fireEvent.click(within(none.dialog).getByRole('button', { name: 'Ver 14 resultados' }))
    expect(none.onClose).toHaveBeenCalledTimes(1)

    cleanup()

    const some = openDrawer({ activeFilterCount: 2, resultCount: 14, hasMore: true })
    const clear = within(some.dialog).getByRole('button', { name: 'Limpiar filtros' })

    expect(clear).not.toHaveClass('border')
    fireEvent.click(clear)
    expect(some.onClearFilters).toHaveBeenCalledTimes(1)
    expect(within(some.dialog).getByRole('button', { name: 'Ver 14+ resultados' })).toBeInTheDocument()
  })

  it('el botón de volver dice «resultado» con uno, y sólo «Ver resultados» mientras busca o si no hay ninguno', () => {
    const one = openDrawer({ resultCount: 1 })

    expect(within(one.dialog).getByRole('button', { name: 'Ver 1 resultado' })).toBeInTheDocument()
    cleanup()

    for (const resultCount of [null, 0]) {
      const empty = openDrawer({ resultCount })

      expect(within(empty.dialog).getByRole('button', { name: 'Ver resultados' })).toBeInTheDocument()
      cleanup()
    }
  })

  it('Escape lo cierra', () => {
    const { onClose } = openDrawer()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

const card = (ygoprodeckId: number, name: string): ApiCardSearchResult => ({
  ygoprodeckId, name, cardType: 'Effect Monster', frameType: 'effect', description: null, race: 'Zombie', attribute: 'FIRE', level: 3,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
})

const searchState = (overrides: Partial<CardSearchViewState> = {}): CardSearchViewState => ({
  deckFormat: 'unlimited', query: 'carta', status: 'success', results: [card(1, 'Carta 1'), card(2, 'Carta 2'), card(3, 'Carta 3')], rawResultCount: 3, errorMessage: '', hasMore: false,
  isLoadingMore: false, filters: DEFAULT_CARD_SEARCH_FILTERS, activeFilterCount: 0, hasSearchCriteria: true, maxedOutResultIds: new Set(), ...overrides,
})
const searchActions = () => ({ onQueryChange: vi.fn(), onFilterChange: vi.fn(), onClearFilters: vi.fn(), onLoadMore: vi.fn() })

describe('el panel de búsqueda: sólo el campo y un botón de filtros', () => {
  const panels = {
    escritorio: (overrides: Partial<CardSearchViewState> = {}) =>
      render(<DesktopSearchPanel search={searchState(overrides)} actions={searchActions()} deckCopyCounts={new Map()} activeDragSearchCardId={null} selectedCardId={null} onResultClick={() => {}} onAddCard={() => true} onResultPointerDown={() => {}} />),
    celular: (overrides: Partial<CardSearchViewState> = {}) =>
      render(<MobileCardSearch search={searchState(overrides)} actions={searchActions()} deckCopyCounts={new Map()} zoneCounts={{ main: 0, extra: 0, side: 0 }} onAddCard={() => true} onOpenDetail={() => {}} onClose={() => {}} />),
  }

  for (const [name, mount] of Object.entries(panels)) {
    it(`${name}: no hay chips de tipo (el marco se elige en el cajón) y el botón de filtros abre el cajón con la cuenta de resultados`, () => {
      mount()

      expect(screen.queryByRole('button', { name: 'Monstruos' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Tipo de carta' })).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))

      const dialog = screen.getByRole('dialog', { name: 'Filtros' })

      expect(within(dialog).getByRole('button', { name: 'Ver 3 resultados' })).toBeInTheDocument()

      fireEvent.click(within(dialog).getByRole('button', { name: 'Ver 3 resultados' }))

      expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()
    })

    it(`${name}: con el total que da el catálogo, el cajón y la barra de resultados lo dicen sin «+» aunque se vea sólo la primera página`, () => {
      mount({ totalCount: 1044, hasMore: true })

      expect(screen.getByText(/1044/)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))

      expect(within(screen.getByRole('dialog', { name: 'Filtros' })).getByRole('button', { name: 'Ver 1044 resultados' })).toBeInTheDocument()
    })

    it(`${name}: los filtros puestos aparecen como chips (uno por grupo) y sólo entonces`, () => {
      const filters = { ...DEFAULT_CARD_SEARCH_FILTERS, frames: ['fusion', 'xyz'] }

      mount({ filters, activeFilterCount: 1 })

      const chip = screen.getByRole('button', { name: /Marco/ })

      expect(chip).toHaveTextContent('Marco: Fusión, Xyz')
    })
  }
})

describe('el cajón lateral', () => {
  it('por defecto mide la mitad de la pantalla y lleva relleno; el de la búsqueda mide la columna del builder y el de los filtros una hoja, los dos sin relleno (lo de adentro trae el suyo)', () => {
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

    rerender(
      <SideDrawer isOpen onClose={() => {}} title="Filtros" size="sheet">
        <p>contenido</p>
      </SideDrawer>,
    )

    expect(screen.getByRole('dialog')).toHaveClass('w-[min(100vw,28rem)]')
    expect(screen.getByText('contenido').parentElement).toHaveClass('p-0')
  })
})
