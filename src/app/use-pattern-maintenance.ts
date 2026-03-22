import { useEffect } from 'react'

import { buildDerivedDeckGroups } from './deck-groups'
import { deriveMainDeckCardsFromZone } from './calculator-state'
import { buildDefaultPatternsFromGroups } from './pattern-defaults'
import { getPatternDefinitionKey, normalizeHandPatternCategory } from './patterns'
import type { AppState } from './model'
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

  useEffect(() => {
    if (!hasCompletedRoleStep || state.patternsSeedVersion >= defaultPatternsVersion) {
      return
    }

    const currentDerivedMainCards = deriveMainDeckCardsFromZone(state.deckBuilder.main)
    const currentDerivedGroups = buildDerivedDeckGroups(currentDerivedMainCards)
    const defaultPatterns = buildDefaultPatternsFromGroups(currentDerivedGroups)
    const existingPatternKeys = new Set(state.patterns.map((pattern) => getPatternDefinitionKey(pattern)))
    const missingDefaults = defaultPatterns.filter(
      (pattern) => !existingPatternKeys.has(getPatternDefinitionKey(pattern)),
    )

    dispatch(completePatternSeeding({
      version: defaultPatternsVersion,
      patterns: [...state.patterns, ...missingDefaults],
    }))
  }, [defaultPatternsVersion, dispatch, hasCompletedRoleStep, state.deckBuilder.main, state.patterns, state.patternsSeedVersion])

  useEffect(() => {
    const needsPatternMigration = state.patterns.some(
      (pattern) => pattern.category !== 'good' && pattern.category !== 'bad',
    )

    const needsMatchModeMigration = state.patterns.some(
      (pattern) =>
        (pattern.requirements.length <= 1 && pattern.matchMode !== 'all') ||
        (pattern.matchMode === 'at-least' && pattern.requirements.length > 1 && pattern.minimumMatches < 2),
    )

    const needsSharedCardsMigration = state.patterns.some(
      (pattern) => typeof pattern.allowSharedCards !== 'boolean',
    )

    if (!needsPatternMigration && !needsMatchModeMigration && !needsSharedCardsMigration) {
      return
    }

    dispatch(replacePatterns(state.patterns.map((pattern) => ({
        ...pattern,
        category: normalizeHandPatternCategory(pattern.category),
        matchMode:
          pattern.requirements.length <= 1
            ? 'all'
            : pattern.matchMode,
        allowSharedCards: pattern.allowSharedCards === true,
        minimumMatches:
          pattern.requirements.length <= 1
            ? 1
            : pattern.matchMode === 'all'
              ? pattern.requirements.length
              : pattern.matchMode === 'any'
                ? 1
                : Math.max(2, Math.min(pattern.minimumMatches, pattern.requirements.length)),
      }))))
  }, [dispatch, state.patterns])
}
