import { useEffect } from 'react'

import { deriveMainDeckCardsFromZone } from './calculator-state'
import { curatePatterns, getPatternCollectionSignature } from './pattern-curation'
import type { AppState } from './model'
import { getPatternMatchMode } from './patterns'
import { isLegacySystemRule } from './pattern-presets'
import { useAppDispatch } from './store-hooks'
import { completePatternSeeding, replacePatterns } from './patterns-slice'

interface PatternMaintenanceOptions {
  defaultPatternsVersion: number
  hasCompletedRoleStep: boolean
  state: AppState
}

/**
 * Mantiene sanas las reglas propias guardadas. Al subir de versión quita las copias de
 * reglas del sistema (ahora se calculan aparte) y normaliza el resto.
 */
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

    const currentSignature = getPatternCollectionSignature(state.patterns)

    if (state.patternsSeedVersion < defaultPatternsVersion) {
      const nextPatterns = curatePatterns(
        state.patterns.filter((pattern) => !isLegacySystemRule(pattern, derivedMainCards)),
        derivedMainCards,
      )

      dispatch(completePatternSeeding({
        version: defaultPatternsVersion,
        patterns: getPatternCollectionSignature(nextPatterns) === currentSignature ? state.patterns : nextPatterns,
      }))
      return
    }

    const needsMigration = state.patterns.some(
      (pattern) =>
        pattern.needsReview ||
        (pattern.kind !== 'opening' && pattern.kind !== 'problem') ||
        (pattern.reusePolicy !== 'allow' && pattern.reusePolicy !== 'forbid') ||
        (pattern.conditions.length <= 1 && getPatternMatchMode(pattern) !== 'all') ||
        (getPatternMatchMode(pattern) === 'at-least' &&
          pattern.conditions.length > 1 &&
          pattern.minimumConditionMatches < 2),
    )

    if (!needsMigration) {
      return
    }

    const nextPatterns = curatePatterns(state.patterns, derivedMainCards)

    if (getPatternCollectionSignature(nextPatterns) !== currentSignature) {
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
