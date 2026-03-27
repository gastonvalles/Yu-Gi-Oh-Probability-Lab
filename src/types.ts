export type CardSource = 'manual' | 'ygoprodeck'
export type DeckFormat = 'unlimited' | 'tcg' | 'ocg' | 'goat' | 'edison' | 'genesys'
export type BanlistStatus = 'forbidden' | 'limited' | 'semi-limited' | 'unlimited'
export type CardOrigin = 'engine' | 'non_engine' | 'hybrid'
export type CardRole =
  | 'starter'
  | 'extender'
  | 'enabler'
  | 'handtrap'
  | 'disruption'
  | 'boardbreaker'
  | 'floodgate'
  | 'removal'
  | 'searcher'
  | 'draw'
  | 'recovery'
  | 'combo_piece'
  | 'payoff'
  | 'brick'
  | 'garnet'
  | 'tech'
export type GroupKey =
  | { type: 'origin'; value: CardOrigin }
  | { type: 'role'; value: CardRole }
export type CardGroupKey = GroupKey
export type CardAttribute = 'DARK' | 'DIVINE' | 'EARTH' | 'FIRE' | 'LIGHT' | 'WATER' | 'WIND'
export type PatternKind = 'opening' | 'problem'
export type PatternLogic = 'all' | 'any'
export type ReusePolicy = 'allow' | 'forbid'
export type PatternMatchMode = 'all' | 'any' | 'at-least'
export type HandPatternCategory = PatternKind
export type RequirementKind = 'include' | 'exclude'
export type RequirementSource = 'cards' | 'group' | 'attribute' | 'level' | 'type' | 'atk' | 'def'
export type Matcher =
  | { type: 'origin'; value: CardOrigin }
  | { type: 'role'; value: CardRole }
  | { type: 'card'; value: string }
  | { type: 'card_pool'; value: string[] }
  | { type: 'attribute'; value: CardAttribute }
  | { type: 'level'; value: number }
  | { type: 'monster_type'; value: string }
  | { type: 'atk'; value: number }
  | { type: 'def'; value: number }

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
  origin: CardOrigin | null
  roles: CardRole[]
  needsReview: boolean
}

export interface PatternCondition {
  id: string
  matcher: Matcher | null
  quantity: number
  kind: RequirementKind
  distinct: boolean
}

export interface Pattern {
  id: string
  name: string
  kind: PatternKind
  logic: PatternLogic
  minimumConditionMatches: number
  reusePolicy: ReusePolicy
  needsReview: boolean
  conditions: PatternCondition[]
}

export type PatternRequirement = PatternCondition
export type HandPattern = Pattern

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
  kind: PatternKind
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
