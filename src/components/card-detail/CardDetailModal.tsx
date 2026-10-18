import type { CardNavigation } from '../../app/card-neighbors'
import type { DeckZone } from '../../app/model'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetail } from './CardDetail'
import type { DeckCopyActions } from './DeckCopyControls'

interface CardDetailModalProps {
  card: ApiCardSearchResult | null
  deckFormat: DeckFormat
  isOpen: boolean
  showActions?: boolean
  deckCopy?: DeckCopyActions | null
  /** Pasar a la carta anterior y a la siguiente de la lista de la que se abrió: el marco no se vuelve a armar, sólo cambia la carta. */
  navigation?: CardNavigation | null
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

export function CardDetailModal({ card, isOpen, ...props }: CardDetailModalProps) {
  return card && isOpen ? <CardDetail card={card} {...props} /> : null
}
