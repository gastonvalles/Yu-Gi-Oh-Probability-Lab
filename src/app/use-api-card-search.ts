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
  isLoadingMore: boolean
  clearFilters: () => void
  setQuery: (value: string) => void
  updateSearchFilters: (updates: Partial<CardSearchFilters>) => void
  loadMoreResults: () => void
}

export function useApiCardSearch(deckFormat: DeckFormat): ApiCardSearchController {
  const [apiSearch, setApiSearch] = useState(() => createInitialSearchState<ApiCardSearchResult>())
  const [searchFilters, setSearchFilters] = useState<CardSearchFilters>(() => ({
    ...DEFAULT_CARD_SEARCH_FILTERS,
  }))
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const searchCacheRef = useRef(loadApiSearchCache())
  const searchDebounceTimerRef = useRef<number>(0)
  const searchRequestIdRef = useRef(0)
  const remoteSearchRequest = useMemo(
    () => buildRemoteCardSearchRequest(apiSearch.query, searchFilters, deckFormat),
    [
      deckFormat,
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
          ? mergeSearchResults(current.results, cachedResults.results)
          : sortSearchResults(cachedResults.results),
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

      const sortedResults = sortSearchResults(searchPage.results)
      searchCacheRef.current = storeCachedApiSearch(searchCacheRef.current, request, page, {
        savedAt: Date.now(),
        results: sortedResults,
        hasMore: searchPage.hasMore,
      })
      setIsLoadingMore(false)

      setApiSearch((current) => ({
        ...current,
        status: 'success',
        results: append ? mergeSearchResults(current.results, sortedResults) : sortedResults,
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
        setApiSearch((current) => ({
          ...current,
          hasMore: false,
        }))
        return
      }

      setApiSearch((current) => ({
        ...current,
        status: 'error',
        results: [],
        requestId,
        page,
        hasMore: false,
        errorMessage: error instanceof Error ? error.message : 'No se pudo consultar YGOPRODeck.',
      }))
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
    deckFormat,
    hasSearchCriteria,
    remoteSearchRequest,
    runApiSearch,
    searchFilters.description,
    searchFilters.legalOnly,
    searchFilters.quickType,
  ])

  useEffect(
    () => () => {
      window.clearTimeout(searchDebounceTimerRef.current)
    },
    [],
  )

  const loadMoreResults = useCallback(() => {
    if (
      apiSearch.status !== 'success' ||
      isLoadingMore ||
      !apiSearch.hasMore ||
      !hasSearchCriteria
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
    remoteSearchRequest,
    runApiSearch,
  ])

  return {
    apiSearch,
    searchFilters,
    visibleSearchResults,
    activeFilterCount,
    hasSearchCriteria,
    isLoadingMore,
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
    loadMoreResults,
  }
}

function mergeSearchResults(
  currentResults: ApiCardSearchResult[],
  nextResults: ApiCardSearchResult[],
): ApiCardSearchResult[] {
  const mergedResults = new Map<number, ApiCardSearchResult>()

  for (const card of currentResults) {
    mergedResults.set(card.ygoprodeckId, card)
  }

  for (const card of nextResults) {
    mergedResults.set(card.ygoprodeckId, card)
  }

  return sortSearchResults([...mergedResults.values()])
}
