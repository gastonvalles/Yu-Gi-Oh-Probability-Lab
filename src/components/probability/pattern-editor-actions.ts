import type {
  HandPattern,
  HandPatternCategory,
  Matcher,
  PatternMatchMode,
  RequirementKind,
  TurnContext,
} from '../../types'

export interface PatternEditorActions {
  addPattern: (category: HandPatternCategory) => string
  appendPattern: (pattern: HandPattern) => void
  removePattern: (patternId: string) => void
  replacePatterns: (patterns: HandPattern[]) => void
  setPatternCategory: (patternId: string, value: HandPatternCategory) => void
  setPatternName: (patternId: string, value: string) => void
  setPatternTurnContext: (patternId: string, value: TurnContext) => void
  setPatternMatchMode: (patternId: string, value: PatternMatchMode) => void
  setPatternMinimumMatches: (patternId: string, value: string) => void
  setPatternAllowSharedCards: (patternId: string, value: boolean) => void
  setPatternIgnoresDraw: (patternId: string, value: boolean) => void
  setPatternRescuesCards: (patternId: string, value: boolean) => void
  addRequirement: (patternId: string) => void
  removeRequirement: (patternId: string, requirementId: string) => void
  setRequirementKind: (patternId: string, requirementId: string, value: RequirementKind) => void
  setRequirementDistinct: (patternId: string, requirementId: string, value: boolean) => void
  setRequirementCount: (patternId: string, requirementId: string, value: string) => void
  setRequirementMatcher: (patternId: string, requirementId: string, value: Matcher | null) => void
}
