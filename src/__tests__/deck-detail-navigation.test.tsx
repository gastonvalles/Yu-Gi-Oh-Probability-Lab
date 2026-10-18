// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addSearchResultToDeckZone, deckBuilderReducer } from '../app/deck-builder-slice'
import { patternsReducer } from '../app/patterns-slice'
import { settingsReducer } from '../app/settings-slice'
import { useDeckModeController } from '../components/deck-mode/use-deck-mode-controller'
import type { ApiCardSearchResult } from '../ygoprodeck'

// La búsqueda de verdad pide el catálogo a la red: acá es una lista que el test controla.
const search = vi.hoisted(() => ({
  results: [] as unknown[],
  hasMore: false,
  isLoadingMore: false,
  loadMore: () => {},
  filters: {},
}))

vi.mock('../app/use-api-card-search', () => ({
  useApiCardSearch: () => ({
    apiSearch: { query: 'a', status: 'success', results: search.results, errorMessage: '', hasMore: search.hasMore, page: 0, requestId: 0 },
    searchFilters: search.filters,
    visibleSearchResults: search.results,
    activeFilterCount: 0,
    hasSearchCriteria: true,
    isLoadingMore: search.isLoadingMore,
    clearFilters: () => {},
    setQuery: () => {},
    updateSearchFilters: () => {},
    loadMoreResults: () => search.loadMore(),
  }),
}))

function cardOf(ygoprodeckId: number, name: string, cardType = 'Effect Monster', frameType = 'effect'): ApiCardSearchResult {
  return {
    ygoprodeckId, name, cardType, frameType, description: null, race: 'Zombie', attribute: 'FIRE', level: 3,
    linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
    banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
  }
}

const A = cardOf(1, 'Alfa')
const B = cardOf(2, 'Beta')
const C = cardOf(3, 'Gamma')
const D = cardOf(4, 'Delta')

function setup() {
  const store = configureStore({ reducer: { settings: settingsReducer, deckBuilder: deckBuilderReducer, patterns: patternsReducer } })
  const hook = renderHook(() => useDeckModeController().deckBuilderStep, {
    wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
  })

  return { store, ...hook }
}

beforeEach(() => {
  search.results = [A, B, C]
  search.hasMore = false
  search.isLoadingMore = false
  search.loadMore = () => {}
  search.filters = {}
})

afterEach(cleanup)

describe('las flechas del detalle en el builder', () => {
  it('desde los resultados de la búsqueda recorren la lista tal como se ve, sin dar la vuelta', () => {
    const { result } = setup()

    expect(result.current.selectedDetailNavigation).toBeNull()

    act(() => result.current.onSearchResultClick(1))
    expect(result.current.selectedDetailCard?.name).toBe('Alfa')
    expect(result.current.selectedDetailNavigation?.onPrevious).toBeNull()

    act(() => result.current.selectedDetailNavigation?.onNext?.())
    expect(result.current.selectedDetailCard?.name).toBe('Beta')
    expect(result.current.selectedDetailSource).toBe('search')

    act(() => result.current.selectedDetailNavigation?.onNext?.())
    expect(result.current.selectedDetailCard?.name).toBe('Gamma')
    expect(result.current.selectedDetailNavigation?.onNext).toBeNull()

    act(() => result.current.selectedDetailNavigation?.onPrevious?.())
    expect(result.current.selectedDetailCard?.name).toBe('Beta')
  })

  it('siguen el orden y el filtro de ahora: si la lista cambia, cambian los vecinos', () => {
    const { result, rerender } = setup()

    act(() => result.current.onSearchResultClick(2))
    search.results = [B, C]
    rerender()
    expect(result.current.selectedDetailNavigation?.onPrevious).toBeNull()

    // Si la carta abierta ya no está en los resultados (otro filtro), no hay de dónde pasar.
    search.results = [A, C]
    rerender()
    expect(result.current.selectedDetailCard?.name).toBe('Beta')
    expect(result.current.selectedDetailNavigation).toBeNull()
  })

  it('en la última con más resultados por cargar, «siguiente» los pide y pasa a la primera nueva cuando llegan', () => {
    const loadMore = vi.fn(() => {
      search.isLoadingMore = true
    })
    search.hasMore = true
    search.loadMore = loadMore
    const { result, rerender } = setup()

    act(() => result.current.onSearchResultClick(3))
    expect(result.current.selectedDetailNavigation?.onNext).not.toBeNull()

    act(() => result.current.selectedDetailNavigation?.onNext?.())
    expect(loadMore).toHaveBeenCalledOnce()
    expect(result.current.selectedDetailCard?.name).toBe('Gamma')

    // Llega la página siguiente.
    search.isLoadingMore = false
    search.results = [A, B, C, D]
    rerender()
    expect(result.current.selectedDetailCard?.name).toBe('Delta')

    // Y ya no queda pendiente: una lista que crece sola no mueve el detalle.
    search.results = [A, B, C, D, cardOf(5, 'Épsilon')]
    rerender()
    expect(result.current.selectedDetailCard?.name).toBe('Delta')
  })

  it('mientras llega la página siguiente la flecha espera, y si el detalle se cerró no lo reabre', () => {
    search.hasMore = true
    search.loadMore = () => {
      search.isLoadingMore = true
    }
    const { result, rerender } = setup()

    act(() => result.current.onSearchResultClick(3))
    act(() => result.current.selectedDetailNavigation?.onNext?.())
    rerender()
    expect(result.current.selectedDetailNavigation?.onNext).toBeNull()

    act(() => result.current.onCloseCardDetail())
    search.isLoadingMore = false
    search.results = [A, B, C, D]
    rerender()
    expect(result.current.selectedDetailCard).toBeNull()
  })

  it('desde una zona del deck recorren sus cartas, saltando las copias de la que está abierta', () => {
    search.results = []
    const { store, result } = setup()
    const add = (card: ApiCardSearchResult, zone: 'main' | 'extra') =>
      store.dispatch(addSearchResultToDeckZone({ apiCardId: card.ygoprodeckId, deckFormat: 'unlimited', index: store.getState().deckBuilder[zone].length, results: [card], zone }))
    const fusion = cardOf(9, 'Fusión', 'Fusion Monster', 'fusion')

    act(() => {
      add(A, 'main')
      add(A, 'main')
      add(B, 'main')
      add(C, 'main')
      add(fusion, 'extra')
    })
    const [firstA] = store.getState().deckBuilder.main

    act(() => result.current.onDeckCardClick(firstA!.instanceId))
    expect(result.current.selectedDetailSource).toBe('deck')
    expect(result.current.selectedDetailNavigation?.onPrevious).toBeNull()

    // La segunda copia de Alfa no es una parada: de Alfa se pasa a Beta.
    act(() => result.current.selectedDetailNavigation?.onNext?.())
    expect(result.current.selectedDetailCard?.name).toBe('Beta')
    expect(result.current.selectedDetailSource).toBe('deck')
    // El detalle sigue siendo el de una carta del deck: muestra sus copias en la zona.
    expect(result.current.selectedDeckCopyActions?.zoneLabel).toBe('Main Deck')

    act(() => result.current.selectedDetailNavigation?.onNext?.())
    expect(result.current.selectedDetailCard?.name).toBe('Gamma')
    // La zona termina en Gamma: el Extra no se mezcla.
    expect(result.current.selectedDetailNavigation?.onNext).toBeNull()

    act(() => result.current.selectedDetailNavigation?.onPrevious?.())
    act(() => result.current.selectedDetailNavigation?.onPrevious?.())
    expect(result.current.selectedDetailCard?.name).toBe('Alfa')
    expect(result.current.selectedDetailNavigation?.onPrevious).toBeNull()
  })

  it('en el Extra, con una sola carta, las dos flechas quedan apagadas', () => {
    search.results = []
    const { store, result } = setup()
    const fusion = cardOf(9, 'Fusión', 'Fusion Monster', 'fusion')

    act(() => void store.dispatch(addSearchResultToDeckZone({ apiCardId: 9, deckFormat: 'unlimited', index: 0, results: [fusion], zone: 'extra' })))
    act(() => result.current.onDeckCardClick(store.getState().deckBuilder.extra[0]!.instanceId))

    expect(result.current.selectedDetailNavigation).toEqual({ onPrevious: null, onNext: null })
  })
})
