import { useEffect, useState } from 'react'

import { banlistCardName, formatBanlistDate, type Banlist } from '../../app/banlists'
import type { CardNavigation } from '../../app/card-neighbors'
import { placeholderCard } from '../../app/card-placeholder'
import { cardSmallImageUrl } from '../../app/card-prices'
import { t } from '../../i18n'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetailOverlay } from '../card-detail/CardDetailOverlay'

/** La carta no cambia: un día en el dispositivo evita volver a pedirla. */
const CARD_PERSIST_MS = 24 * 60 * 60 * 1000

interface BanlistCardModalProps {
  cardId: number | null
  list: Banlist
  status: string
  /** Pasar a la carta anterior y a la siguiente de la lista tal como se ve. */
  navigation?: CardNavigation | null
  onClose: () => void
}

/** El detalle de una carta de una banlist, en el mismo marco que el resto de la app; con la lista de la que se la abrió como contexto. */
export function BanlistCardModal({ cardId, ...props }: BanlistCardModalProps) {
  return cardId === null ? null : <BanlistCardOverlay cardId={cardId} {...props} />
}

function BanlistCardOverlay({ cardId, list, status, navigation, onClose }: Omit<BanlistCardModalProps, 'cardId'> & { cardId: number }) {
  const [fetched, setFetched] = useState<ApiCardSearchResult | null>(null)
  // El marco no se vuelve a armar al pasar de una carta a otra: hasta que llega la nueva, la de antes no se muestra.
  const card = fetched?.ygoprodeckId === cardId ? fetched : null

  // La lista sólo trae el id (y el nombre, de los datos); la carta completa (arte grande, texto, banlist de hoy) se pide al abrir.
  useEffect(() => {
    let cancelled = false

    fetchCardsByIds([cardId], { persistForMs: CARD_PERSIST_MS })
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
  }, [cardId])

  return (
    <CardDetailOverlay
      name={card?.name ?? banlistCardName(cardId)}
      card={card ?? placeholderCard(cardId, cardSmallImageUrl(cardId))}
      metadata={t('catalog.banlists.cardContext', { region: list.region.toUpperCase(), date: formatBanlistDate(list.date), status })}
      navigation={navigation}
      onClose={onClose}
    />
  )
}
