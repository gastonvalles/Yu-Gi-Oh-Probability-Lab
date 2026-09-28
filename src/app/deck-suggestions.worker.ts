import { buildDeckSuggestions, type DeckSuggestionReport } from './deck-suggestions'
import type { CardEntry, HandPattern } from '../types'

export interface DeckSuggestionRequest {
  requestId: number
  cards: CardEntry[]
  patterns: HandPattern[]
  handSize: number
  maxCopiesById: Record<string, number>
}

export interface DeckSuggestionResponse {
  requestId: number
  report: DeckSuggestionReport
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<DeckSuggestionRequest>) => void) | null
  postMessage: (message: DeckSuggestionResponse) => void
}

workerScope.onmessage = (event) => {
  const { requestId, cards, patterns, handSize, maxCopiesById } = event.data

  workerScope.postMessage({
    requestId,
    report: buildDeckSuggestions(cards, patterns, handSize, {
      maxCopiesFor: (card) => maxCopiesById[card.id] ?? 3,
    }),
  })
}
