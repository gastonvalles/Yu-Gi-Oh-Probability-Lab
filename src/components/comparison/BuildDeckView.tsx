import { getDerivedCardId } from '../../app/calculator-state'
import { isCardPendingClassification } from '../../app/build-comparison'
import type { DeckCardInstance } from '../../app/model'
import type { BuildZones } from '../../app/saved-builds'
import { formatInteger } from '../../app/utils'
import { CardArt } from '../CardArt'

const ZONES: ReadonlyArray<{ key: keyof BuildZones; label: string }> = [
  { key: 'main', label: 'Main' },
  { key: 'extra', label: 'Extra' },
  { key: 'side', label: 'Side' },
]

interface BuildDeckViewProps {
  side: 'A' | 'B'
  name: string
  zones: BuildZones
  /** Copias de B menos A por carta del Main (sólo las que cambian). */
  deltaByCardId: ReadonlyMap<string, number>
  onCardClick: (card: DeckCardInstance) => void
}

/** Grilla de una build; en el Main se marcan las cartas que cambian respecto de la otra. */
export function BuildDeckView({ side, name, zones, deltaByCardId, onCardClick }: BuildDeckViewProps) {
  return (
    <section className="comparison-deck" aria-label={`Build ${side}: ${name}`}>
      <header className="comparison-deck-head">
        <span className="comparison-side-badge" data-side={side}>
          {side}
        </span>
        <strong>{name}</strong>
      </header>
      {ZONES.map(({ key, label }) =>
        zones[key].length === 0 ? null : (
          <div key={key} className="comparison-zone">
            <span className="comparison-zone-label">
              {label} [{formatInteger(zones[key].length)}]
            </span>
            <div className="comparison-zone-grid" data-zone={key}>
              {zones[key].map((card, index) => {
                const delta = key === 'main' ? deltaByCardId.get(getDerivedCardId(card.apiCard.ygoprodeckId)) ?? 0 : 0
                // B con más copias que A se marca en B; A con más copias que B, en A.
                const change = side === 'B' ? (delta > 0 ? 'added' : null) : delta < 0 ? 'removed' : null
                const pending = key === 'main' && isCardPendingClassification(card)

                return (
                  <button
                    key={`${card.instanceId}-${index}`}
                    type="button"
                    className="comparison-card"
                    data-change={change ?? 'none'}
                    data-pending={pending ? 'true' : 'false'}
                    title={pending ? `${card.name}: sin clasificar` : card.name}
                    onClick={() => onCardClick(card)}
                  >
                    <CardArt
                      remoteUrl={card.apiCard.imageUrlSmall ?? card.apiCard.imageUrl}
                      name={card.name}
                      className="block aspect-[0.72] w-full bg-input object-cover"
                      limitCard={card.apiCard}
                      limitBadgeSize="sm"
                    />
                  </button>
                )
              })}
            </div>
          </div>
        ),
      )}
    </section>
  )
}
