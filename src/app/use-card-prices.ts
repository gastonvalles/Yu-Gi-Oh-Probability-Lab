import { useEffect, useState } from 'react'

import type { PrintingPrice } from './card-prices'

export type CardPricesState = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; prices: PrintingPrice[] }

/** Lo ya consultado en esta sesión: abrir de nuevo la misma carta no vuelve a pedir nada. */
const cache = new Map<number, PrintingPrice[]>()

/** Pide al endpoint propio (`/api/card-prices`) los precios de TCGplayer de la carta; sin id no pide nada. */
export function useCardPrices(cardId: number | null): CardPricesState {
  const [result, setResult] = useState<{ id: number; prices: PrintingPrice[] | null } | null>(null)

  useEffect(() => {
    if (cardId === null || cache.has(cardId)) {
      return
    }

    const controller = new AbortController()

    fetch(`/api/card-prices?id=${cardId}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ prices: PrintingPrice[] }>) : Promise.reject(new Error(String(response.status)))))
      .then(({ prices }) => {
        cache.set(cardId, prices)
        setResult({ id: cardId, prices })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ id: cardId, prices: null })
        }
      })

    return () => controller.abort()
  }, [cardId])

  if (cardId === null) {
    return { status: 'idle' }
  }

  const prices = cache.get(cardId) ?? (result?.id === cardId ? result.prices : undefined)

  if (prices === undefined) {
    return { status: 'loading' }
  }

  return prices === null ? { status: 'error' } : { status: 'ready', prices }
}
