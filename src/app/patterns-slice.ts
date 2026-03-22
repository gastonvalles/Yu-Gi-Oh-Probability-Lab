import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type {
  CardEntry,
  CardGroupKey,
  HandPattern,
  HandPatternCategory,
  PatternMatchMode,
  RequirementKind,
  RequirementSource,
} from '../types'
import {
  addRequirement,
  addRequirementCardToPool,
  removePattern,
  removeRequirement,
  removeRequirementCardFromPool,
  updatePatternAllowSharedCards,
  updatePatternCategory,
  updatePatternMatchMode,
  updatePatternMinimumMatches,
  updatePatternName,
  updateRequirementCount,
  updateRequirementDistinct,
  updateRequirementGroup,
  updateRequirementKind,
  updateRequirementSource,
} from './pattern-updates'

export interface PatternsState {
  patternsSeeded: boolean
  patternsSeedVersion: number
  patterns: HandPattern[]
}

interface UpdatePatternCategoryPayload {
  patternId: string
  value: HandPatternCategory
}

interface UpdatePatternNamePayload {
  patternId: string
  value: string
}

interface UpdatePatternMatchModePayload {
  patternId: string
  value: PatternMatchMode
}

interface UpdatePatternMinimumMatchesPayload {
  patternId: string
  value: number
}

interface UpdatePatternAllowSharedCardsPayload {
  patternId: string
  value: boolean
}

interface AddRequirementPayload {
  derivedMainCards: CardEntry[]
  patternId: string
}

interface RequirementCardPayload {
  cardId: string
  patternId: string
  requirementId: string
}

interface RequirementKindPayload {
  patternId: string
  requirementId: string
  value: RequirementKind
}

interface RequirementDistinctPayload {
  patternId: string
  requirementId: string
  value: boolean
}

interface RequirementCountPayload {
  patternId: string
  requirementId: string
  value: number
}

interface RequirementSourcePayload {
  defaultGroupKey: CardGroupKey | null
  patternId: string
  requirementId: string
  value: RequirementSource
}

interface RequirementGroupPayload {
  patternId: string
  requirementId: string
  value: CardGroupKey | null
}

interface CompletePatternSeedingPayload {
  patterns: HandPattern[]
  version: number
}

const initialState: PatternsState = {
  patternsSeeded: false,
  patternsSeedVersion: 0,
  patterns: [],
}

const patternsSlice = createSlice({
  name: 'patterns',
  initialState,
  reducers: {
    addRequirementToPattern(state, action: PayloadAction<AddRequirementPayload>) {
      state.patterns = addRequirement(
        state.patterns,
        action.payload.patternId,
        action.payload.derivedMainCards,
      )
    },
    appendPattern(state, action: PayloadAction<HandPattern>) {
      state.patterns.push(action.payload)
    },
    completePatternSeeding(state, action: PayloadAction<CompletePatternSeedingPayload>) {
      state.patterns = action.payload.patterns
      state.patternsSeeded = true
      state.patternsSeedVersion = action.payload.version
    },
    removePatternFromState(state, action: PayloadAction<string>) {
      state.patterns = removePattern(state.patterns, action.payload)
    },
    removeRequirementCardFromPattern(state, action: PayloadAction<RequirementCardPayload>) {
      state.patterns = removeRequirementCardFromPool(
        state.patterns,
        action.payload.patternId,
        action.payload.requirementId,
        action.payload.cardId,
      )
    },
    removeRequirementFromPattern(
      state,
      action: PayloadAction<{ patternId: string; requirementId: string }>,
    ) {
      state.patterns = removeRequirement(
        state.patterns,
        action.payload.patternId,
        action.payload.requirementId,
      )
    },
    replacePatterns(state, action: PayloadAction<HandPattern[]>) {
      state.patterns = action.payload
    },
    replacePatternsState(_state, action: PayloadAction<PatternsState>) {
      return action.payload
    },
    setPatternAllowSharedCards(
      state,
      action: PayloadAction<UpdatePatternAllowSharedCardsPayload>,
    ) {
      state.patterns = updatePatternAllowSharedCards(
        state.patterns,
        action.payload.patternId,
        action.payload.value,
      )
    },
    setPatternCategory(state, action: PayloadAction<UpdatePatternCategoryPayload>) {
      state.patterns = updatePatternCategory(
        state.patterns,
        action.payload.patternId,
        action.payload.value,
      )
    },
    setPatternMatchMode(state, action: PayloadAction<UpdatePatternMatchModePayload>) {
      state.patterns = updatePatternMatchMode(
        state.patterns,
        action.payload.patternId,
        action.payload.value,
      )
    },
    setPatternMinimumMatches(
      state,
      action: PayloadAction<UpdatePatternMinimumMatchesPayload>,
    ) {
      state.patterns = updatePatternMinimumMatches(
        state.patterns,
        action.payload.patternId,
        action.payload.value,
      )
    },
    setPatternName(state, action: PayloadAction<UpdatePatternNamePayload>) {
      state.patterns = updatePatternName(
        state.patterns,
        action.payload.patternId,
        action.payload.value,
      )
    },
    setRequirementCount(state, action: PayloadAction<RequirementCountPayload>) {
      state.patterns = updateRequirementCount(
        state.patterns,
        action.payload.patternId,
        action.payload.requirementId,
        action.payload.value,
      )
    },
    setRequirementDistinct(state, action: PayloadAction<RequirementDistinctPayload>) {
      state.patterns = updateRequirementDistinct(
        state.patterns,
        action.payload.patternId,
        action.payload.requirementId,
        action.payload.value,
      )
    },
    setRequirementGroup(state, action: PayloadAction<RequirementGroupPayload>) {
      state.patterns = updateRequirementGroup(
        state.patterns,
        action.payload.patternId,
        action.payload.requirementId,
        action.payload.value,
      )
    },
    setRequirementKind(state, action: PayloadAction<RequirementKindPayload>) {
      state.patterns = updateRequirementKind(
        state.patterns,
        action.payload.patternId,
        action.payload.requirementId,
        action.payload.value,
      )
    },
    setRequirementSource(state, action: PayloadAction<RequirementSourcePayload>) {
      state.patterns = updateRequirementSource(
        state.patterns,
        action.payload.patternId,
        action.payload.requirementId,
        action.payload.value,
        action.payload.defaultGroupKey,
      )
    },
    addRequirementCardToPattern(state, action: PayloadAction<RequirementCardPayload>) {
      state.patterns = addRequirementCardToPool(
        state.patterns,
        action.payload.patternId,
        action.payload.requirementId,
        action.payload.cardId,
      )
    },
  },
})

export const {
  addRequirementCardToPattern,
  addRequirementToPattern,
  appendPattern,
  completePatternSeeding,
  removePatternFromState,
  removeRequirementCardFromPattern,
  removeRequirementFromPattern,
  replacePatterns,
  replacePatternsState,
  setPatternAllowSharedCards,
  setPatternCategory,
  setPatternMatchMode,
  setPatternMinimumMatches,
  setPatternName,
  setRequirementCount,
  setRequirementDistinct,
  setRequirementGroup,
  setRequirementKind,
  setRequirementSource,
} = patternsSlice.actions
export const patternsReducer = patternsSlice.reducer
