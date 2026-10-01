import { CardDetailOverlay } from '../card-detail/CardDetailOverlay'
import type { PracticeHandCard } from './practice'

interface PracticeCardFocusProps {
  card: PracticeHandCard
  origin: DOMRect | null
  onClose: () => void
}

export function PracticeCardFocus({ card, origin, onClose }: PracticeCardFocusProps) {
  return <CardDetailOverlay key={card.drawId} name={card.name} card={card.apiCard} origin={origin} onClose={onClose} />
}
