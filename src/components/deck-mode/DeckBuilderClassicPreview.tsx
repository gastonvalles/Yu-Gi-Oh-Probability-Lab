import { useState } from 'react'

import {
  buildClassicCardDetailHeader,
  buildClassicCardLevelLine,
  buildClassicCardStatLine,
} from '../../app/deck-builder-classic'
import type { DeckZone } from '../../app/model'
import { t } from '../../i18n'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { buildZoneActionEntries } from '../card-detail/card-zone-actions'
import { CardPricesButton, CardPricesModal } from '../card-detail/CardPrices'
import { CardGlare, TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from '../card-detail/card-tilt'
import { CardZoom } from '../card-detail/CardZoom'
import { DeckCopyControls, type DeckCopyActions } from '../card-detail/DeckCopyControls'
import { Heading } from '../ui/Heading'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { cx } from '../ui/cx'

/** Nombre corto de la zona para los botones de agregar (el texto completo queda en el tooltip y en lectores de pantalla). */
const ZONE_SHORT_LABEL: Record<DeckZone, string> = { main: 'Main', extra: 'Extra', side: 'Side' }

// Claves de mensajes, no textos: el texto se arma al dibujar, en el idioma de ese momento.
const SHORTCUTS = [
  { keys: 'deck.classic.shortcut.addKeys', label: 'deck.classic.shortcut.add' },
  { keys: 'deck.classic.shortcut.removeKeys', label: 'deck.classic.shortcut.remove' },
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
  // Tocar la imagen la muestra en grande, como en el detalle del celular.
  const [zoomed, setZoomed] = useState(false)
  const [pricesOpen, setPricesOpen] = useState(false)

  return (
    <aside className="flex h-full max-h-full min-h-0 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain border-r border-border-subtle bg-card-background/50 px-4 pb-4 pt-4 [scrollbar-gutter:stable] [scrollbar-width:thin] [&>*]:shrink-0">
      {card ? (
        <>
          <Heading level="section" as="h3" className="text-center leading-tight">
            {card.name}
          </Heading>

          {/* La carta se inclina en 3D hacia el mouse (como en el detalle): la perspectiva va en el contenedor y la inclinación en la carta, con la moneda de precios adentro para que la acompañe. */}
          <div className="grid min-h-0 justify-items-center">
            <div className={cx('relative w-[min(100%,max(9rem,calc((100dvh-var(--app-footer-height)-29rem)*0.72)))]', TILT_PERSPECTIVE)}>
              <div className={cx('relative', TILT_ART)} {...tiltHandlers}>
                <button
                  type="button"
                  aria-label={t('deck.classic.zoom')}
                  title={t('deck.classic.zoom')}
                  className="block w-full cursor-zoom-in rounded-none bg-transparent p-0 focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={() => setZoomed(true)}
                >
                  <CardArt remoteUrl={card.imageUrl} name={card.name} className="w-full bg-transparent shadow-none" limitCard={card} limitBadgeSize="lg" />
                </button>
                <CardGlare />
                <div className="absolute bottom-2 right-2">
                  <CardPricesButton onClick={() => setPricesOpen(true)} />
                </div>
              </div>
            </div>
          </div>

          {source === 'deck' && deckCopy ? <DeckCopyControls deckCopy={deckCopy} /> : null}

          {source === 'search' ? (
            // Uno al lado del otro (Main o Extra, y Side): con el texto corto entran en una fila.
            <div className="flex gap-2">
              {buildZoneActionEntries(card).map((entry) => (
                <Button key={entry.zone} variant={entry.variant} size="sm" icon="plus" className="min-w-0 flex-1" aria-label={entry.label} title={entry.label} onClick={() => onAddToZone(entry.zone)}>
                  {ZONE_SHORT_LABEL[entry.zone]}
                </Button>
              ))}
            </div>
          ) : null}

          <article className="grid min-h-48 flex-[1_0_auto] content-start gap-2 border-t border-border-subtle pt-3 text-foreground">
            {detailHeader ? <p className="m-0 whitespace-pre-wrap text-body text-foreground">{detailHeader}</p> : null}
            {condensedStatLine ? <p className="m-0 whitespace-pre-wrap text-body text-foreground">{condensedStatLine}</p> : null}
            {card.description ? <p className="m-0 whitespace-pre-wrap text-body text-foreground">{card.description}</p> : null}
          </article>
          {zoomed ? <CardZoom card={card} name={card.name} onClose={() => setZoomed(false)} /> : null}
          <CardPricesModal cardId={card.ygoprodeckId} name={card.name} isOpen={pricesOpen} onClose={() => setPricesOpen(false)} />
        </>
      ) : (
        <div className="grid flex-1 content-center justify-items-center gap-5 text-center">
          <div className="grid justify-items-center gap-2 text-body text-soft">
            <Icon name="image" size={28} className="text-primary-soft/70" />
            {t('deck.classic.empty')}
          </div>
          <ul className="m-0 grid list-none gap-1.5 p-0 text-micro text-muted" aria-label={t('deck.classic.shortcuts')}>
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.keys} className="flex items-center justify-center gap-2">
                <kbd className="inline-block rounded-tag border border-b-2 border-border bg-secondary px-1.5 py-0.5 text-center font-[inherit] text-micro font-semibold text-foreground">
                  {t(shortcut.keys)}
                </kbd>
                {t(shortcut.label)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
