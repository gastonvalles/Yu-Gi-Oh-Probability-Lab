// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildSearchableCardIndex,
  buildSearchableCardIndexInSlices,
  DEFAULT_CARD_SEARCH_FILTERS,
  searchCardCatalog,
  type SearchableCardIndexEntry,
} from '../app/card-search'
import { useApiCardSearch } from '../app/use-api-card-search'
import type { ApiCardSearchResult } from '../ygoprodeck'

const catalogControl = vi.hoisted(() => ({
  promise: new Promise<unknown[]>(() => {}),
  resolve: (_cards: unknown[]) => {},
}))

vi.mock('../ygoprodeck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ygoprodeck')>()),
  loadCardCatalog: () => catalogControl.promise,
  searchCards: () => new Promise(() => {}),
}))

vi.mock('../app/card-search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/card-search')>()

  return {
    ...actual,
    searchCardCatalog: vi.fn(actual.searchCardCatalog),
    buildSearchableCardIndexInSlices: vi.fn(actual.buildSearchableCardIndexInSlices),
  }
})

function card(id: number, name: string): ApiCardSearchResult {
  return {
    ygoprodeckId: id,
    name,
    cardType: 'Effect Monster',
    frameType: 'effect',
    description: null,
    race: null,
    attribute: null,
    level: null,
    linkValue: null,
    atk: null,
    def: null,
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall: null,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
  }
}

// 40 dragones: con páginas de 15 son tres, así que "cargar más" se puede probar de punta a punta.
const CARDS = [
  ...Array.from({ length: 40 }, (_, index) => card(index + 1, `Dragon ${String(40 - index).padStart(2, '0')}`)),
  card(100, 'Dark Magician'),
  card(101, 'Pot of Greed'),
]

const idsOf = (cards: ApiCardSearchResult[]) => cards.map((entry) => entry.ygoprodeckId)
const expectedRanking = (query: string) =>
  searchCardCatalog(buildSearchableCardIndex(CARDS), query, DEFAULT_CARD_SEARCH_FILTERS, 'tcg')

beforeEach(() => {
  catalogControl.promise = new Promise((resolve) => {
    catalogControl.resolve = resolve
  })
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => window.setTimeout(callback, 0))
  vi.mocked(searchCardCatalog).mockClear()
  vi.mocked(buildSearchableCardIndexInSlices).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('búsqueda local del catálogo (hook)', () => {
  it('sigue contra la API hasta que el índice está completo y recién entonces busca en el catálogo', async () => {
    let finishIndex: (index: SearchableCardIndexEntry[] | null) => void = () => {}

    vi.mocked(buildSearchableCardIndexInSlices).mockImplementationOnce(
      () => new Promise((resolve) => { finishIndex = resolve }),
    )

    const { result } = renderHook(() => useApiCardSearch('tcg'))

    act(() => result.current.setQuery('dragon'))
    catalogControl.resolve(CARDS)
    await waitFor(() => expect(buildSearchableCardIndexInSlices).toHaveBeenCalledTimes(1))

    // El catálogo ya bajó pero el índice sigue armándose: nada de 'success' ni de buscar en un índice vacío.
    expect(searchCardCatalog).not.toHaveBeenCalled()
    expect(result.current.apiSearch.status).toBe('loading')
    expect(result.current.visibleSearchResults).toEqual([])

    await act(async () => finishIndex(buildSearchableCardIndex(CARDS)))

    expect(result.current.apiSearch.status).toBe('success')
    expect(idsOf(result.current.visibleSearchResults)).toEqual(idsOf(expectedRanking('dragon').slice(0, 15)))
    expect(result.current.apiSearch.hasMore).toBe(true)
  })

  it('si se desmonta a mitad del armado, avisa que se canceló y no busca nada', async () => {
    let finishIndex: (index: SearchableCardIndexEntry[] | null) => void = () => {}

    vi.mocked(buildSearchableCardIndexInSlices).mockImplementationOnce(
      () => new Promise((resolve) => { finishIndex = resolve }),
    )

    const { result, unmount } = renderHook(() => useApiCardSearch('tcg'))

    act(() => result.current.setQuery('dragon'))
    catalogControl.resolve(CARDS)
    await waitFor(() => expect(buildSearchableCardIndexInSlices).toHaveBeenCalledTimes(1))

    const isCancelled = vi.mocked(buildSearchableCardIndexInSlices).mock.calls[0][1]

    expect(isCancelled()).toBe(false)
    unmount()
    expect(isCancelled()).toBe(true)

    await act(async () => finishIndex(null))

    expect(searchCardCatalog).not.toHaveBeenCalled()
  })

  it('"cargar más" agranda el corte sin volver a rankear el catálogo', async () => {
    const { result } = renderHook(() => useApiCardSearch('tcg'))

    act(() => result.current.setQuery('dragon'))
    catalogControl.resolve(CARDS)
    await waitFor(() => expect(result.current.apiSearch.status).toBe('success'))

    const ranked = expectedRanking('dragon')

    // El catálogo sabe cuántas son en total aunque se muestre sólo la primera página; la API (mientras el catálogo no está) no lo sabe.
    expect(result.current.totalResultCount).toBe(ranked.length)

    vi.mocked(searchCardCatalog).mockClear()
    act(() => result.current.loadMoreResults())
    expect(idsOf(result.current.visibleSearchResults)).toEqual(idsOf(ranked.slice(0, 30)))
    act(() => result.current.loadMoreResults())
    expect(idsOf(result.current.visibleSearchResults)).toEqual(idsOf(ranked))
    expect(result.current.apiSearch.hasMore).toBe(false)
    expect(searchCardCatalog).not.toHaveBeenCalled()
  })

  it('las funciones que devuelve conservan su identidad entre renders', () => {
    const { result, rerender } = renderHook(() => useApiCardSearch('tcg'))
    const first = result.current

    act(() => result.current.setQuery('dragon'))
    act(() => result.current.updateSearchFilters({ attributes: ['DARK'] }))
    rerender()

    expect(result.current.setQuery).toBe(first.setQuery)
    expect(result.current.updateSearchFilters).toBe(first.updateSearchFilters)
    expect(result.current.clearFilters).toBe(first.clearFilters)
  })
})

describe('armado del índice en rebanadas', () => {
  it('arma lo mismo que el armado de una vez, también cuando cede el hilo entre cartas', async () => {
    // El reloj salta 10 ms por lectura: se cede el hilo después de cada carta.
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10))

    const sliced = await buildSearchableCardIndexInSlices(CARDS.slice(0, 6), () => false)

    expect(sliced).toEqual(buildSearchableCardIndex(CARDS.slice(0, 6)))
  })

  it('devuelve null si lo cancelan mientras cede el hilo', async () => {
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10))

    await expect(buildSearchableCardIndexInSlices(CARDS, () => true)).resolves.toBeNull()
  })
})
