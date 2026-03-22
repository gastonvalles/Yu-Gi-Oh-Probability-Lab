import { combineReducers, configureStore, createAction } from '@reduxjs/toolkit'

import type { AppState, DeckBuilderState } from './model'
import { loadState, saveState } from './persistence'
import { deckBuilderReducer, replaceDeckBuilder } from './deck-builder-slice'
import { patternsReducer, replacePatternsState, type PatternsState } from './patterns-slice'
import { settingsReducer, type SettingsState } from './settings-slice'

export interface RootStateSchema {
  deckBuilder: DeckBuilderState
  patterns: PatternsState
  settings: SettingsState
}

export const replaceAppState = createAction<AppState>('app/replaceState')

const combinedReducer = combineReducers({
  settings: settingsReducer,
  deckBuilder: deckBuilderReducer,
  patterns: patternsReducer,
})

const rootReducer = (
  state: RootStateSchema | undefined,
  action: ReturnType<typeof replaceAppState> | Parameters<typeof combinedReducer>[1],
): RootStateSchema => {
  if (replaceAppState.match(action)) {
    return buildRootState(action.payload)
  }

  return combinedReducer(state, action)
}

export const store = configureStore({
  reducer: rootReducer,
  preloadedState: buildRootState(loadState()),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export function selectAppState(state: RootState): AppState {
  return {
    mode: state.settings.mode,
    handSize: state.settings.handSize,
    deckFormat: state.settings.deckFormat,
    patternsSeeded: state.patterns.patternsSeeded,
    patternsSeedVersion: state.patterns.patternsSeedVersion,
    patterns: state.patterns.patterns,
    deckBuilder: state.deckBuilder,
  }
}

function buildRootState(state: AppState): RootStateSchema {
  return {
    settings: {
      mode: state.mode,
      handSize: state.handSize,
      deckFormat: state.deckFormat,
    },
    deckBuilder: state.deckBuilder,
    patterns: {
      patternsSeeded: state.patternsSeeded,
      patternsSeedVersion: state.patternsSeedVersion,
      patterns: state.patterns,
    },
  }
}

let saveStateTimer: number | null = null

store.subscribe(() => {
  if (typeof window === 'undefined') {
    return
  }

  if (saveStateTimer !== null) {
    window.clearTimeout(saveStateTimer)
  }

  saveStateTimer = window.setTimeout(() => {
    saveState(selectAppState(store.getState()))
    saveStateTimer = null
  }, 180)
})

export { replaceDeckBuilder, replacePatternsState }
