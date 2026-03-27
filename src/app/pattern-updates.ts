import type {
  CardAttribute,
  CardEntry,
  CardGroupKey,
  HandPattern,
  HandPatternCategory,
  Matcher,
  PatternMatchMode,
  RequirementKind,
  RequirementSource,
} from '../types'
import { createPatternRequirement } from './pattern-factory'
import {
  buildReusePolicy,
  createMatcherFromGroupKey,
  createMatcherFromSource,
  resolvePatternLogic,
  updateConditionCardPool,
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
    const nextLogic = resolvePatternLogic('all', conditions.length, pattern.minimumConditionMatches)

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
      ...resolvePatternLogic('all', conditions.length, pattern.minimumConditionMatches),
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

export function addRequirementCardToPool(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  cardId: string,
): HandPattern[] {
  if (!cardId) {
    return patterns
  }

  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          needsReview: false,
          conditions: pattern.conditions.map((condition) =>
            condition.id !== requirementId
              ? condition
              : updateConditionCardPool(condition, (cardIds) =>
                  cardIds.includes(cardId) ? cardIds : [...cardIds, cardId],
                ),
          ),
        },
  )
}

export function removeRequirementCardFromPool(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  cardId: string,
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
              : updateConditionCardPool(condition, (cardIds) => cardIds.filter((entry) => entry !== cardId)),
          ),
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

export function updateRequirementSource(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  source: RequirementSource,
  defaultGroupKey: CardGroupKey | null,
  defaultAttribute: CardAttribute | null,
  defaultLevel: number | null,
  defaultMonsterType: string | null,
  defaultAtk: number | null,
  defaultDef: number | null,
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
                  matcher: createMatcherFromSource(
                    source,
                    {
                      defaultAtk,
                      defaultAttribute,
                      defaultDef,
                      defaultGroupKey,
                      defaultLevel,
                      defaultMonsterType,
                    },
                    condition.matcher,
                  ),
                },
          ),
        },
  )
}

export function updateRequirementGroup(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  groupKey: CardGroupKey | null,
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
                  matcher: groupKey ? createMatcherFromGroupKey(groupKey) : null,
                },
          ),
        },
  )
}

export function updateRequirementAttribute(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  attribute: CardAttribute | null,
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
                  matcher: attribute ? { type: 'attribute', value: attribute } : null,
                },
          ),
        },
  )
}

export function updateRequirementLevel(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  level: number | null,
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
                  matcher: level !== null ? { type: 'level', value: level } : null,
                },
          ),
        },
  )
}

export function updateRequirementMonsterType(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  monsterType: string | null,
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
                  matcher: monsterType ? { type: 'monster_type', value: monsterType } : null,
                },
          ),
        },
  )
}

export function updateRequirementAtk(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  atk: number | null,
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
                  matcher: atk !== null ? { type: 'atk', value: atk } : null,
                },
          ),
        },
  )
}

export function updateRequirementDef(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
  def: number | null,
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
                  matcher: def !== null ? { type: 'def', value: def } : null,
                },
          ),
        },
  )
}
