import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  applyLocalCardSearchFilters,
  buildCardSearchActiveFilterCount,
  buildRemoteCardSearchRequest,
  buildSearchableCardIndexInSlices,
  DEFAULT_CARD_SEARCH_FILTERS,
  hasCardSearchRequestCriteria,
  searchCardCatalog,
  sortSearchResults,
  type CardSearchFilters,
  type SearchableCardIndexEntry,
} from './card-search'
import {
  createInitialSearchState,
  SEARCH_DEBOUNCE_MS,
  SEARCH_PAGE_SIZE,
  type ApiSearchState,
} from './model'
import {
  loadApiSearchCache,
  getCachedApiSearch,
  storeCachedApiSearch,
} from './api-search-cache'
import { t } from '../i18n'
import { loadCardCatalog, searchCards, type ApiCardSearchResult } from '../ygoprodeck'
import type { DeckFormat } from '../types'

interface ApiCardSearchController {
  apiSearch: ApiSearchState<ApiCardSearchResult>
  searchFilters: CardSearchFilters
  visibleSearchResults: ApiCardSearchResult[]
  activeFilterCount: number
  hasSearchCriteria: boolean
  isLoadingMore: boolean
  clearFilters: () => void
  setQuery: (value: string) => void
  updateSearchFilters: (updates: Partial<CardSearchFilters>) => void
  loadMoreResults: () => void
}

type CardCatalogStatus = 'idle' | 'loading' | 'success' | 'error'

export function useApiCardSearch(deckFormat: DeckFormat): ApiCardSearchController {
  const [apiSearch, setApiSearch] = useState(() => createInitialSearchState<ApiCardSearchResult>())
  const [searchFilters, setSearchFilters] = useState<CardSearchFilters>(() => ({
    ...DEFAULT_CARD_SEARCH_FILTERS,
  }))
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchIndex, setSearchIndex] = useState<SearchableCardIndexEntry[]>([])
  const [cardCatalogStatus, setCardCatalogStatus] = useState<CardCatalogStatus>('idle')
  // Lazy: `useRef(loadApiSearchCache())` releía y parseaba el localStorage en cada render.
  const [searchCache] = useState(loadApiSearchCache)
  const searchCacheRef = useRef(searchCache)
  const searchDebounceTimerRef = useRef<number>(0)
  const searchRequestIdRef = useRef(0)
  const remoteSearchRequest = useMemo(
    () => buildRemoteCardSearchRequest(apiSearch.query, searchFilters, deckFormat),
    // Se listan sólo los filtros que viajan a la API: los demás (orden, etc.) no deben disparar otra búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      deckFormat,
      apiSearch.query,
      searchFilters.archetype,
      searchFilters.attribute,
      searchFilters.description,
      searchFilters.exactType,
      searchFilters.level,
      searchFilters.race,
    ],
  )
  const hasSearchCriteria = useMemo(
    () => hasCardSearchRequestCriteria(remoteSearchRequest),
    [remoteSearchRequest],
  )
  const activeFilterCount = useMemo(
    () => buildCardSearchActiveFilterCount(searchFilters, deckFormat),
    [deckFormat, searchFilters],
  )
  // Rankear y paginar van por separado: "cargar más" sólo agranda el corte y no tiene por qué reordenar todo el catálogo.
  const rankedLocalResults = useMemo(
    () =>
      cardCatalogStatus === 'success' && hasSearchCriteria
        ? searchCardCatalog(searchIndex, apiSearch.query, searchFilters, deckFormat)
        : null,
    [apiSearch.query, cardCatalogStatus, deckFormat, hasSearchCriteria, searchFilters, searchIndex],
  )
  const localSearchPage = useMemo(() => {
    if (!rankedLocalResults) {
      return null
    }

    const visibleResultCount = Math.min(
      rankedLocalResults.length,
      (apiSearch.page + 1) * SEARCH_PAGE_SIZE,
    )

    return {
      results: rankedLocalResults.slice(0, visibleResultCount),
      hasMore: rankedLocalResults.length > visibleResultCount,
    }
  }, [apiSearch.page, rankedLocalResults])
  const shouldUseLocalSearch = cardCatalogStatus === 'success' && localSearchPage !== null
  const effectiveApiSearch = useMemo<ApiSearchState<ApiCardSearchResult>>(
    () =>
      shouldUseLocalSearch && localSearchPage
        ? {
            ...apiSearch,
            status: 'success',
            results: localSearchPage.results,
            errorMessage: '',
            hasMore: localSearchPage.hasMore,
          }
        : apiSearch,
    [apiSearch, localSearchPage, shouldUseLocalSearch],
  )
  const visibleSearchResults = useMemo(
    () =>
      shouldUseLocalSearch
        ? effectiveApiSearch.results
        : applyLocalCardSearchFilters(apiSearch.results, searchFilters, deckFormat),
    [apiSearch.results, deckFormat, effectiveApiSearch.results, searchFilters, shouldUseLocalSearch],
  )

  const runApiSearch = useCallback(async (
    request: ReturnType<typeof buildRemoteCardSearchRequest>,
    page = 0,
    options: { append?: boolean } = {},
  ) => {
    const append = options.append ?? false
    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId

    if (!hasCardSearchRequestCriteria(request)) {
      setIsLoadingMore(false)
      setApiSearch((current) => ({
        ...current,
        status: 'idle',
        results: [],
        page: 0,
        hasMore: false,
        errorMessage: '',
        requestId,
      }))
      return
    }

    const cachedResults = getCachedApiSearch(searchCacheRef.current, request, page)

    if (cachedResults) {
      setIsLoadingMore(false)
      setApiSearch((current) => ({
        ...current,
        status: 'success',
        errorMessage: '',
        results: append
          ? mergeSearchResults(current.results, cachedResults.results, request.query)
          : sortSearchResults(cachedResults.results, request.query),
        requestId,
        page,
        hasMore: cachedResults.hasMore,
      }))
      return
    }

    if (append) {
      setIsLoadingMore(true)
    } else {
      setIsLoadingMore(false)
      setApiSearch((current) => ({
        ...current,
        status: 'loading',
        results: [],
        errorMessage: '',
        requestId,
        page: 0,
        hasMore: false,
      }))
    }

    try {
      const searchPage = await searchCards(
        {
          query: request.query,
          archetype: request.archetype,
          exactType: request.exactType,
          attribute: request.attribute,
          race: request.race,
          level: request.level,
          format: request.format,
        },
        SEARCH_PAGE_SIZE,
        page * SEARCH_PAGE_SIZE,
      )

      if (searchRequestIdRef.current !== requestId) {
        return
      }

      const sortedResults = sortSearchResults(searchPage.results, request.query)
      searchCacheRef.current = storeCachedApiSearch(searchCacheRef.current, request, page, {
        savedAt: Date.now(),
        results: sortedResults,
        hasMore: searchPage.hasMore,
      })
      setIsLoadingMore(false)

      setApiSearch((current) => ({
        ...current,
        status: 'success',
        results: append
          ? mergeSearchResults(current.results, sortedResults, request.query)
          : sortedResults,
        errorMessage: '',
        requestId,
        page,
        hasMore: searchPage.hasMore,
      }))
    } catch (error) {
      if (searchRequestIdRef.current !== requestId) {
        return
      }

      setIsLoadingMore(false)

      if (append) {
        // Falló cargar más: se mantiene hasMore para que el usuario pueda reintentar (botón o scroll),
        // en vez de dar la lista truncada por completa.
        return
      }

      setApiSearch((current) => ({
        ...current,
        status: 'error',
        results: [],
        requestId,
        page,
        hasMore: false,
        errorMessage: error instanceof Error ? error.message : t('search.ygoprodeck.requestError'),
      }))
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    setCardCatalogStatus((current) => (current === 'success' ? current : 'loading'))

    // El catálogo completo pesa ~20 MB: se baja en un momento ocioso, después del primer pintado.
    // Mientras tanto la búsqueda funciona contra la API.
    const schedule = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500))

    schedule(() => {
      if (cancelled) {
        return
      }

      // El índice se arma en rebanadas fuera del render; el estado sigue en 'loading' hasta que está completo.
      void loadCardCatalog()
        .then((cards) => buildSearchableCardIndexInSlices(cards, () => cancelled))
        .then((index) => {
          if (cancelled || !index) {
            return
          }

          setSearchIndex(index)
          setCardCatalogStatus('success')
        })
        .catch(() => {
          if (cancelled) {
            return
          }

          setCardCatalogStatus('error')
        })
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    window.clearTimeout(searchDebounceTimerRef.current)
    setIsLoadingMore(false)
    searchRequestIdRef.current += 1

    if (!hasSearchCriteria) {
      setApiSearch((current) =>
        current.status === 'idle' && current.results.length === 0 && current.page === 0
          ? current
          : {
              ...current,
              status: 'idle',
              results: [],
              hasMore: false,
              errorMessage: '',
              page: 0,
            },
      )
      return
    }

    if (shouldUseLocalSearch) {
      return
    }

    setApiSearch((current) => ({
      ...current,
      status: 'loading',
      results: [],
      hasMore: false,
      errorMessage: '',
      page: 0,
    }))

    searchDebounceTimerRef.current = window.setTimeout(() => {
      void runApiSearch(remoteSearchRequest, 0)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(searchDebounceTimerRef.current)
    }
  }, [
    hasSearchCriteria,
    remoteSearchRequest,
    runApiSearch,
    shouldUseLocalSearch,
  ])

  useEffect(
    () => () => {
      window.clearTimeout(searchDebounceTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!shouldUseLocalSearch) {
      return
    }

    setApiSearch((current) =>
      current.page === 0
        ? current
        : {
            ...current,
            page: 0,
          },
    )
  }, [deckFormat, shouldUseLocalSearch])

  const loadMoreResults = useCallback(() => {
    if (!hasSearchCriteria) {
      return
    }

    if (shouldUseLocalSearch) {
      if (!localSearchPage?.hasMore) {
        return
      }

      setApiSearch((current) => ({
        ...current,
        page: current.page + 1,
      }))
      return
    }

    if (
      apiSearch.status !== 'success' ||
      isLoadingMore ||
      !apiSearch.hasMore
    ) {
      return
    }

    void runApiSearch(remoteSearchRequest, apiSearch.page + 1, { append: true })
  }, [
    apiSearch.hasMore,
    apiSearch.page,
    apiSearch.status,
    hasSearchCriteria,
    isLoadingMore,
    localSearchPage?.hasMore,
    remoteSearchRequest,
    runApiSearch,
    shouldUseLocalSearch,
  ])

  // Identidad estable: sólo tocan estados, así que quien las reciba puede memoizarse sin que cambien en cada render.
  const clearFilters = useCallback(() => {
    setSearchFilters({
      ...DEFAULT_CARD_SEARCH_FILTERS,
    })
    setApiSearch((current) => ({
      ...current,
      page: 0,
    }))
  }, [])
  const setQuery = useCallback((value: string) => {
    setApiSearch((current) => ({
      ...current,
      query: value,
      page: 0,
    }))
  }, [])
  const updateSearchFilters = useCallback((updates: Partial<CardSearchFilters>) => {
    setSearchFilters((current) => ({
      ...current,
      ...updates,
    }))
    setApiSearch((current) => ({
      ...current,
      page: 0,
    }))
  }, [])

  return {
    apiSearch: effectiveApiSearch,
    searchFilters,
    visibleSearchResults,
    activeFilterCount,
    hasSearchCriteria,
    isLoadingMore: shouldUseLocalSearch ? false : isLoadingMore,
    clearFilters,
    setQuery,
    updateSearchFilters,
    loadMoreResults,
  }
}

function mergeSearchResults(
  currentResults: ApiCardSearchResult[],
  nextResults: ApiCardSearchResult[],
  query: string,
): ApiCardSearchResult[] {
  const mergedResults = new Map<number, ApiCardSearchResult>()

  for (const card of currentResults) {
    mergedResults.set(card.ygoprodeckId, card)
  }

  for (const card of nextResults) {
    mergedResults.set(card.ygoprodeckId, card)
  }

  return sortSearchResults([...mergedResults.values()], query)
}
