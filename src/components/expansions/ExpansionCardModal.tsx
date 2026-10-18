import { useEffect, useState } from 'react'

import type { CardNavigation } from '../../app/card-neighbors'
import { cardSmallImageUrl, printImageUrl, type ExpansionCard } from '../../app/card-prices'
import { placeholderCard } from '../../app/card-placeholder'
import { printArtId } from '../../app/use-card-art-options'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetailOverlay } from '../card-detail/CardDetailOverlay'

/** La carta no cambia: un día en el dispositivo evita volver a pedirla. */
const CARD_PERSIST_MS = 24 * 60 * 60 * 1000

/** El detalle de una carta de una expansión, en el mismo marco que el resto de la app; con su impresión (código, rareza y edición) como contexto. */
export function ExpansionCardModal({ item, navigation, onClose }: { item: ExpansionCard | null; navigation?: CardNavigation | null; onClose: () => void }) {
  return item ? <ExpansionCardOverlay item={item} navigation={navigation} onClose={onClose} /> : null
}

function ExpansionCardOverlay({ item, navigation, onClose }: { item: ExpansionCard; navigation?: CardNavigation | null; onClose: () => void }) {
  const [fetched, setFetched] = useState<ApiCardSearchResult | null>(null)
  // El marco no se vuelve a armar al pasar a otra impresión: hasta que llega la carta nueva, la de antes no se muestra.
  const card = fetched?.ygoprodeckId === item.cardId ? fetched : null

  // La expansión sólo trae nombre y código; la carta completa (arte grande, texto, banlist) se pide al abrir.
  useEffect(() => {
    let cancelled = false

    fetchCardsByIds([item.cardId], { persistForMs: CARD_PERSIST_MS })
      .then(([loaded]) => {
        if (!cancelled && loaded) {
          setFetched(loaded)
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
      metadata={[item.code, item.rarity, item.variant, item.edition].filter(Boolean).join(' · ')}
      // Se abre con el escaneo de la impresión que se tocó (la overframe se ve overframe), no con el arte de siempre.
      initialArt={{ id: printArtId(item.productId), imageUrl: printImageUrl(item.productId, '400w') }}
      navigation={navigation}
      onClose={onClose}
    />
  )
}
