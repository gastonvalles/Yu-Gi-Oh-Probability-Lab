import { useEffect, useRef, useState } from 'react'

import { getCardCopyLimit } from '../../app/deck-format'
import { buildDeckSuggestions, type DeckSuggestionReport } from '../../app/deck-suggestions'
import type { DeckSuggestionRequest, DeckSuggestionResponse } from '../../app/deck-suggestions.worker'
import type { CardEntry, DeckFormat, HandPattern } from '../../types'

const DEBOUNCE_MS = 350
const DEFAULT_COPY_LIMIT = 3

export type DeckSuggestionsState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; report: DeckSuggestionReport }

/** Calcula las sugerencias en un Web Worker para no trabar la pantalla. */
export function useDeckSuggestions(
  cards: CardEntry[],
  patterns: HandPattern[],
  handSize: number,
  deckFormat: DeckFormat,
  enabled: boolean,
): DeckSuggestionsState {
  const [state, setState] = useState<DeckSuggestionsState>({ status: 'idle' })
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => () => workerRef.current?.terminate(), [])

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' })
      return
    }

    const requestId = ++requestIdRef.current
    const request: DeckSuggestionRequest = {
      requestId,
      cards,
      patterns,
      handSize,
      maxCopiesById: Object.fromEntries(
        cards.map((card) => [card.id, card.apiCard ? getCardCopyLimit(card.apiCard, deckFormat) : DEFAULT_COPY_LIMIT]),
      ),
    }

    setState({ status: 'loading' })

    const timer = window.setTimeout(() => {
      const worker = getWorker(workerRef)

      if (!worker) {
        const report = buildDeckSuggestions(cards, patterns, handSize, {
          maxCopiesFor: (card) => request.maxCopiesById[card.id] ?? DEFAULT_COPY_LIMIT,
        })
        setState({ status: 'ready', report })
        return
      }

      worker.onmessage = (event: MessageEvent<DeckSuggestionResponse>) => {
        if (event.data.requestId === requestIdRef.current) {
          setState({ status: 'ready', report: event.data.report })
        }
      }
      worker.postMessage(request)
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [cards, deckFormat, enabled, handSize, patterns])

  return state
}

function getWorker(workerRef: { current: Worker | null }): Worker | null {
  if (typeof Worker === 'undefined') {
    return null
  }

  workerRef.current ??= new Worker(new URL('../../app/deck-suggestions.worker.ts', import.meta.url), {
    type: 'module',
  })

  return workerRef.current
}
