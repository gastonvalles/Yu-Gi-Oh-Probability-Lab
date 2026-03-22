import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { CalculatorMode } from './model'
import type { DeckFormat } from '../types'

export interface SettingsState {
  mode: CalculatorMode
  handSize: number
  deckFormat: DeckFormat
}

const initialState: SettingsState = {
  mode: 'deck',
  handSize: 5,
  deckFormat: 'unlimited',
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setDeckFormat(state, action: PayloadAction<DeckFormat>) {
      state.deckFormat = action.payload
    },
    setHandSize(state, action: PayloadAction<number>) {
      state.handSize = action.payload
    },
    setMode(state, action: PayloadAction<CalculatorMode>) {
      state.mode = action.payload
    },
  },
})

export const { setDeckFormat, setHandSize, setMode } = settingsSlice.actions
export const settingsReducer = settingsSlice.reducer
