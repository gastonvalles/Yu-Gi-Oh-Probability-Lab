import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { DeckFormat } from '../types'

interface SettingsState {
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
  },
})

export const { setDeckFormat } = settingsSlice.actions
export const settingsReducer = settingsSlice.reducer
