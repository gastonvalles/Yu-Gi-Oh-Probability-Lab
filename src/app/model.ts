import type {
  ApiCardReference,
  CardOrigin,
  CardRole,
  DeckFormat,
  HandPattern,
  Matcher,
} from '../types'

export type CalculatorMode = 'deck'
export type DeckZone = 'main' | 'extra' | 'side'

export interface DeckCardInstance {
  instanceId: string
  name: string
  apiCard: ApiCardReference
  origin: CardOrigin | null
  roles: CardRole[]
  needsReview: boolean
}

export interface DeckBuilderState {
  deckName: string
  main: DeckCardInstance[]
  extra: DeckCardInstance[]
  side: DeckCardInstance[]
  isEditingDeck: boolean
}

export interface AppState {
  handSize: number
  deckFormat: DeckFormat
  patternsSeeded: boolean
  patternsSeedVersion: number
  patterns: HandPattern[]
  deckBuilder: DeckBuilderState
}

export interface PortableCondition {
  matcher: Matcher | null
  quantity: number
  kind: HandPattern['conditions'][number]['kind']
  distinct: boolean
}

export interface PortablePattern {
  name: string
  kind: HandPattern['kind']
  logic: HandPattern['logic']
  minimumConditionMatches: number
  reusePolicy: HandPattern['reusePolicy']
  needsReview: boolean
  conditions: PortableCondition[]
}

export interface PortableDeckCard {
  name: string
  apiCard: ApiCardReference
  origin: CardOrigin | null
  roles: CardRole[]
  needsReview: boolean
}

export interface PortableConfig {
  version: number
  handSize: number
  deckFormat: DeckFormat
  patternsSeeded: boolean
  patternsSeedVersion: number
  deckBuilder: {
    deckName: string
    main: PortableDeckCard[]
    extra: PortableDeckCard[]
    side: PortableDeckCard[]
  }
  patterns: PortablePattern[]
}

export interface SearchCacheEntry<Result> {
  savedAt: number
  results: Result[]
  hasMore: boolean
}

export interface ApiSearchState<Result> {
  query: string
  status: 'idle' | 'loading' | 'success' | 'error'
  results: Result[]
  errorMessage: string
  requestId: number
  page: number
  hasMore: boolean
}

export interface HoverPreviewState {
  name: string
  card: ApiCardReference
  anchor: HTMLElement
}

export type DragPayload =
  | { type: 'search-result'; apiCardId: number }
  | { type: 'deck-card'; instanceId: string }

export const STORAGE_KEY = 'ygo-probability-lab:v2'
export const CLASSIFICATION_OVERRIDES_KEY = 'ygo-probability-lab:classification-overrides:v1'
export const SEARCH_CACHE_KEY = 'ygo-probability-lab:api-cache:v2'
export const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const SEARCH_CACHE_LIMIT = 25
export const SEARCH_PAGE_SIZE = 15
export const SEARCH_MIN_QUERY_LENGTH = 2
export const SEARCH_DEBOUNCE_MS = 220
export const HOVER_PREVIEW_DELAY_MS = 400
export const SEARCH_STICKY_TOP_PX = 20
export const SEARCH_RESULTS_MAX_HEIGHT_CSS = 'calc(100vh - 112px)'

export function createInitialState(): AppState {
  return {
    handSize: 5,
    deckFormat: 'unlimited',
    patternsSeeded: false,
    patternsSeedVersion: 0,
    patterns: [],
    deckBuilder: {
      deckName: 'Nuevo Deck',
      main: [],
      extra: [],
      side: [],
      isEditingDeck: true,
    },
  }
}

export function createInitialSearchState<Result>(): ApiSearchState<Result> {
  return {
    query: '',
    status: 'idle',
    results: [],
    errorMessage: '',
    requestId: 0,
    page: 0,
    hasMore: false,
  }
}
