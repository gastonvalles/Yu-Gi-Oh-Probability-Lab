import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { DeckBuilderState, DeckZone } from './model'
import { sortDeckCards } from './deck-sort'
import type { CardOrigin, CardRole, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import type { ClassificationSuggestion } from './classification-engine'
import {
  addSearchResultToZone,
  confirmClassificationForCard,
  reclassifyAll,
  moveDeckCard,
  removeDeckCard,
  setOriginForCard,
  toggleRoleForCard,
} from './deck-builder'

interface AddSearchResultToDeckZonePayload {
  apiCardId: number
  deckFormat: DeckFormat
  index: number
  results: ApiCardSearchResult[]
  zone: DeckZone
  overrides?: ReadonlyMap<string, ClassificationSuggestion>
}

interface MoveDeckCardPayload {
  index: number
  instanceId: string
  zone: DeckZone
}

interface ToggleDeckCardRolePayload {
  role: CardRole
  ygoprodeckId: number
}

interface SetDeckCardOriginPayload {
  origin: CardOrigin
  ygoprodeckId: number
}

const initialState: DeckBuilderState = {
  deckName: 'Nuevo Deck',
  main: [],
  extra: [],
  side: [],
  isEditingDeck: true,
}

const deckBuilderSlice = createSlice({
  name: 'deckBuilder',
  initialState,
  reducers: {
    addSearchResultToDeckZone(state, action: PayloadAction<AddSearchResultToDeckZonePayload>) {
      return addSearchResultToZone(
        state,
        action.payload.results,
        action.payload.apiCardId,
        action.payload.zone,
        action.payload.index,
        action.payload.deckFormat,
        action.payload.overrides,
      )
    },
    moveDeckCardInBuilder(state, action: PayloadAction<MoveDeckCardPayload>) {
      return moveDeckCard(
        state,
        action.payload.instanceId,
        action.payload.zone,
        action.payload.index,
      )
    },
    removeDeckCardFromBuilder(state, action: PayloadAction<string>) {
      return removeDeckCard(state, action.payload)
    },
    clearDeckZone(state, action: PayloadAction<DeckZone>) {
      state[action.payload] = []
    },
    sortDeckZone(state, action: PayloadAction<DeckZone>) {
      state[action.payload] = sortDeckCards(state[action.payload])
    },
    sortAllDeckZones(state) {
      state.main = sortDeckCards(state.main)
      state.extra = sortDeckCards(state.extra)
      state.side = sortDeckCards(state.side)
    },
    clearAllDeckZones(state) {
      state.main = []
      state.extra = []
      state.side = []
    },
    replaceDeckBuilder(_state, action: PayloadAction<DeckBuilderState>) {
      return action.payload
    },
    setDeckName(state, action: PayloadAction<string>) {
      state.deckName = action.payload
    },
    setDeckCardOrigin(state, action: PayloadAction<SetDeckCardOriginPayload>) {
      return setOriginForCard(state, action.payload.ygoprodeckId, action.payload.origin)
    },
    toggleDeckCardRole(state, action: PayloadAction<ToggleDeckCardRolePayload>) {
      return toggleRoleForCard(state, action.payload.ygoprodeckId, action.payload.role)
    },
    confirmDeckCardClassification(state, action: PayloadAction<number>) {
      return confirmClassificationForCard(state, action.payload)
    },
    setIsEditingDeck(state, action: PayloadAction<boolean>) {
      state.isEditingDeck = action.payload
    },
    reclassifyAllCards(state, action: PayloadAction<{ overrides?: ReadonlyMap<string, ClassificationSuggestion> } | undefined>) {
      return reclassifyAll(state, action.payload?.overrides)
    },
  },
})

export const {
  addSearchResultToDeckZone,
  confirmDeckCardClassification,
  reclassifyAllCards,
  clearAllDeckZones,
  clearDeckZone,
  sortDeckZone,
  sortAllDeckZones,
  moveDeckCardInBuilder,
  removeDeckCardFromBuilder,
  replaceDeckBuilder,
  setDeckCardOrigin,
  setDeckName,
  setIsEditingDeck,
  toggleDeckCardRole,
} = deckBuilderSlice.actions
export const deckBuilderReducer = deckBuilderSlice.reducer
