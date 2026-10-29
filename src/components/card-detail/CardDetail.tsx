import type { CardNavigation } from '../../app/card-neighbors'
import type { DeckZone } from '../../app/model'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { Button } from '../ui/Button'
import { CardDetailOverlay } from './CardDetailOverlay'
import { useCloseCardOverlay } from './CardOverlay'
import { buildZoneActionEntries } from './card-zone-actions'
import { DeckCopyControls, type DeckCopyActions } from './DeckCopyControls'

interface CardDetailProps {
  card: ApiCardSearchResult
  deckFormat: DeckFormat
  showActions?: boolean
  deckCopy?: DeckCopyActions | null
  navigation?: CardNavigation | null
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

export function CardDetail({ card, deckFormat, showActions = true, deckCopy = null, navigation = null, onAddToZone, onClose }: CardDetailProps) {
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
      navigation={navigation}
      onClose={onClose}
      actions={actionEntries.length > 0 || deckCopy ? (
        <>
          {actionEntries.length > 0 ? <ZoneButtons entries={actionEntries} onAddToZone={onAddToZone} /> : null}
          {deckCopy ? <DeckCopyControls deckCopy={deckCopy} /> : null}
        </>
      ) : null}
    />
  )
}

/** «Agregar al Main / Extra / Side»: la carta que entra cierra el detalle con su vuelo de vuelta, como la X (va adentro del marco, que da el cierre). */
function ZoneButtons({ entries, onAddToZone }: { entries: ReturnType<typeof buildZoneActionEntries>; onAddToZone: (zone: DeckZone) => boolean }) {
  const close = useCloseCardOverlay()

  // Angosto (el celular de 320 px), «Agregar al Extra Deck» se partía en tres renglones: ahí van uno debajo del otro, en un renglón cada uno.
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-2.5 @max-[15rem]:grid-cols-1">
        {entries.map((entry) => (
          <Button key={entry.zone} variant={entry.variant} size="md" fullWidth onClick={() => {
            if (onAddToZone(entry.zone)) close()
          }}>
            {entry.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
