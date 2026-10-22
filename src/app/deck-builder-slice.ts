import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { createInitialState, type DeckBuilderState, type DeckZone } from './model'
import { sortDeckCards } from './deck-sort'
import type { CardOrigin, CardRole, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { getClassificationOverrides } from './classification-overrides'
import {
  addSearchResultToZone,
  confirmAllClassifications,
  confirmClassificationForCard,
  reclassifyAll,
  moveDeckCard,
  removeDeckCard,
  resuggestAll,
  setOriginForCard,
  toggleRoleForCard,
} from './deck-builder'

interface AddSearchResultToDeckZonePayload {
  apiCardId: number
  deckFormat: DeckFormat
  index: number
  results: ApiCardSearchResult[]
  zone: DeckZone
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

/**
 * Cómo cuenta para «Tu deck de antes» (`deck-before.ts`) un cambio de cartas hecho desde otra pantalla: como una edición del builder
 * («Aplicar al deck» del Lab), como un reemplazo del deck (cargar una build: igual que importar) o como un Deshacer, que no se cuenta.
 */
export type DeckCardsChange = 'edit' | 'replace' | 'restore'

interface SetDeckCardsPayload {
  zones: Pick<DeckBuilderState, DeckZone>
  /** Si viene, el deck pasa a llamarse así (cargar una build trae su nombre). */
  deckName?: string
  as: DeckCardsChange
}

const deckBuilderSlice = createSlice({
  name: 'deckBuilder',
  // Perezoso: el nombre por defecto sale en el idioma de ese momento (nunca se arma texto al evaluar el módulo).
  initialState: (): DeckBuilderState => createInitialState().deckBuilder,
  reducers: {
    addSearchResultToDeckZone(state, action: PayloadAction<AddSearchResultToDeckZonePayload>) {
      return addSearchResultToZone(
        state,
        action.payload.results,
        action.payload.apiCardId,
        action.payload.zone,
        action.payload.index,
        action.payload.deckFormat,
        getClassificationOverrides(),
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
    /** Las cartas del deck desde el Lab o Comparar (ver `deck-change-actions.ts`); el resto del estado queda igual. */
    setDeckCards(state, action: PayloadAction<SetDeckCardsPayload>) {
      state.main = action.payload.zones.main
      state.extra = action.payload.zones.extra
      state.side = action.payload.zones.side

      if (action.payload.deckName !== undefined) {
        state.deckName = action.payload.deckName
      }
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
    confirmAllDeckCardClassifications(state) {
      return confirmAllClassifications(state)
    },
    setIsEditingDeck(state, action: PayloadAction<boolean>) {
      state.isEditingDeck = action.payload
    },
    reclassifyAllCards(state) {
      // Los overrides salen del caché del módulo: un Map en el payload no es serializable (RTK lo avisa en dev).
      return reclassifyAll(state, getClassificationOverrides())
    },
    resuggestAllCards(state) {
      return resuggestAll(state)
    },
  },
})

export const {
  addSearchResultToDeckZone,
  confirmAllDeckCardClassifications,
  confirmDeckCardClassification,
  reclassifyAllCards,
  resuggestAllCards,
  clearAllDeckZones,
  sortAllDeckZones,
  moveDeckCardInBuilder,
  removeDeckCardFromBuilder,
  replaceDeckBuilder,
  setDeckCards,
  setDeckCardOrigin,
  setDeckName,
  setIsEditingDeck,
  toggleDeckCardRole,
} = deckBuilderSlice.actions
export const deckBuilderReducer = deckBuilderSlice.reducer
