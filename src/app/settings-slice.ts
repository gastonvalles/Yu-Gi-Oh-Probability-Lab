import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { DeckFormat } from '../types'

export interface SettingsState {
  handSize: number
  deckFormat: DeckFormat
}

const initialState: SettingsState = {
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
  },
})

export const { setDeckFormat, setHandSize } = settingsSlice.actions
export const settingsReducer = settingsSlice.reducer
