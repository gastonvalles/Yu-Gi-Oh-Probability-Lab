import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { buildLoanerDecks, loanerPasscodes, type LoanerDeck } from '../../app/loaner-deck'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'

export interface Loaners {
  status: 'idle' | 'loading' | 'error' | 'ready'
  decks: LoanerDeck[]
  retry: () => void
}

/** Las listas son fijas: un día en el dispositivo (Cache API, como «Ver mazo») y la segunda visita no pide nada. */
const DAY_MS = 24 * 60 * 60 * 1000
const fetchLoanerCards = (ids: number[]) => fetchCardsByIds(ids, { persistForMs: DAY_MS })

/**
 * Los mazos prestados (`loaner-deck.ts`) con los datos de sus cartas: se piden la primera vez que hacen falta (`enabled`: sin deck propio completo, en Online o Solo), los tres en
 * un pedido, y quedan mientras la app siga abierta. `load` lo cambian las pruebas y el `/playground` (sin red).
 */
export function useLoaners(enabled: boolean, load: (ids: number[]) => Promise<ApiCardSearchResult[]> = fetchLoanerCards): Loaners {
  const [state, setState] = useState<Omit<Loaners, 'retry'>>({ status: 'idle', decks: [] })
  const [attempt, setAttempt] = useState(0)
  const ready = useRef(false)
  const fetchCards = useEffectEvent(load)

  useEffect(() => {
    if (!enabled || ready.current) return
    let alive = true

    setState({ status: 'loading', decks: [] })
    fetchCards(loanerPasscodes()).then(
      (cards) => {
        if (!alive) return
        // Sin ninguna carta (una respuesta vacía) no hay qué prestar: como un error, se reintenta.
        if (cards.length === 0) return setState({ status: 'error', decks: [] })
        ready.current = true
        setState({ status: 'ready', decks: buildLoanerDecks(cards) })
      },
      () => {
        if (alive) setState({ status: 'error', decks: [] })
      },
    )

    return () => {
      alive = false
    }
  }, [enabled, attempt])

  return { ...state, retry: () => setAttempt((count) => count + 1) }
}
