import type {
  HandPattern,
  HandPatternCategory,
  Matcher,
  PatternCondition,
  PatternMatchMode,
  RequirementKind,
  TurnContext,
} from '../types'
import { createPatternRequirement } from './pattern-factory'
import {
  buildReusePolicy,
  getPatternMatchMode,
  resolvePatternLogic,
} from './patterns'

type Patch<T> = Partial<T> | ((current: T) => Partial<T>)

const applyPatch = <T>(current: T, patch: Patch<T>): T => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) })

/** Cambia una regla sin marcarla como revisada (el nombre y la categoría no cuentan como edición de la regla). */
function mapPattern(patterns: HandPattern[], patternId: string, patch: Patch<HandPattern>): HandPattern[] {
  return patterns.map((pattern) => (pattern.id !== patternId ? pattern : applyPatch(pattern, patch)))
}

/** Cambia una regla y la da por revisada. */
function editPattern(patterns: HandPattern[], patternId: string, patch: Patch<HandPattern>): HandPattern[] {
  return mapPattern(patterns, patternId, (pattern) => ({ ...applyPatch(pattern, patch), needsReview: false }))
}

function editCondition(patterns: HandPattern[], patternId: string, requirementId: string, patch: Partial<PatternCondition>): HandPattern[] {
  return editPattern(patterns, patternId, (pattern) => ({
    conditions: pattern.conditions.map((condition) => (condition.id !== requirementId ? condition : { ...condition, ...patch })),
  }))
}

export function addRequirement(patterns: HandPattern[], patternId: string): HandPattern[] {
  return editPattern(patterns, patternId, (pattern) => {
    const conditions = [...pattern.conditions, createPatternRequirement(undefined, pattern.kind)]

    return {
      ...resolvePatternLogic(getPatternMatchMode(pattern), conditions.length, pattern.minimumConditionMatches),
      conditions,
    }
  })
}

export function removeRequirement(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
): HandPattern[] {
  return editPattern(patterns, patternId, (pattern) => {
    const conditions = pattern.conditions.filter((condition) => condition.id !== requirementId)

    return {
      ...resolvePatternLogic(getPatternMatchMode(pattern), conditions.length, pattern.minimumConditionMatches),
      conditions,
    }
  })
}

export function updatePatternName(patterns: HandPattern[], patternId: string, name: string): HandPattern[] {
  return mapPattern(patterns, patternId, { name })
}

export function updatePatternTurnContext(patterns: HandPattern[], patternId: string, turnContext: TurnContext): HandPattern[] {
  return editPattern(patterns, patternId, { turnContext })
}

export function updatePatternCategory(patterns: HandPattern[], patternId: string, category: HandPatternCategory): HandPattern[] {
  return mapPattern(patterns, patternId, { kind: category })
}

export function updatePatternMatchMode(patterns: HandPattern[], patternId: string, matchMode: PatternMatchMode): HandPattern[] {
  return editPattern(patterns, patternId, (pattern) => resolvePatternLogic(matchMode, pattern.conditions.length, pattern.minimumConditionMatches))
}

export function updatePatternMinimumMatches(patterns: HandPattern[], patternId: string, minimumMatches: number): HandPattern[] {
  return editPattern(patterns, patternId, (pattern) => ({
    minimumConditionMatches:
      pattern.logic === 'all'
        ? Math.max(pattern.conditions.length, 1)
        : Math.max(1, Math.min(minimumMatches, Math.max(pattern.conditions.length, 1))),
  }))
}

export function updatePatternIgnoresDraw(patterns: HandPattern[], patternId: string, ignoresDraw: boolean): HandPattern[] {
  return editPattern(patterns, patternId, { ignoresDraw })
}

export function updatePatternRescuesCards(patterns: HandPattern[], patternId: string, rescuesCards: boolean): HandPattern[] {
  return editPattern(patterns, patternId, { rescuesCards })
}

export function updatePatternAllowSharedCards(patterns: HandPattern[], patternId: string, allowSharedCards: boolean): HandPattern[] {
  return editPattern(patterns, patternId, { reusePolicy: buildReusePolicy(allowSharedCards) })
}

export function updateRequirementKind(patterns: HandPattern[], patternId: string, requirementId: string, kind: RequirementKind): HandPattern[] {
  return editCondition(patterns, patternId, requirementId, { kind })
}

export function updateRequirementDistinct(patterns: HandPattern[], patternId: string, requirementId: string, distinct: boolean): HandPattern[] {
  return editCondition(patterns, patternId, requirementId, { distinct })
}

export function updateRequirementCount(patterns: HandPattern[], patternId: string, requirementId: string, count: number): HandPattern[] {
  return editCondition(patterns, patternId, requirementId, { quantity: count })
}

export function updateRequirementMatcher(patterns: HandPattern[], patternId: string, requirementId: string, matcher: Matcher | null): HandPattern[] {
  return editCondition(patterns, patternId, requirementId, { matcher })
}

export function removePattern(patterns: HandPattern[], patternId: string): HandPattern[] {
  return patterns.filter((pattern) => pattern.id !== patternId)
}
