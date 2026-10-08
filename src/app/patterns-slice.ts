import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { normalizeRuleName } from './pattern-presets'

import type {
  CardEntry,
  HandPattern,
  HandPatternCategory,
  Matcher,
  PatternMatchMode,
  RequirementKind,
  TurnContext,
} from '../types'
import {
  addRequirement,
  removePattern,
  removeRequirement,
  updatePatternAllowSharedCards,
  updatePatternIgnoresDraw,
  updatePatternRescuesCards,
  updatePatternCategory,
  updatePatternMatchMode,
  updatePatternMinimumMatches,
  updatePatternName,
  updatePatternTurnContext,
  updateRequirementCount,
  updateRequirementDistinct,
  updateRequirementMatcher,
  updateRequirementKind,
} from './pattern-updates'

export interface PatternsState {
  patternsSeeded: boolean
  patternsSeedVersion: number
  patterns: HandPattern[]
  disabledGenericRuleIds: string[]
  systemRuleNames: Record<string, string>
}

interface PatternPayload<T> {
  patternId: string
  value: T
}

interface RequirementPayload<T> {
  patternId: string
  requirementId: string
  value: T
}

interface CompletePatternSeedingPayload {
  patterns: HandPattern[]
  version: number
}

const initialState: PatternsState = {
  patternsSeeded: false,
  patternsSeedVersion: 0,
  patterns: [],
  disabledGenericRuleIds: [],
  systemRuleNames: {},
}

const patternsSlice = createSlice({
  name: 'patterns',
  initialState,
  reducers: {
    addRequirementToPattern(state, action: PayloadAction<{ patternId: string; derivedMainCards: CardEntry[] }>) {
      state.patterns = addRequirement(state.patterns, action.payload.patternId, action.payload.derivedMainCards)
    },
    appendPattern(state, action: PayloadAction<HandPattern>) {
      state.patterns.push(action.payload)
    },
    completePatternSeeding(state, action: PayloadAction<CompletePatternSeedingPayload>) {
      state.patterns = action.payload.patterns
      state.patternsSeeded = true
      state.patternsSeedVersion = action.payload.version
    },
    setGenericRuleEnabled(state, action: PayloadAction<{ ruleId: string; enabled: boolean }>) {
      const others = state.disabledGenericRuleIds.filter((ruleId) => ruleId !== action.payload.ruleId)
      state.disabledGenericRuleIds = action.payload.enabled ? others : [...others, action.payload.ruleId]
    },
    /** Nombre propio para una regla universal; vacío (o igual al original) vuelve al nombre del catálogo. */
    setSystemRuleName(state, action: PayloadAction<{ ruleId: string; name: string }>) {
      const name = normalizeRuleName(action.payload.name)
      const { [action.payload.ruleId]: _previous, ...others } = state.systemRuleNames
      state.systemRuleNames = name ? { ...others, [action.payload.ruleId]: name } : others
    },
    removePatternFromState(state, action: PayloadAction<string>) {
      state.patterns = removePattern(state.patterns, action.payload)
    },
    removeRequirementFromPattern(state, action: PayloadAction<{ patternId: string; requirementId: string }>) {
      state.patterns = removeRequirement(state.patterns, action.payload.patternId, action.payload.requirementId)
    },
    replacePatterns(state, action: PayloadAction<HandPattern[]>) {
      state.patterns = action.payload
    },
    setPatternAllowSharedCards(state, action: PayloadAction<PatternPayload<boolean>>) {
      state.patterns = updatePatternAllowSharedCards(state.patterns, action.payload.patternId, action.payload.value)
    },
    setPatternRescuesCards(state, action: PayloadAction<PatternPayload<boolean>>) {
      state.patterns = updatePatternRescuesCards(state.patterns, action.payload.patternId, action.payload.value)
    },
    setPatternIgnoresDraw(state, action: PayloadAction<PatternPayload<boolean>>) {
      state.patterns = updatePatternIgnoresDraw(state.patterns, action.payload.patternId, action.payload.value)
    },
    setPatternCategory(state, action: PayloadAction<PatternPayload<HandPatternCategory>>) {
      state.patterns = updatePatternCategory(state.patterns, action.payload.patternId, action.payload.value)
    },
    setPatternMatchMode(state, action: PayloadAction<PatternPayload<PatternMatchMode>>) {
      state.patterns = updatePatternMatchMode(state.patterns, action.payload.patternId, action.payload.value)
    },
    setPatternMinimumMatches(state, action: PayloadAction<PatternPayload<number>>) {
      state.patterns = updatePatternMinimumMatches(state.patterns, action.payload.patternId, action.payload.value)
    },
    setPatternName(state, action: PayloadAction<PatternPayload<string>>) {
      state.patterns = updatePatternName(state.patterns, action.payload.patternId, action.payload.value)
    },
    setPatternTurnContext(state, action: PayloadAction<PatternPayload<TurnContext>>) {
      state.patterns = updatePatternTurnContext(state.patterns, action.payload.patternId, action.payload.value)
    },
    setRequirementCount(state, action: PayloadAction<RequirementPayload<number>>) {
      state.patterns = updateRequirementCount(state.patterns, action.payload.patternId, action.payload.requirementId, action.payload.value)
    },
    setRequirementMatcher(state, action: PayloadAction<RequirementPayload<Matcher | null>>) {
      state.patterns = updateRequirementMatcher(state.patterns, action.payload.patternId, action.payload.requirementId, action.payload.value)
    },
    setRequirementDistinct(state, action: PayloadAction<RequirementPayload<boolean>>) {
      state.patterns = updateRequirementDistinct(state.patterns, action.payload.patternId, action.payload.requirementId, action.payload.value)
    },
    setRequirementKind(state, action: PayloadAction<RequirementPayload<RequirementKind>>) {
      state.patterns = updateRequirementKind(state.patterns, action.payload.patternId, action.payload.requirementId, action.payload.value)
    },
  },
})

export const {
  addRequirementToPattern,
  appendPattern,
  completePatternSeeding,
  removePatternFromState,
  removeRequirementFromPattern,
  replacePatterns,
  setGenericRuleEnabled,
  setSystemRuleName,
  setPatternAllowSharedCards,
  setPatternIgnoresDraw,
  setPatternRescuesCards,
  setPatternCategory,
  setPatternMatchMode,
  setPatternMinimumMatches,
  setPatternName,
  setPatternTurnContext,
  setRequirementCount,
  setRequirementMatcher,
  setRequirementDistinct,
  setRequirementKind,
} = patternsSlice.actions
export const patternsReducer = patternsSlice.reducer
