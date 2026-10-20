import { useEffect, useState } from 'react'

import { parseDerivedCardId } from '../../app/calculator-state'
import { t } from '../../i18n'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetailOverlay } from '../card-detail/CardDetailOverlay'
import { cardIdOfDrawId } from '../probability/practice'

interface RivalCardDetailProps {
  /** La carta real (`card-123-2`) de lo que el rival ya mostró: es lo único que se sabe de ella. */
  drawId: string
  /** Dónde estaba la carta que se tocó: de ahí se abre el detalle. */
  origin: DOMRect | null
  onClose: () => void
}

/** La carta real de lo que el rival ya mostró (`card-123-2`): se pide por su número de YGOPRODeck y, hasta que llega (o sin `drawId`, o con otra carta que la anterior), es null. */
export function useRivalCard(drawId: string | undefined): ApiCardSearchResult | null {
  const ygoId = drawId === undefined ? null : parseDerivedCardId(cardIdOfDrawId(drawId))
  const [loaded, setLoaded] = useState<{ ygoId: number; card: ApiCardSearchResult | null } | null>(null)

  useEffect(() => {
    if (ygoId === null) return

    let alive = true

    fetchCardsByIds([ygoId])
      .then((cards) => {
        if (alive) setLoaded({ ygoId, card: cards[0] ?? null })
      })
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [ygoId])

  return loaded !== null && loaded.ygoId === ygoId ? loaded.card : null
}

/** El detalle de una carta del rival que ya está a la vista: se pide por su número de YGOPRODeck, y hasta que llega se ve sólo "Carta del rival". */
export function RivalCardDetail({ drawId, origin, onClose }: RivalCardDetailProps) {
  const card = useRivalCard(drawId)

  return <CardDetailOverlay name={card?.name ?? t('duel.mark.rivalCard')} card={card} origin={origin} onClose={onClose} />
}
