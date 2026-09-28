import {
  buildClassicCardDetailHeader,
  buildClassicCardLevelLine,
  buildClassicCardStatLine,
} from '../../app/deck-builder-classic'
import type { DeckZone } from '../../app/model'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { buildZoneActionEntries } from '../card-detail/card-zone-actions'
import { DeckCopyControls, type DeckCopyActions } from '../card-detail/DeckCopyControls'
import { Button } from '../ui/Button'

const EMPTY_PREVIEW_GUIDE = {
  step: 'PASO 1',
  title: 'Armá tu deck en el builder',
  description:
    'Buscá una carta y agregala con + o doble clic, o arrastrala a la zona que quieras. Hacé clic en una carta para ver el detalle y sumar o quitar copias.',
} as const

const SHORTCUTS = [
  { keys: 'Doble clic', label: 'agregar' },
  { keys: 'Clic derecho', label: 'quitar del deck' },
] as const

interface DeckBuilderClassicPreviewProps {
  card: ApiCardSearchResult | null
  source: 'search' | 'deck' | null
  deckCopy: DeckCopyActions | null
  onAddToZone: (zone: DeckZone) => void
}

export function DeckBuilderClassicPreview({ card, source, deckCopy, onAddToZone }: DeckBuilderClassicPreviewProps) {
  const detailHeader = card ? buildClassicCardDetailHeader(card) : null
  const levelLine = card ? buildClassicCardLevelLine(card) : null
  const statLine = card ? buildClassicCardStatLine(card) : null
  const condensedStatLine = [levelLine, statLine].filter(Boolean).join(' ')

  return (
    <aside className="classic-builder-preview">
      {!card ? (
        <section className="classic-builder-preview-guide" aria-label="Guía inicial del deck builder">
          <p className="classic-builder-preview-guide-step">{EMPTY_PREVIEW_GUIDE.step}</p>
          <h3 className="classic-builder-preview-guide-heading">{EMPTY_PREVIEW_GUIDE.title}</h3>
          <p className="classic-builder-preview-guide-description">{EMPTY_PREVIEW_GUIDE.description}</p>
          <ul className="classic-builder-shortcuts" aria-label="Atajos">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.keys}>
                <kbd>{shortcut.keys}</kbd> {shortcut.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="classic-builder-preview-title">{card ? card.name : 'Elegí una carta'}</div>

      <div className="classic-builder-preview-art-shell">
        <div className="classic-builder-preview-art-frame">
          {card ? (
            <CardArt
              remoteUrl={card.imageUrl}
              name={card.name}
              className="classic-builder-preview-art"
              limitCard={card}
              limitBadgeSize="lg"
            />
          ) : (
            <div className="classic-builder-preview-empty">Sin carta seleccionada</div>
          )}
        </div>
      </div>

      {card && source === 'deck' && deckCopy ? (
        <div className="classic-builder-preview-actions">
          <DeckCopyControls deckCopy={deckCopy} />
        </div>
      ) : null}

      {card && source === 'search' ? (
        <div className="classic-builder-preview-actions grid gap-2">
          {buildZoneActionEntries(card).map((entry) => (
            <Button key={entry.zone} variant={entry.variant} size="sm" fullWidth onClick={() => onAddToZone(entry.zone)}>
              {entry.label}
            </Button>
          ))}
        </div>
      ) : null}

      <article className="classic-builder-preview-details">
        {card ? (
          <>
            {detailHeader ? <p className="classic-builder-preview-detail-line">{detailHeader}</p> : null}
            {condensedStatLine ? (
              <p className="classic-builder-preview-detail-line">{condensedStatLine}</p>
            ) : null}
            {card.description ? (
              <p className="classic-builder-preview-description">{card.description}</p>
            ) : null}
          </>
        ) : (
          <p className="classic-builder-preview-description">
            Hacé clic en una carta del deck o del buscador para ver su detalle acá.
          </p>
        )}
      </article>
    </aside>
  )
}
