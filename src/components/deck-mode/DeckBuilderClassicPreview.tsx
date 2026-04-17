import {
  buildClassicCardDetailHeader,
  buildClassicCardLevelLine,
  buildClassicCardStatLine,
} from '../../app/deck-builder-classic'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'

const EMPTY_PREVIEW_GUIDE = {
  step: 'PASO 1',
  title: 'Armá tu deck en el builder',
  description:
    'Buscá cartas en el buscador, agregalas con tap y reordená la lista arrastrando entre Main, Extra y Side. Mantené presionado para ver o eliminar y tocá una vez la carta para ver el detalle.',
} as const

interface DeckBuilderClassicPreviewProps {
  card: ApiCardSearchResult | null
}

export function DeckBuilderClassicPreview({ card }: DeckBuilderClassicPreviewProps) {
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
        </section>
      ) : null}

      <div className="classic-builder-preview-title">{card ? card.name : 'Select a card'}</div>

      <div className="classic-builder-preview-art-shell">
        {card ? (
          <div className="classic-builder-preview-art-frame">
            <CardArt
              remoteUrl={card.imageUrl}
              name={card.name}
              className="classic-builder-preview-art"
              limitCard={card}
              limitBadgeSize="lg"
            />
          </div>
        ) : (
          <div className="classic-builder-preview-empty">No card selected</div>
        )}
      </div>

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
            Pick a card from the deck or the search results to inspect it here.
          </p>
        )}
      </article>
    </aside>
  )
}
