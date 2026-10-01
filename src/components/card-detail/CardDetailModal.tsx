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
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

export function CardDetailModal({ card, isOpen, ...props }: CardDetailModalProps) {
  return card && isOpen ? <CardDetail key={card.ygoprodeckId} card={card} {...props} /> : null
}
