import { useEffect } from 'react'

import { buildDefaultPatterns } from './pattern-defaults'
import {
  buildReusePolicy,
  getPatternDefinitionKey,
  getPatternMatchMode,
  normalizeHandPatternCategory,
  resolvePatternLogic,
} from './patterns'
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

    const defaultPatterns = buildDefaultPatterns()
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
      (pattern) => pattern.kind !== 'opening' && pattern.kind !== 'problem',
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

    dispatch(replacePatterns(state.patterns.map((pattern) => ({
        ...pattern,
        kind: normalizeHandPatternCategory(pattern.kind),
        ...resolvePatternLogic(
          pattern.conditions.length <= 1 ? 'all' : getPatternMatchMode(pattern),
          pattern.conditions.length,
          pattern.minimumConditionMatches,
        ),
        reusePolicy: buildReusePolicy(pattern.reusePolicy === 'allow'),
      }))))
  }, [dispatch, state.patterns])
}
