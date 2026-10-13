import { useEffect, useState } from 'react'

import { banlistCardName, formatBanlistDate, type Banlist } from '../../app/banlists'
import { placeholderCard } from '../../app/card-placeholder'
import { cardSmallImageUrl } from '../../app/card-prices'
import { t } from '../../i18n'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetailOverlay } from '../card-detail/CardDetailOverlay'

/** La carta no cambia: un día en el dispositivo evita volver a pedirla. */
const CARD_PERSIST_MS = 24 * 60 * 60 * 1000

/** El detalle de una carta de una banlist, en el mismo marco que el resto de la app; con la lista de la que se la abrió como contexto. */
export function BanlistCardModal({ cardId, list, status, onClose }: { cardId: number | null; list: Banlist; status: string; onClose: () => void }) {
  return cardId === null ? null : <BanlistCardOverlay key={cardId} cardId={cardId} list={list} status={status} onClose={onClose} />
}

function BanlistCardOverlay({ cardId, list, status, onClose }: { cardId: number; list: Banlist; status: string; onClose: () => void }) {
  const [card, setCard] = useState<ApiCardSearchResult | null>(null)

  // La lista sólo trae el id (y el nombre, de los datos); la carta completa (arte grande, texto, banlist de hoy) se pide al abrir.
  useEffect(() => {
    let cancelled = false

    fetchCardsByIds([cardId], { persistForMs: CARD_PERSIST_MS })
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
  }, [cardId])

  return (
    <CardDetailOverlay
      name={card?.name ?? banlistCardName(cardId)}
      card={card ?? placeholderCard(cardId, cardSmallImageUrl(cardId))}
      metadata={t('catalog.banlists.cardContext', { region: list.region.toUpperCase(), date: formatBanlistDate(list.date), status })}
      onClose={onClose}
    />
  )
}
