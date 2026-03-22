import { useMemo } from 'react'

import { createPattern } from './pattern-factory'
import { toNonNegativeInteger } from './utils'
import type { CardEntry, CardGroupKey } from '../types'
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
  setRequirementGroup,
  setRequirementKind,
  setRequirementSource,
} from './patterns-slice'

interface UsePatternEditorActionsOptions {
  derivedMainCards: CardEntry[]
  defaultGroupKey: CardGroupKey | null
}

export function usePatternEditorActions({
  derivedMainCards,
  defaultGroupKey,
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
          defaultGroupKey,
        }))
      },
      setRequirementGroup(patternId, requirementId, value) {
        dispatch(setRequirementGroup({ patternId, requirementId, value }))
      },
    }),
    [defaultGroupKey, derivedMainCards, dispatch],
  )
}
