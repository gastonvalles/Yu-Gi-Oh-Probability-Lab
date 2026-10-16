import { useEffect, useMemo, useState } from 'react'

import type { CardPrices } from './card-prices'
import { computeDeckPrice, deckCardCopies, type DeckPrice } from './deck-price'
import type { DeckBuilderState } from './model'
import { loadCardPrices } from './use-card-prices'

export type DeckPriceState = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; price: DeckPrice; updated: string }

/**
 * El precio total del deck. Sólo pide los precios mientras `enabled` (cuando se abre el detalle): son los archivos del sync diario, uno por tanda de cartas,
 * y cada carta se pide una vez por sesión. Si alguna carta falla, no se dice un total a medias: es un error.
 */
export function useDeckPrice(deckBuilder: DeckBuilderState, enabled: boolean): DeckPriceState {
  const cards = useMemo(() => deckCardCopies(deckBuilder), [deckBuilder])
  const key = cards.map((card) => card.cardId).join(',')
  const [loaded, setLoaded] = useState<{ key: string; prices: Map<number, CardPrices> | null } | null>(null)

  useEffect(() => {
    if (!enabled || cards.length === 0) {
      return
    }

    let cancelled = false

    void Promise.all(cards.map(async (card) => [card.cardId, await loadCardPrices(card.cardId)] as const)).then(
      (entries) => !cancelled && setLoaded({ key, prices: new Map(entries) }),
      () => !cancelled && setLoaded({ key, prices: null }),
    )

    return () => {
      cancelled = true
    }
    // La lista de cartas cambia sólo con `key`: el deck entero cambia de objeto con cada movimiento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])

  const ready = loaded?.key === key ? loaded.prices : undefined
  const price = useMemo(() => (ready ? computeDeckPrice(deckBuilder, ready) : null), [deckBuilder, ready])

  if (!enabled || cards.length === 0) {
    return { status: 'idle' }
  }

  if (ready === undefined) {
    return { status: 'loading' }
  }

  if (ready === null || price === null) {
    return { status: 'error' }
  }

  const updated = [...ready.values()][0]?.updated ?? ''

  return { status: 'ready', price, updated }
}
