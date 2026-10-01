import type { DeckZone } from '../../app/model'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { Button } from '../ui/Button'
import { CardDetailOverlay } from './CardDetailOverlay'
import { buildZoneActionEntries } from './card-zone-actions'
import { DeckCopyControls, type DeckCopyActions } from './DeckCopyControls'

interface CardDetailProps {
  card: ApiCardSearchResult
  deckFormat: DeckFormat
  showActions?: boolean
  deckCopy?: DeckCopyActions | null
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

export function CardDetail({ card, deckFormat, showActions = true, deckCopy = null, onAddToZone, onClose }: CardDetailProps) {
  const actionEntries = showActions ? buildZoneActionEntries(card) : []
  const metadata = [
    card.archetype,
    deckFormat === 'genesys' || card.genesys.points !== null ? `${card.genesys.points ?? 0} Genesys` : null,
  ].filter(Boolean).join(' · ')

  return (
    <CardDetailOverlay
      name={card.name}
      card={card}
      metadata={metadata}
      onClose={onClose}
      actions={actionEntries.length > 0 || deckCopy ? (
        <>
          {actionEntries.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {actionEntries.map((entry) => (
                <Button key={entry.zone} variant={entry.variant} size="md" fullWidth onClick={() => {
                  if (onAddToZone(entry.zone)) onClose()
                }}>
                  {entry.label}
                </Button>
              ))}
            </div>
          ) : null}
          {deckCopy ? <DeckCopyControls deckCopy={deckCopy} /> : null}
        </>
      ) : null}
    />
  )
}
