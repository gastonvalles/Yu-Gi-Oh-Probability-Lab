import { useEffect } from 'react'

import { deriveMainDeckCardsFromZone } from './calculator-state'
import { curatePatterns, getPatternCollectionSignature } from './pattern-curation'
import type { AppState } from './model'
import { getPatternMatchMode } from './patterns'
import { useAppDispatch } from './store-hooks'
import { completePatternSeeding, replacePatterns } from './patterns-slice'

interface PatternMaintenanceOptions {
  defaultPatternsVersion: number
  hasCompletedRoleStep: boolean
  state: AppState
}

export function usePatternMaintenance({
  defaultPatternsVersion,
  hasCompletedRoleStep,
  state,
}: PatternMaintenanceOptions): void {
  const dispatch = useAppDispatch()
  const derivedMainCards = deriveMainDeckCardsFromZone(state.deckBuilder.main)

  useEffect(() => {
    if (!hasCompletedRoleStep) {
      return
    }

    if (state.patternsSeedVersion < defaultPatternsVersion) {
      const nextPatterns = curatePatterns(state.patterns, derivedMainCards, {
        includeDefaults: true,
      })
      const currentSignature = getPatternCollectionSignature(state.patterns)
      const nextSignature = getPatternCollectionSignature(nextPatterns)

      dispatch(completePatternSeeding({
        version: defaultPatternsVersion,
        patterns: nextSignature === currentSignature ? state.patterns : nextPatterns,
      }))
      return
    }

    const needsPatternMigration = state.patterns.some(
      (pattern) =>
        pattern.needsReview ||
        (pattern.kind !== 'opening' && pattern.kind !== 'problem'),
    )

    const needsMatchModeMigration = state.patterns.some(
      (pattern) =>
        (pattern.conditions.length <= 1 && getPatternMatchMode(pattern) !== 'all') ||
        (getPatternMatchMode(pattern) === 'at-least' &&
          pattern.conditions.length > 1 &&
          pattern.minimumConditionMatches < 2),
    )

    const needsSharedCardsMigration = state.patterns.some(
      (pattern) => pattern.reusePolicy !== 'allow' && pattern.reusePolicy !== 'forbid',
    )

    if (!needsPatternMigration && !needsMatchModeMigration && !needsSharedCardsMigration) {
      return
    }

    const nextPatterns = curatePatterns(state.patterns, derivedMainCards, {
      includeDefaults: false,
    })
    const currentSignature = getPatternCollectionSignature(state.patterns)
    const nextSignature = getPatternCollectionSignature(nextPatterns)

    if (nextSignature !== currentSignature) {
      dispatch(replacePatterns(nextPatterns))
    }
  }, [
    defaultPatternsVersion,
    derivedMainCards,
    dispatch,
    hasCompletedRoleStep,
    state.patterns,
    state.patternsSeedVersion,
  ])
}
