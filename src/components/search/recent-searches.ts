import { useState } from 'react'

const RECENT_SEARCHES_KEY = 'ygo-lab:recent-searches'
export const MAX_RECENT_SEARCHES = 6

/** Agrega una búsqueda al principio, sin duplicados (ignora mayúsculas) y con tope. */
export function pushRecentSearch(recent: readonly string[], query: string): string[] {
  const trimmed = query.trim()

  if (!trimmed) {
    return [...recent]
  }

  const key = trimmed.toLowerCase()
  return [trimmed, ...recent.filter((item) => item.toLowerCase() !== key)].slice(0, MAX_RECENT_SEARCHES)
}

function readRecentSearches(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT_SEARCHES) : []
  } catch {
    return []
  }
}

function writeRecentSearches(recent: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent))
  } catch {
    // Sin almacenamiento (modo privado): las recientes viven sólo en memoria.
  }
}

/** Búsquedas recientes: se guarda la consulta cuando de ella salió una carta agregada. */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>(readRecentSearches)

  const update = (next: string[]) => {
    setRecent(next)
    writeRecentSearches(next)
  }

  return {
    recent,
    remember: (query: string) => update(pushRecentSearch(recent, query)),
    clear: () => update([]),
  }
}
