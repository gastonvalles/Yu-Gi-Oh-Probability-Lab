import { useEffect, useState } from 'react'

import { fetchCardPrices, type CardPrices } from './card-prices'

export type CardPricesState = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & CardPrices)

/** Lo ya consultado en esta sesión: abrir de nuevo la misma carta no vuelve a pedir nada. */
const cache = new Map<number, CardPrices>()
/** Lo que se está pidiendo ahora: dos pantallas que piden la misma carta a la vez comparten el pedido. */
const inFlight = new Map<number, Promise<CardPrices>>()

function request(cardId: number): Promise<CardPrices> {
  let pending = inFlight.get(cardId)

  if (!pending) {
    pending = fetchCardPrices(cardId)
      .then((data) => {
        cache.set(cardId, data)
        return data
      })
      .finally(() => inFlight.delete(cardId))
    inFlight.set(cardId, pending)
  }

  return pending
}

/** Busca los precios de TCGplayer de la carta (los archivos que baja el sync diario); sin id no pide nada. */
export function useCardPrices(cardId: number | null): CardPricesState {
  const [result, setResult] = useState<{ id: number; data: CardPrices | null } | null>(null)

  useEffect(() => {
    if (cardId === null || cache.has(cardId)) {
      return
    }

    let cancelled = false

    request(cardId).then(
      (data) => !cancelled && setResult({ id: cardId, data }),
      () => !cancelled && setResult({ id: cardId, data: null }),
    )

    return () => {
      cancelled = true
    }
  }, [cardId])

  if (cardId === null) {
    return { status: 'idle' }
  }

  const data = cache.get(cardId) ?? (result?.id === cardId ? result.data : undefined)

  if (data === undefined) {
    return { status: 'loading' }
  }

  return data === null ? { status: 'error' } : { status: 'ready', ...data }
}
