import type { AppState } from './model'
import { createInitialState, CLASSIFICATION_OVERRIDES_KEY, SEARCH_CACHE_KEY, STORAGE_KEY } from './model'
import { LAB_CACHE_KEY } from './lab-cache-store'
import { fromPortableConfig, toPortableConfig } from './app-state-codec'
import { normalizeCardNameForLookup, type ClassificationSuggestion } from './classification-engine'
import { invalidateClassificationOverridesCache } from './classification-overrides'
import { normalizeStoredRoles, resolveStoredCardOrigin } from './deck-groups'

const BACKUP_KEY = `${STORAGE_KEY}:backup`

export function loadState(): AppState {
  let raw: string | null = null

  try {
    raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return createInitialState()
    }

    return fromPortableConfig(JSON.parse(raw))
  } catch {
    // El estado guardado no se pudo leer: se conserva una copia antes de que el próximo guardado lo pise.
    try {
      if (raw) localStorage.setItem(BACKUP_KEY, raw)
    } catch { /* sin espacio: no hay más que hacer */ }

    return createInitialState()
  }
}

/** Se dispara (una vez por sesión) cuando el navegador no deja guardar ni después de liberar las cachés. */
export const STORAGE_FULL_EVENT = 'ygo:storage-full'
let storageFullNotified = false

export function saveState(state: AppState): void {
  const payload = JSON.stringify(toPortableConfig(state))

  if (tryWrite(STORAGE_KEY, payload)) {
    return
  }

  // Sin espacio: las cachés se pueden recalcular, el deck y las reglas no. Se liberan y se reintenta una vez.
  for (const key of [SEARCH_CACHE_KEY, LAB_CACHE_KEY]) {
    try {
      localStorage.removeItem(key)
    } catch { /* sin acceso al almacenamiento: nada que liberar */ }
  }

  if (!tryWrite(STORAGE_KEY, payload) && !storageFullNotified && typeof window !== 'undefined') {
    storageFullNotified = true
    window.dispatchEvent(new Event(STORAGE_FULL_EVENT))
  }
}

function tryWrite(key: string, payload: string): boolean {
  try {
    localStorage.setItem(key, payload)
    return true
  } catch {
    return false
  }
}

/** Último recurso ante una app que no arranca: copia el estado principal a `:backup` y borra todo lo guardado por la app. */
export function resetPersistedState(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw) {
      localStorage.setItem(BACKUP_KEY, raw)
    }

    for (const key of Object.keys(localStorage)) {
      if (key !== BACKUP_KEY && (key.startsWith('ygo-probability-lab:') || key.startsWith('ygo-lab'))) {
        localStorage.removeItem(key)
      }
    }
  } catch { /* sin acceso al almacenamiento: no hay nada que borrar */ }
}

export function loadClassificationOverrides(): Map<string, ClassificationSuggestion> {
  try {
    const raw = localStorage.getItem(CLASSIFICATION_OVERRIDES_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Map()
    const overrides = new Map<string, ClassificationSuggestion>()

    for (const entry of parsed as unknown[]) {
      if (!Array.isArray(entry)) continue

      const [key, val] = entry as unknown[]

      if (typeof key !== 'string' || !val || typeof val !== 'object' || !('origin' in val) || !('roles' in val)) {
        continue
      }

      // Roles u orígenes que ya no existen (Handtrap, Hybrid…) pasan a su equivalente.
      const roles = normalizeStoredRoles(val.roles)
      const origin = resolveStoredCardOrigin(val.origin, roles)

      if (origin) {
        overrides.set(key, { origin, roles })
      }
    }

    return overrides
  } catch {
    return new Map()
  }
}

function saveClassificationOverrides(map: ReadonlyMap<string, ClassificationSuggestion>): void {
  try {
    localStorage.setItem(CLASSIFICATION_OVERRIDES_KEY, JSON.stringify([...map.entries()]))
  } catch { /* ignore quota errors */ }
}

export function saveClassificationOverride(name: string, suggestion: ClassificationSuggestion): void {
  const map = loadClassificationOverrides()
  map.set(normalizeCardNameForLookup(name), { origin: suggestion.origin, roles: [...suggestion.roles] })
  saveClassificationOverrides(map)
  invalidateClassificationOverridesCache()
}

/** Olvida lo que confirmaste o corregiste de esas cartas: la próxima sugerencia vuelve a salir de las reglas. */
export function removeClassificationOverrides(names: Iterable<string>): void {
  const map = loadClassificationOverrides()

  for (const name of names) {
    map.delete(normalizeCardNameForLookup(name))
  }

  saveClassificationOverrides(map)
  invalidateClassificationOverridesCache()
}
