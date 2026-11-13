import type { UnknownAction } from '@reduxjs/toolkit'
import { useMemo } from 'react'

import { createPattern } from './pattern-factory'
import { toNonNegativeInteger } from './utils'
import type { HandPattern, Matcher } from '../types'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { useAppDispatch } from './store-hooks'
import {
  addRequirementToPattern,
  appendPattern as appendPatternAction,
  removePatternFromState,
  removeRequirementFromPattern,
  replacePatterns as replacePatternsAction,
  setPatternAllowSharedCards,
  setPatternIgnoresDraw,
  setPatternRescuesCards,
  setPatternCategory,
  setPatternMatchMode,
  setPatternMinimumMatches,
  setPatternName,
  setPatternTurnContext,
  setRequirementCount,
  setRequirementDistinct,
  setRequirementMatcher,
  setRequirementKind,
} from './patterns-slice'

type PatternDispatch = (action: UnknownAction) => unknown

/** Acciones del editor de reglas sobre el store global. */
export function usePatternEditorActions(): PatternEditorActions {
  const dispatch = useAppDispatch()
  return useMemo(() => createPatternEditorActions(dispatch), [dispatch])
}

/**
 * Traduce cada edición en una acción del slice de reglas. Recibe el `dispatch` por
 * parámetro: el mismo código sirve para el store global o para un borrador local.
 */
export function createPatternEditorActions(dispatch: PatternDispatch): PatternEditorActions {
  return {
    addPattern(category) {
      const nextPattern = createPattern('', undefined, category)
      dispatch(appendPatternAction(nextPattern))
      return nextPattern.id
    },
    appendPattern(pattern: HandPattern) {
      dispatch(appendPatternAction(pattern))
    },
    removePattern(patternId) {
      dispatch(removePatternFromState(patternId))
    },
    replacePatterns(nextPatterns: HandPattern[]) {
      dispatch(replacePatternsAction(nextPatterns))
    },
    setPatternCategory(patternId, value) {
      dispatch(setPatternCategory({ patternId, value }))
    },
    setPatternName(patternId, value) {
      dispatch(setPatternName({ patternId, value }))
    },
    setPatternTurnContext(patternId, value) {
      dispatch(setPatternTurnContext({ patternId, value }))
    },
    setPatternMatchMode(patternId, value) {
      dispatch(setPatternMatchMode({ patternId, value }))
    },
    setPatternMinimumMatches(patternId, value) {
      dispatch(setPatternMinimumMatches({
        patternId,
        value: Math.max(1, toNonNegativeInteger(value, 1)),
      }))
    },
    setPatternRescuesCards(patternId, value) {
      dispatch(setPatternRescuesCards({ patternId, value }))
    },
    setPatternIgnoresDraw(patternId, value) {
      dispatch(setPatternIgnoresDraw({ patternId, value }))
    },
    setPatternAllowSharedCards(patternId, value) {
      dispatch(setPatternAllowSharedCards({ patternId, value }))
    },
    addRequirement(patternId) {
      dispatch(addRequirementToPattern({ patternId }))
    },
    removeRequirement(patternId, requirementId) {
      dispatch(removeRequirementFromPattern({ patternId, requirementId }))
    },
    setRequirementKind(patternId, requirementId, value) {
      dispatch(setRequirementKind({ patternId, requirementId, value }))
    },
    setRequirementDistinct(patternId, requirementId, value) {
      dispatch(setRequirementDistinct({ patternId, requirementId, value }))
    },
    setRequirementCount(patternId, requirementId, value) {
      dispatch(setRequirementCount({
        patternId,
        requirementId,
        value: Math.max(1, toNonNegativeInteger(value, 1)),
      }))
    },
    setRequirementMatcher(patternId, requirementId, value: Matcher | null) {
      dispatch(setRequirementMatcher({ patternId, requirementId, value }))
    },
  }
}
