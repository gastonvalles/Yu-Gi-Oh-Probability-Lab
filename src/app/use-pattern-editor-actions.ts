import { useMemo } from 'react'

import { createPattern } from './pattern-factory'
import { toNonNegativeInteger } from './utils'
import type { CardAttribute, CardEntry, CardGroupKey } from '../types'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { useAppDispatch } from './store-hooks'
import {
  addRequirementCardToPattern,
  addRequirementToPattern,
  appendPattern,
  removePatternFromState,
  removeRequirementCardFromPattern,
  removeRequirementFromPattern,
  setPatternAllowSharedCards,
  setPatternCategory,
  setPatternMatchMode,
  setPatternMinimumMatches,
  setPatternName,
  setRequirementCount,
  setRequirementDistinct,
  setRequirementAtk,
  setRequirementAttribute,
  setRequirementDef,
  setRequirementGroup,
  setRequirementKind,
  setRequirementLevel,
  setRequirementMonsterType,
  setRequirementSource,
} from './patterns-slice'

interface UsePatternEditorActionsOptions {
  defaultAtk: number | null
  defaultAttribute: CardAttribute | null
  defaultDef: number | null
  derivedMainCards: CardEntry[]
  defaultGroupKey: CardGroupKey | null
  defaultLevel: number | null
  defaultMonsterType: string | null
}

export function usePatternEditorActions({
  defaultAtk,
  defaultAttribute,
  defaultDef,
  derivedMainCards,
  defaultGroupKey,
  defaultLevel,
  defaultMonsterType,
}: UsePatternEditorActionsOptions): PatternEditorActions {
  const dispatch = useAppDispatch()

  return useMemo(
    () => ({
      addPattern(category) {
        const nextPattern = createPattern('', undefined, category)
        dispatch(appendPattern(nextPattern))
        return nextPattern.id
      },
      removePattern(patternId) {
        dispatch(removePatternFromState(patternId))
      },
      setPatternCategory(patternId, value) {
        dispatch(setPatternCategory({ patternId, value }))
      },
      setPatternName(patternId, value) {
        dispatch(setPatternName({ patternId, value }))
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
    }),
    [
      defaultAtk,
      defaultAttribute,
      defaultDef,
      defaultGroupKey,
      defaultLevel,
      defaultMonsterType,
      derivedMainCards,
      dispatch,
    ],
  )
}
