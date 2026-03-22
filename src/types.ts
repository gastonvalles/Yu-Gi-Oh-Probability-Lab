export type CardSource = 'manual' | 'ygoprodeck'
export type DeckFormat = 'unlimited' | 'tcg' | 'ocg' | 'goat' | 'genesys'
export type BanlistStatus = 'forbidden' | 'limited' | 'semi-limited' | 'unlimited'
export type CardRole = 'starter' | 'extender' | 'brick' | 'handtrap' | 'boardbreaker' | 'floodgate'
export type CardGroupKey = CardRole | 'engine' | 'non-engine'
export type CardAttribute = 'DARK' | 'DIVINE' | 'EARTH' | 'FIRE' | 'LIGHT' | 'WATER' | 'WIND'
export type PatternMatchMode = 'all' | 'any' | 'at-least'
export type HandPatternCategory = 'good' | 'bad'
export type RequirementKind = 'include' | 'exclude'
export type RequirementSource = 'cards' | 'group' | 'attribute' | 'level' | 'type' | 'atk' | 'def'

export interface CardBanlistInfo {
  tcg: BanlistStatus | null
  ocg: BanlistStatus | null
  goat: BanlistStatus | null
}

export interface CardGenesysInfo {
  points: number | null
}

export interface ApiCardReference {
  ygoprodeckId: number
  cardType: string
  frameType: string
  description: string | null
  race: string | null
  attribute: string | null
  level: number | null
  linkValue: number | null
  atk: string | null
  def: string | null
  archetype: string | null
  ygoprodeckUrl: string | null
  imageUrl: string | null
  imageUrlSmall: string | null
  banlist: CardBanlistInfo
  genesys: CardGenesysInfo
}

export interface CardEntry {
  id: string
  name: string
  copies: number
  source: CardSource
  apiCard: ApiCardReference | null
  roles: CardRole[]
}

export interface PatternRequirement {
  id: string
  source: RequirementSource
  cardIds: string[]
  groupKey: CardGroupKey | null
  attribute: CardAttribute | null
  level: number | null
  monsterType: string | null
  atk: number | null
  def: number | null
  count: number
  kind: RequirementKind
  distinct: boolean
}

export interface HandPattern {
  id: string
  name: string
  category: HandPatternCategory
  matchMode: PatternMatchMode
  minimumMatches: number
  allowSharedCards: boolean
  requirements: PatternRequirement[]
}

export interface CalculatorState {
  deckSize: number
  handSize: number
  cards: CardEntry[]
  patterns: HandPattern[]
}

export interface ValidationIssue {
  level: 'error' | 'warning'
  message: string
}

export interface PatternProbability {
  patternId: string
  name: string
  category: HandPatternCategory
  requirementLabel: string
  probability: number
  matchingHands: number
  possible: boolean
}

export interface CalculationSummary {
  totalProbability: number
  goodHands: number
  badProbability: number
  badHands: number
  neutralProbability: number
  neutralHands: number
  overlapProbability: number
  overlapHands: number
  totalHands: number
  patternResults: PatternProbability[]
  relevantCardCount: number
  otherCopies: number
}

export interface CalculationOutput {
  issues: ValidationIssue[]
  blockingIssues: ValidationIssue[]
  summary: CalculationSummary | null
}
