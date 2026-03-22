import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { sortSearchResults } from './card-search'
import {
  createInitialSearchState,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PAGE_SIZE,
  type ApiSearchState,
} from './model'
import {
  loadApiSearchCache,
  getCachedApiSearch,
  storeCachedApiSearch,
} from './api-search-cache'
import { searchCardsByName, type ApiCardSearchResult } from '../ygoprodeck'

interface ApiCardSearchController {
  apiSearch: ApiSearchState<ApiCardSearchResult>
  searchTypeFilter: string
  searchArchetypeFilter: string
  visibleSearchResults: ApiCardSearchResult[]
  setArchetypeFilter: (value: string) => void
  setQuery: (value: string) => void
  setSearchTypeFilter: (value: string) => void
  showNextPage: () => void
  showPreviousPage: () => void
}

export function useApiCardSearch(): ApiCardSearchController {
  const [apiSearch, setApiSearch] = useState(() => createInitialSearchState<ApiCardSearchResult>())
  const [searchTypeFilter, setSearchTypeFilter] = useState('all')
  const [searchArchetypeFilter, setSearchArchetypeFilter] = useState('')
  const searchCacheRef = useRef(loadApiSearchCache())
  const searchDebounceTimerRef = useRef<number>(0)
  const searchRequestIdRef = useRef(0)

  const visibleSearchResults = useMemo(
    () =>
      apiSearch.results.filter((card) => {
        const cardType = card.cardType.toLowerCase()
        const frameType = card.frameType.toLowerCase()

        if (
          (searchTypeFilter === 'monster' && !cardType.includes('monster')) ||
          (searchTypeFilter === 'spell' && !cardType.includes('spell')) ||
          (searchTypeFilter === 'trap' && !cardType.includes('trap')) ||
          (searchTypeFilter === 'extra' &&
            !frameType.includes('fusion') &&
            !frameType.includes('synchro') &&
            !frameType.includes('xyz') &&
            !frameType.includes('link'))
        ) {
          return false
        }

        if (
          searchArchetypeFilter.trim().length > 0 &&
          !(card.archetype ?? '').toLowerCase().includes(searchArchetypeFilter.trim().toLowerCase())
        ) {
          return false
        }

        return true
      }),
    [apiSearch.results, searchArchetypeFilter, searchTypeFilter],
  )

  const runApiSearch = useCallback(async (query: string, page = 0) => {
    const trimmedQuery = query.trim()

    if (trimmedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
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

    const cachedResults = getCachedApiSearch(searchCacheRef.current, trimmedQuery, page)

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
      const searchPage = await searchCardsByName(trimmedQuery, SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE)

      if (searchRequestIdRef.current !== requestId) {
        return
      }

      const sortedResults = sortSearchResults(searchPage.results)
      searchCacheRef.current = storeCachedApiSearch(searchCacheRef.current, trimmedQuery, page, {
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

    const trimmedQuery = apiSearch.query.trim()

    if (trimmedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
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
      void runApiSearch(trimmedQuery, 0)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(searchDebounceTimerRef.current)
    }
  }, [apiSearch.query, runApiSearch])

  useEffect(
    () => () => {
      window.clearTimeout(searchDebounceTimerRef.current)
    },
    [],
  )

  return {
    apiSearch,
    searchTypeFilter,
    searchArchetypeFilter,
    visibleSearchResults,
    setArchetypeFilter: setSearchArchetypeFilter,
    setQuery: (value) => {
      setApiSearch((current) => ({
        ...current,
        query: value,
        page: 0,
      }))
    },
    setSearchTypeFilter,
    showNextPage: () => {
      if (apiSearch.hasMore) {
        void runApiSearch(apiSearch.query, apiSearch.page + 1)
      }
    },
    showPreviousPage: () => {
      if (apiSearch.page > 0) {
        void runApiSearch(apiSearch.query, apiSearch.page - 1)
      }
    },
  }
}
