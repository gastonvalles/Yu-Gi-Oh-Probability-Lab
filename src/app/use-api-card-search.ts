import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  applyLocalCardSearchFilters,
  buildCardSearchActiveFilterCount,
  buildRemoteCardSearchRequest,
  DEFAULT_CARD_SEARCH_FILTERS,
  hasCardSearchRequestCriteria,
  sortSearchResults,
  type CardSearchFilters,
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
import { searchCards, type ApiCardSearchResult } from '../ygoprodeck'
import type { DeckFormat } from '../types'

interface ApiCardSearchController {
  apiSearch: ApiSearchState<ApiCardSearchResult>
  searchFilters: CardSearchFilters
  visibleSearchResults: ApiCardSearchResult[]
  activeFilterCount: number
  hasSearchCriteria: boolean
  clearFilters: () => void
  setQuery: (value: string) => void
  updateSearchFilters: (updates: Partial<CardSearchFilters>) => void
  showNextPage: () => void
  showPreviousPage: () => void
}

export function useApiCardSearch(deckFormat: DeckFormat): ApiCardSearchController {
  const [apiSearch, setApiSearch] = useState(() => createInitialSearchState<ApiCardSearchResult>())
  const [searchFilters, setSearchFilters] = useState<CardSearchFilters>(() => ({
    ...DEFAULT_CARD_SEARCH_FILTERS,
  }))
  const searchCacheRef = useRef(loadApiSearchCache())
  const searchDebounceTimerRef = useRef<number>(0)
  const searchRequestIdRef = useRef(0)
  const remoteSearchRequest = useMemo(
    () => buildRemoteCardSearchRequest(apiSearch.query, searchFilters),
    [
      apiSearch.query,
      searchFilters.archetype,
      searchFilters.attribute,
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
  const visibleSearchResults = useMemo(
    () => applyLocalCardSearchFilters(apiSearch.results, searchFilters, deckFormat),
    [apiSearch.results, deckFormat, searchFilters],
  )

  const runApiSearch = useCallback(async (
    request: ReturnType<typeof buildRemoteCardSearchRequest>,
    page = 0,
  ) => {
    if (!hasCardSearchRequestCriteria(request)) {
      setApiSearch((current) => ({
        ...current,
        status: 'idle',
        results: [],
        page: 0,
        hasMore: false,
        errorMessage: '',
      }))
      return
    }

    const cachedResults = getCachedApiSearch(searchCacheRef.current, request, page)

    if (cachedResults) {
      setApiSearch((current) => ({
        ...current,
        status: 'success',
        errorMessage: '',
        results: sortSearchResults(cachedResults.results),
        page,
        hasMore: cachedResults.hasMore,
      }))
      return
    }

    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId

    setApiSearch((current) => ({
      ...current,
      status: 'loading',
      errorMessage: '',
      page,
    }))

    try {
      const searchPage = await searchCards(
        {
          query: request.query,
          archetype: request.archetype,
          exactType: request.exactType,
          attribute: request.attribute,
          race: request.race,
          level: request.level,
        },
        SEARCH_PAGE_SIZE,
        page * SEARCH_PAGE_SIZE,
      )

      if (searchRequestIdRef.current !== requestId) {
        return
      }

      const sortedResults = sortSearchResults(searchPage.results)
      searchCacheRef.current = storeCachedApiSearch(searchCacheRef.current, request, page, {
        savedAt: Date.now(),
        results: sortedResults,
        hasMore: searchPage.hasMore,
      })

      setApiSearch((current) => ({
        ...current,
        status: 'success',
        results: sortedResults,
        errorMessage: '',
        page,
        hasMore: searchPage.hasMore,
      }))
    } catch (error) {
      if (searchRequestIdRef.current !== requestId) {
        return
      }

      setApiSearch((current) => ({
        ...current,
        status: 'error',
        results: [],
        page,
        hasMore: false,
        errorMessage: error instanceof Error ? error.message : 'No se pudo consultar YGOPRODeck.',
      }))
    }
  }, [])

  useEffect(() => {
    window.clearTimeout(searchDebounceTimerRef.current)

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

    setApiSearch((current) =>
      current.status === 'loading' && current.page === 0
        ? current
        : {
            ...current,
            status: 'loading',
            errorMessage: '',
            page: 0,
          },
    )

    searchDebounceTimerRef.current = window.setTimeout(() => {
      void runApiSearch(remoteSearchRequest, 0)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(searchDebounceTimerRef.current)
    }
  }, [hasSearchCriteria, remoteSearchRequest, runApiSearch])

  useEffect(
    () => () => {
      window.clearTimeout(searchDebounceTimerRef.current)
    },
    [],
  )

  return {
    apiSearch,
    searchFilters,
    visibleSearchResults,
    activeFilterCount,
    hasSearchCriteria,
    clearFilters: () => {
      setSearchFilters({
        ...DEFAULT_CARD_SEARCH_FILTERS,
      })
    },
    setQuery: (value) => {
      setApiSearch((current) => ({
        ...current,
        query: value,
        page: 0,
      }))
    },
    updateSearchFilters: (updates) => {
      setSearchFilters((current) => ({
        ...current,
        ...updates,
      }))
    },
    showNextPage: () => {
      if (apiSearch.hasMore && hasSearchCriteria) {
        void runApiSearch(remoteSearchRequest, apiSearch.page + 1)
      }
    },
    showPreviousPage: () => {
      if (apiSearch.page > 0 && hasSearchCriteria) {
        void runApiSearch(remoteSearchRequest, apiSearch.page - 1)
      }
    },
  }
}
