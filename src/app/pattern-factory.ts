import type {
  CardGroupKey,
  HandPattern,
  HandPatternCategory,
  Matcher,
  PatternMatchMode,
  PatternRequirement,
  RequirementKind,
} from '../types'
import {
  buildReusePolicy,
  createCardPoolMatcher,
  createMatcherFromGroupKey,
  resolvePatternLogic,
} from './patterns'
import { createId } from './utils'

export function createPattern(
  name: string,
  firstCardId?: string,
  category: HandPatternCategory | 'good' | 'bad' = 'opening',
): HandPattern {
  const kind = normalizePatternKind(category)
  const condition = createPatternRequirement(firstCardId, kind)

  return {
    id: createId('pattern'),
    name,
    kind,
    logic: 'all',
    minimumConditionMatches: 1,
    reusePolicy: 'forbid',
    needsReview: false,
    conditions: [condition],
  }
}

export function createPatternRequirement(
  firstCardId?: string,
  category: HandPatternCategory | 'good' | 'bad' = 'opening',
): PatternRequirement {
  const kind = normalizePatternKind(category)

  return {
    id: createId('req'),
    matcher: createCardPoolMatcher(firstCardId ? [firstCardId] : []),
    quantity: 1,
    kind: kind === 'problem' ? 'exclude' : 'include',
    distinct: false,
  }
}

export function createMatcherPattern(
  name: string,
  category: HandPatternCategory | 'good' | 'bad',
  conditions: Array<{
    matcher: Matcher
    quantity: number
    kind: RequirementKind
    distinct?: boolean
  }>,
  options?: {
    matchMode?: PatternMatchMode
    minimumMatches?: number
    allowSharedCards?: boolean
  },
): HandPattern {
  const kind = normalizePatternKind(category)
  const patternLogic = resolvePatternLogic(
    options?.matchMode ?? 'all',
    conditions.length,
    options?.minimumMatches ?? conditions.length,
  )

  return {
    id: createId('pattern'),
    name,
    kind,
    logic: patternLogic.logic,
    minimumConditionMatches: patternLogic.minimumConditionMatches,
    reusePolicy: buildReusePolicy(options?.allowSharedCards === true),
    needsReview: false,
    conditions: conditions.map((condition) => ({
      id: createId('req'),
      matcher: condition.matcher,
      quantity: condition.quantity,
      kind: condition.kind,
      distinct: condition.distinct ?? false,
    })),
  }
}

export function createGroupPattern(
  name: string,
  category: HandPatternCategory | 'good' | 'bad',
  requirements: Array<{
    groupKey: CardGroupKey
    count: number
    kind: RequirementKind
    distinct?: boolean
  }>,
  options?: {
    matchMode?: PatternMatchMode
    minimumMatches?: number
    allowSharedCards?: boolean
  },
): HandPattern {
  return createMatcherPattern(
    name,
    category,
    requirements.map((requirement) => ({
      matcher: createMatcherFromGroupKey(requirement.groupKey),
      quantity: requirement.count,
      kind: requirement.kind,
      distinct: requirement.distinct,
    })),
    options,
  )
}

function normalizePatternKind(category: HandPatternCategory | 'good' | 'bad'): HandPattern['kind'] {
  return category === 'problem' || category === 'bad' ? 'problem' : 'opening'
}
