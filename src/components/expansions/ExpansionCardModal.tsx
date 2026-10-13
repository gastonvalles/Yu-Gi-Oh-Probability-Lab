import { useEffect, useState } from 'react'

import { cardSmallImageUrl, type ExpansionCard } from '../../app/card-prices'
import { placeholderCard } from '../../app/card-placeholder'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetailOverlay } from '../card-detail/CardDetailOverlay'

/** La carta no cambia: un día en el dispositivo evita volver a pedirla. */
const CARD_PERSIST_MS = 24 * 60 * 60 * 1000

/** El detalle de una carta de una expansión, en el mismo marco que el resto de la app; con su impresión (código, rareza y edición) como contexto. */
export function ExpansionCardModal({ item, onClose }: { item: ExpansionCard | null; onClose: () => void }) {
  return item ? <ExpansionCardOverlay key={`${item.cardId}-${item.code}-${item.rarity}-${item.edition}`} item={item} onClose={onClose} /> : null
}

function ExpansionCardOverlay({ item, onClose }: { item: ExpansionCard; onClose: () => void }) {
  const [card, setCard] = useState<ApiCardSearchResult | null>(null)

  // La expansión sólo trae nombre y código; la carta completa (arte grande, texto, banlist) se pide al abrir.
  useEffect(() => {
    let cancelled = false

    fetchCardsByIds([item.cardId], { persistForMs: CARD_PERSIST_MS })
      .then(([fetched]) => {
        if (!cancelled && fetched) {
          setCard(fetched)
        }
      })
      .catch(() => {
        // Sin la carta completa se sigue con la imagen chica.
      })

    return () => {
      cancelled = true
    }
  }, [item.cardId])

  return (
    <CardDetailOverlay
      name={item.name}
      card={card ?? placeholderCard(item.cardId, cardSmallImageUrl(item.cardId))}
      metadata={[item.code, item.rarity, item.edition].join(' · ')}
      onClose={onClose}
    />
  )
}
