import type { AppState } from './model'
import { createInitialState, CLASSIFICATION_OVERRIDES_KEY, STORAGE_KEY } from './model'
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

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPortableConfig(state)))
  } catch {
    return
  }
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
