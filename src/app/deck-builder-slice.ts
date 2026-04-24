import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { DeckBuilderState, DeckZone } from './model'
import type { CardOrigin, CardRole, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import type { ClassificationSuggestion } from './classification-engine'
import {
  addSearchResultToDefaultZone,
  addSearchResultToZone,
  classifyAllUnclassified,
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

interface AddSearchResultToDefaultDeckZonePayload {
  apiCardId: number
  deckFormat: DeckFormat
  results: ApiCardSearchResult[]
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
    addSearchResultToDefaultDeckZone(
      state,
      action: PayloadAction<AddSearchResultToDefaultDeckZonePayload>,
    ) {
      return addSearchResultToDefaultZone(
        state,
        action.payload.results,
        action.payload.apiCardId,
        action.payload.deckFormat,
        action.payload.overrides,
      )
    },
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
    setIsEditingDeck(state, action: PayloadAction<boolean>) {
      state.isEditingDeck = action.payload
    },
    classifyAllUnclassifiedCards(state, action: PayloadAction<{ overrides?: ReadonlyMap<string, ClassificationSuggestion> } | undefined>) {
      return classifyAllUnclassified(state, action.payload?.overrides)
    },
    reclassifyAllCards(state, action: PayloadAction<{ overrides?: ReadonlyMap<string, ClassificationSuggestion> } | undefined>) {
      return reclassifyAll(state, action.payload?.overrides)
    },
  },
})

export const {
  addSearchResultToDeckZone,
  addSearchResultToDefaultDeckZone,
  classifyAllUnclassifiedCards,
  reclassifyAllCards,
  clearDeckZone,
  moveDeckCardInBuilder,
  removeDeckCardFromBuilder,
  replaceDeckBuilder,
  setDeckCardOrigin,
  setDeckName,
  setIsEditingDeck,
  toggleDeckCardRole,
} = deckBuilderSlice.actions
export const deckBuilderReducer = deckBuilderSlice.reducer
