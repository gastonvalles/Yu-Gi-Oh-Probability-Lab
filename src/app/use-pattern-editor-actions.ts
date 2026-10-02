import type { UnknownAction } from '@reduxjs/toolkit'
import { useMemo } from 'react'

import { createPattern } from './pattern-factory'
import { toNonNegativeInteger } from './utils'
import type { CardAttribute, CardEntry, CardGroupKey, HandPattern, Matcher } from '../types'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { useAppDispatch } from './store-hooks'
import {
  addRequirementCardToPattern,
  addRequirementToPattern,
  appendPattern as appendPatternAction,
  removePatternFromState,
  removeRequirementCardFromPattern,
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
  setRequirementAtk,
  setRequirementAttribute,
  setRequirementDef,
  setRequirementGroup,
  setRequirementKind,
  setRequirementLevel,
  setRequirementMonsterType,
  setRequirementSource,
} from './patterns-slice'

type PatternDispatch = (action: UnknownAction) => unknown

export interface PatternEditorDefaults {
  defaultAtk: number | null
  defaultAttribute: CardAttribute | null
  defaultDef: number | null
  derivedMainCards: CardEntry[]
  defaultGroupKey: CardGroupKey | null
  defaultLevel: number | null
  defaultMonsterType: string | null
}

/** Acciones del editor de reglas sobre el store global. */
export function usePatternEditorActions(defaults: PatternEditorDefaults): PatternEditorActions {
  const dispatch = useAppDispatch()
  return useMemo(() => createPatternEditorActions(dispatch, defaults), [dispatch, defaults])
}

/**
 * Traduce cada edición en una acción del slice de reglas. Recibe el `dispatch` por
 * parámetro: el mismo código sirve para el store global o para un borrador local.
 */
export function createPatternEditorActions(
  dispatch: PatternDispatch,
  {
    defaultAtk,
    defaultAttribute,
    defaultDef,
    derivedMainCards,
    defaultGroupKey,
    defaultLevel,
    defaultMonsterType,
  }: PatternEditorDefaults,
): PatternEditorActions {
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
      dispatch(addRequirementToPattern({ patternId, derivedMainCards }))
    },
    removeRequirement(patternId, requirementId) {
      dispatch(removeRequirementFromPattern({ patternId, requirementId }))
    },
    addRequirementCard(patternId, requirementId, cardId) {
      dispatch(addRequirementCardToPattern({ patternId, requirementId, cardId }))
    },
    removeRequirementCard(patternId, requirementId, cardId) {
      dispatch(removeRequirementCardFromPattern({ patternId, requirementId, cardId }))
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
    setRequirementSource(patternId, requirementId, value) {
      dispatch(setRequirementSource({
        patternId,
        requirementId,
        value,
        defaultAtk,
        defaultAttribute,
        defaultDef,
        defaultGroupKey,
        defaultLevel,
        defaultMonsterType,
      }))
    },
    setRequirementGroup(patternId, requirementId, value) {
      dispatch(setRequirementGroup({ patternId, requirementId, value }))
    },
    setRequirementAttribute(patternId, requirementId, value) {
      dispatch(setRequirementAttribute({ patternId, requirementId, value }))
    },
    setRequirementLevel(patternId, requirementId, value) {
      dispatch(setRequirementLevel({
        patternId,
        requirementId,
        value: value.trim().length === 0 ? null : Math.max(0, toNonNegativeInteger(value, 0)),
      }))
    },
    setRequirementMonsterType(patternId, requirementId, value) {
      dispatch(setRequirementMonsterType({ patternId, requirementId, value }))
    },
    setRequirementAtk(patternId, requirementId, value) {
      dispatch(setRequirementAtk({
        patternId,
        requirementId,
        value: value.trim().length === 0 ? null : Math.max(0, toNonNegativeInteger(value, 0)),
      }))
    },
    setRequirementDef(patternId, requirementId, value) {
      dispatch(setRequirementDef({
        patternId,
        requirementId,
        value: value.trim().length === 0 ? null : Math.max(0, toNonNegativeInteger(value, 0)),
      }))
    },
  }
}
