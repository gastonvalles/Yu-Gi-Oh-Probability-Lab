import { combineReducers, configureStore } from '@reduxjs/toolkit'

import type { AppState } from './model'
import { loadState, saveState } from './persistence'
import { deckBuilderReducer } from './deck-builder-slice'
import { patternsReducer } from './patterns-slice'
import { settingsReducer } from './settings-slice'

const rootReducer = combineReducers({
  settings: settingsReducer,
  deckBuilder: deckBuilderReducer,
  patterns: patternsReducer,
})

type RootStateSchema = ReturnType<typeof rootReducer>

export const store = configureStore({
  reducer: rootReducer,
  preloadedState: buildRootState(loadState()),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

function selectAppState(state: RootState): AppState {
  return {
    handSize: state.settings.handSize,
    deckFormat: state.settings.deckFormat,
    patternsSeeded: state.patterns.patternsSeeded,
    patternsSeedVersion: state.patterns.patternsSeedVersion,
    patterns: state.patterns.patterns,
    disabledGenericRuleIds: state.patterns.disabledGenericRuleIds,
    systemRuleNames: state.patterns.systemRuleNames,
    deckBuilder: state.deckBuilder,
  }
}

function buildRootState(state: AppState): RootStateSchema {
  return {
    settings: {
      handSize: state.handSize,
      deckFormat: state.deckFormat,
    },
    deckBuilder: state.deckBuilder,
    patterns: {
      patternsSeeded: state.patternsSeeded,
      patternsSeedVersion: state.patternsSeedVersion,
      patterns: state.patterns,
      disabledGenericRuleIds: state.disabledGenericRuleIds,
      systemRuleNames: state.systemRuleNames,
    },
  }
}

let saveStateTimer: number | null = null
let lastSavedState: RootState | null = null
let persisting = true

/** Antes de restaurar una copia de seguridad y recargar: lo que hay en memoria ya no debe escribirse (pisaría lo recién restaurado). */
export function stopPersisting(): void {
  persisting = false

  if (saveStateTimer !== null) {
    window.clearTimeout(saveStateTimer)
    saveStateTimer = null
  }
}

function flushSaveState(): void {
  if (!persisting || saveStateTimer === null) {
    return
  }

  window.clearTimeout(saveStateTimer)
  saveStateTimer = null

  const state = store.getState()

  if (state !== lastSavedState) {
    lastSavedState = state
    saveState(selectAppState(state))
  }
}

store.subscribe(() => {
  // Una acción que no cambió nada (reducer devolvió el mismo estado) no vale una serialización.
  if (!persisting || typeof window === 'undefined' || store.getState() === lastSavedState) {
    return
  }

  if (saveStateTimer !== null) {
    window.clearTimeout(saveStateTimer)
  }

  saveStateTimer = window.setTimeout(flushSaveState, 180)
})

// Si la pestaña se cierra antes de que venza el debounce, el último cambio no se pierde.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSaveState)
}
