import type { AppState } from './model'
import { createInitialState, STORAGE_KEY } from './model'
import { fromPortableConfig, toPortableConfig } from './app-state-codec'

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return createInitialState()
    }

    return fromPortableConfig(JSON.parse(raw))
  } catch {
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
