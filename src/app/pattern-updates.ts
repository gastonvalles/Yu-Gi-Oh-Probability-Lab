import type {
  CardAttribute,
  CardEntry,
  CardGroupKey,
  HandPattern,
  HandPatternCategory,
  PatternMatchMode,
  RequirementKind,
  RequirementSource,
} from '../types'
import { createPatternRequirement } from './pattern-factory'

export function addRequirement(
  patterns: HandPattern[],
  patternId: string,
  derivedMainCards: CardEntry[],
): HandPattern[] {
  return patterns.map((pattern) => {
    if (pattern.id !== patternId) {
      return pattern
    }

    const requirements = [...pattern.requirements, createPatternRequirement(derivedMainCards[0]?.id, pattern.category)]

    return {
      ...pattern,
      matchMode: 'all',
      minimumMatches: Math.max(requirements.length, 1),
      requirements,
    }
  })
}

export function removeRequirement(
  patterns: HandPattern[],
  patternId: string,
  requirementId: string,
): HandPattern[] {
  return patterns.map((pattern) =>
    pattern.id !== patternId
      ? pattern
      : {
          ...pattern,
          matchMode: 'all',
          requirements: pattern.requirements.filter((requirement) => requirement.id !== requirementId),
          minimumMatches: Math.max(
            pattern.requirements.filter((requirement) => requirement.id !== requirementId).length,
            1,
          ),
        },
  )
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
          category,
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

    const maxRequirementCount = Math.max(pattern.requirements.length, 1)

    return {
      ...pattern,
      matchMode,
      minimumMatches:
        matchMode === 'all'
          ? pattern.requirements.length
          : matchMode === 'any'
            ? 1
            : Math.max(2, Math.min(Math.max(pattern.minimumMatches, 2), maxRequirementCount)),
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
          minimumMatches:
            pattern.matchMode === 'at-least'
              ? Math.max(2, Math.min(minimumMatches, Math.max(pattern.requirements.length, 1)))
              : Math.max(1, Math.min(minimumMatches, Math.max(pattern.requirements.length, 1))),
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
          allowSharedCards,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  cardIds: requirement.cardIds.includes(cardId) ? requirement.cardIds : [...requirement.cardIds, cardId],
                },
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  cardIds: requirement.cardIds.filter((entry) => entry !== cardId),
                },
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  count,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  source,
                  groupKey: source === 'group' ? requirement.groupKey ?? defaultGroupKey : requirement.groupKey,
                  attribute:
                    source === 'attribute'
                      ? requirement.attribute ?? defaultAttribute
                      : requirement.attribute,
                  level: source === 'level' ? requirement.level ?? defaultLevel : requirement.level,
                  monsterType:
                    source === 'type'
                      ? requirement.monsterType ?? defaultMonsterType
                      : requirement.monsterType,
                  atk: source === 'atk' ? requirement.atk ?? defaultAtk : requirement.atk,
                  def: source === 'def' ? requirement.def ?? defaultDef : requirement.def,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  source: 'group',
                  groupKey,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  source: 'attribute',
                  attribute,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  source: 'level',
                  level,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  source: 'type',
                  monsterType,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  source: 'atk',
                  atk,
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
          requirements: pattern.requirements.map((requirement) =>
            requirement.id !== requirementId
              ? requirement
              : {
                  ...requirement,
                  source: 'def',
                  def,
                },
          ),
        },
  )
}
