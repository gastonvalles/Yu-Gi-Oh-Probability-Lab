import type { SearchCacheEntry } from './model'
import { SEARCH_CACHE_KEY, SEARCH_CACHE_LIMIT, SEARCH_CACHE_TTL_MS } from './model'
import { isRecord, normalizeName } from './utils'
import type { ApiCardSearchResult } from '../ygoprodeck'

export function loadApiSearchCache(): Record<string, SearchCacheEntry<ApiCardSearchResult>> {
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_KEY)

    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown

    if (!isRecord(parsed)) {
      return {}
    }

    const cache: Record<string, SearchCacheEntry<ApiCardSearchResult>> = {}

    for (const [key, entry] of Object.entries(parsed)) {
      if (
        !isRecord(entry) ||
        !Array.isArray(entry.results) ||
        typeof entry.savedAt !== 'number' ||
        typeof entry.hasMore !== 'boolean'
      ) {
        continue
      }

      cache[key] = {
        savedAt: entry.savedAt,
        results: entry.results.filter(isApiCardSearchResult),
        hasMore: entry.hasMore,
      }
    }

    return cache
  } catch {
    return {}
  }
}

export function getCachedApiSearch(
  cache: Record<string, SearchCacheEntry<ApiCardSearchResult>>,
  query: string,
  page: number,
): SearchCacheEntry<ApiCardSearchResult> | null {
  const normalizedQuery = buildSearchCacheKey(query, page)
  const cachedEntry = cache[normalizedQuery]

  if (!cachedEntry) {
    return null
  }

  if (Date.now() - cachedEntry.savedAt > SEARCH_CACHE_TTL_MS) {
    delete cache[normalizedQuery]
    saveApiSearchCache(cache)
    return null
  }

  return cachedEntry
}

export function storeCachedApiSearch(
  cache: Record<string, SearchCacheEntry<ApiCardSearchResult>>,
  query: string,
  page: number,
  results: SearchCacheEntry<ApiCardSearchResult>,
): Record<string, SearchCacheEntry<ApiCardSearchResult>> {
  const nextCache = {
    ...cache,
    [buildSearchCacheKey(query, page)]: {
      savedAt: Date.now(),
      results: results.results,
      hasMore: results.hasMore,
    },
  }

  const trimmedEntries = Object.entries(nextCache)
    .sort((left, right) => right[1].savedAt - left[1].savedAt)
    .slice(0, SEARCH_CACHE_LIMIT)

  const trimmedCache = Object.fromEntries(trimmedEntries)
  saveApiSearchCache(trimmedCache)
  return trimmedCache
}

export function saveApiSearchCache(cache: Record<string, SearchCacheEntry<ApiCardSearchResult>>): void {
  try {
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache))
  } catch {
    return
  }
}

function buildSearchCacheKey(query: string, page: number): string {
  return `${normalizeName(query)}::${page}`
}

function isApiCardSearchResult(value: unknown): value is ApiCardSearchResult {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.name === 'string' &&
    typeof value.cardType === 'string' &&
    typeof value.frameType === 'string' &&
    typeof value.ygoprodeckId === 'number' &&
    isRecord(value.banlist)
  )
}
