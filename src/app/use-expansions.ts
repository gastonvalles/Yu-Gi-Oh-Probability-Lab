import { useEffect, useState } from 'react'

import { fetchExpansionCards, fetchExpansions, type Expansion, type ExpansionCard } from './card-prices'

export type ExpansionsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; expansions: Expansion[]; updated: string }

export type ExpansionCardsState = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; cards: ExpansionCard[] }

/** Las expansiones con precios (el índice de los precios, una vez por sesión). */
export function useExpansions(): ExpansionsState {
  const [state, setState] = useState<ExpansionsState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetchExpansions().then(
      (data) => !cancelled && setState({ status: 'ready', ...data }),
      () => !cancelled && setState({ status: 'error' }),
    )

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

/** Las cartas de una expansión (un solo archivo, que no se vuelve a pedir en la sesión). Sin id no pide nada. */
export function useExpansionCards(expansionId: number | null): ExpansionCardsState {
  const [result, setResult] = useState<{ id: number; cards: ExpansionCard[] | null } | null>(null)

  useEffect(() => {
    if (expansionId === null) {
      return
    }

    let cancelled = false

    fetchExpansionCards(expansionId).then(
      (cards) => !cancelled && setResult({ id: expansionId, cards }),
      () => !cancelled && setResult({ id: expansionId, cards: null }),
    )

    return () => {
      cancelled = true
    }
  }, [expansionId])

  if (expansionId === null) {
    return { status: 'idle' }
  }

  if (result?.id !== expansionId) {
    return { status: 'loading' }
  }

  return result.cards ? { status: 'ready', cards: result.cards } : { status: 'error' }
}
