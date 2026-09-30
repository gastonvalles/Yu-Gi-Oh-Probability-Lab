import type { CardEntry } from '../types'

const CARD_NAMES_KEY = 'ygo-lab:card-names'
const CARD_ID_PREFIX = 'card-'

/**
 * Nombres de cartas que pasaron por el deck. Las reglas guardan sólo el id: si la carta
 * sale del deck, esto permite seguir mostrando su nombre en vez de "Carta eliminada".
 */
export function readCardNames(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CARD_NAMES_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function rememberCardNames(entries: ReadonlyArray<{ id: string; name: string }>): Record<string, string> {
  const known = readCardNames()
  const fresh = entries.filter((entry) => entry.name.trim() && known[entry.id] !== entry.name)

  if (fresh.length === 0) {
    return known
  }

  const next = { ...known, ...Object.fromEntries(fresh.map((entry) => [entry.id, entry.name])) }

  try {
    localStorage.setItem(CARD_NAMES_KEY, JSON.stringify(next))
  } catch {
    // Sin almacenamiento: los nombres viven sólo en esta sesión.
  }

  return next
}

export function parseYgoprodeckId(cardId: string): number | null {
  if (!cardId.startsWith(CARD_ID_PREFIX)) {
    return null
  }

  const id = Number(cardId.slice(CARD_ID_PREFIX.length))
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Entrada "fantasma" (0 copias) sólo para mostrar el nombre de una carta que ya no está. */
export function createAbsentCardEntry(id: string, name: string): CardEntry {
  return {
    id,
    name: `${name} (fuera del deck)`,
    copies: 0,
    source: 'manual',
    apiCard: null,
    origin: null,
    roles: [],
    needsReview: false,
  }
}
