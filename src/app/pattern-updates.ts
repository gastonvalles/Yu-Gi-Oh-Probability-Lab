import type {
  CardEntry,
  HandPattern,
  HandPatternCategory,
  Matcher,
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

export function addRequirement(
  patterns: HandPattern[],
  patternId: string,
  _derivedMainCards: CardEntry[],
): HandPattern[] {
  return patterns.map((pattern) => {
    if (pattern.id !== patternId) {
      return pattern
    }

    const conditions = [...pattern.conditions, createPatternRequirement(undefined, pattern.kind)]
    const currentMode = getPatternMatchMode(pattern)
    const nextLogic = resolvePatternLogic(currentMode, conditions.length, pattern.minimumConditionMatches)

    return {
      ...pattern,
      ...nextLogic,
      needsReview: false,
      conditions,
    }
  })
}

export function removeRequirement(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
): HandPattern[] {
  return patterns.map((pattern) => {
    if (pattern.id !== patternId) {
      return pattern
    }

    const conditions = pattern.conditions.filter((condition) => condition.id !== requirementId)

    return {
      ...pattern,
      ...resolvePatternLogic(getPatternMatchMode(pattern), conditions.length, pattern.minimumConditionMatches),
      needsReview: false,
      conditions,
    }
  })
}

export function updatePatternName(
  patterns: HandPattern[],
  patternId: string,
  name: string,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          name,
        },
  )
}

export function updatePatternTurnContext(
  patterns: HandPattern[],
  patternId: string,
  turnContext: TurnContext,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          needsReview: false,
          turnContext,
        },
  )
}

export function updatePatternCategory(
  patterns: HandPattern[],
  patternId: string,
  category: HandPatternCategory,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          kind: category,
        },
  )
}

export function updatePatternMatchMode(
  patterns: HandPattern[],
  patternId: string,
  matchMode: PatternMatchMode,
): HandPattern[] {
  return patterns.map((pattern) => {
    if (pattern.id !== patternId) {
      return pattern
    }

    return {
      ...pattern,
      ...resolvePatternLogic(matchMode, pattern.conditions.length, pattern.minimumConditionMatches),
      needsReview: false,
    }
  })
}

export function updatePatternMinimumMatches(
  patterns: HandPattern[],
  patternId: string,
  minimumMatches: number,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          needsReview: false,
          minimumConditionMatches:
            pattern.logic === 'all'
              ? Math.max(pattern.conditions.length, 1)
              : Math.max(1, Math.min(minimumMatches, Math.max(pattern.conditions.length, 1))),
        },
  )
}

export function updatePatternIgnoresDraw(
  patterns: HandPattern[],
  patternId: string,
  ignoresDraw: boolean,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId ? pattern : { ...pattern, needsReview: false, ignoresDraw },
  )
}

export function updatePatternRescuesCards(
  patterns: HandPattern[],
  patternId: string,
  rescuesCards: boolean,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId ? pattern : { ...pattern, needsReview: false, rescuesCards },
  )
}

export function updatePatternAllowSharedCards(
  patterns: HandPattern[],
  patternId: string,
  allowSharedCards: boolean,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          needsReview: false,
          reusePolicy: buildReusePolicy(allowSharedCards),
        },
  )
}

export function updateRequirementKind(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  kind: RequirementKind,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          needsReview: false,
          conditions: pattern.conditions.map((condition) =>
            condition.id !== requirementId
              ? condition
              : {
                  ...condition,
                  kind,
                },
          ),
        },
  )
}

export function updateRequirementDistinct(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  distinct: boolean,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          needsReview: false,
          conditions: pattern.conditions.map((condition) =>
            condition.id !== requirementId
              ? condition
              : {
                  ...condition,
                  distinct,
                },
          ),
        },
  )
}

export function updateRequirementCount(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  count: number,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          needsReview: false,
          conditions: pattern.conditions.map((condition) =>
            condition.id !== requirementId
              ? condition
              : {
                  ...condition,
                  quantity: count,
                },
          ),
        },
  )
}

export function updateRequirementMatcher(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  matcher: Matcher | null,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          needsReview: false,
          conditions: pattern.conditions.map((condition) =>
            condition.id !== requirementId
              ? condition
              : {
                  ...condition,
                  matcher,
                },
          ),
        },
  )
}

export function removePattern(patterns: HandPattern[], patternId: string): HandPattern[] {
  return patterns.filter((pattern) => pattern.id !== patternId)
}
