import type {
  CardGroupKey,
  HandPatternCategory,
  PatternMatchMode,
  RequirementKind,
  RequirementSource,
} from '../../types'

export interface PatternEditorActions {
  addPattern: (category: HandPatternCategory) => string
  removePattern: (patternId: string) => void
  setPatternCategory: (patternId: string, value: HandPatternCategory) => void
  setPatternName: (patternId: string, value: string) => void
  setPatternMatchMode: (patternId: string, value: PatternMatchMode) => void
  setPatternMinimumMatches: (patternId: string, value: string) => void
  setPatternAllowSharedCards: (patternId: string, value: boolean) => void
  addRequirement: (patternId: string) => void
  removeRequirement: (patternId: string, requirementId: string) => void
  addRequirementCard: (patternId: string, requirementId: string, cardId: string) => void
  removeRequirementCard: (patternId: string, requirementId: string, cardId: string) => void
  setRequirementKind: (patternId: string, requirementId: string, value: RequirementKind) => void
  setRequirementDistinct: (patternId: string, requirementId: string, value: boolean) => void
  setRequirementCount: (patternId: string, requirementId: string, value: string) => void
  setRequirementSource: (patternId: string, requirementId: string, value: RequirementSource) => void
  setRequirementGroup: (patternId: string, requirementId: string, value: CardGroupKey | null) => void
}
