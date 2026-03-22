import type {
  CardGroupKey,
  HandPattern,
  HandPatternCategory,
  PatternMatchMode,
  PatternRequirement,
  RequirementKind,
} from '../types'
import { createId } from './utils'

export function createPattern(
  name: string,
  firstCardId?: string,
  category: HandPatternCategory = 'good',
): HandPattern {
  return {
    id: createId('pattern'),
    name,
    category,
    matchMode: 'all',
    minimumMatches: 1,
    allowSharedCards: false,
    requirements: [createPatternRequirement(firstCardId, category)],
  }
}

export function createPatternRequirement(
  firstCardId?: string,
  category: HandPatternCategory = 'good',
): PatternRequirement {
  return {
    id: createId('req'),
    source: 'cards',
    cardIds: firstCardId ? [firstCardId] : [],
    groupKey: null,
    attribute: null,
    level: null,
    monsterType: null,
    atk: null,
    def: null,
    count: 1,
    kind: category === 'bad' ? 'exclude' : 'include',
    distinct: false,
  }
}

export function createGroupPattern(
  name: string,
  category: HandPatternCategory,
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
  return {
    id: createId('pattern'),
    name,
    category,
    matchMode: options?.matchMode ?? 'all',
    minimumMatches: options?.minimumMatches ?? requirements.length,
    allowSharedCards: options?.allowSharedCards ?? false,
    requirements: requirements.map((requirement) => ({
      id: createId('req'),
      source: 'group',
      cardIds: [],
      groupKey: requirement.groupKey,
      attribute: null,
      level: null,
      monsterType: null,
      atk: null,
      def: null,
      count: requirement.count,
      kind: requirement.kind,
      distinct: requirement.distinct ?? false,
    })),
  }
}
