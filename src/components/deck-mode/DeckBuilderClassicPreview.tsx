import { useState } from 'react'

import type { CardNavigation } from '../../app/card-neighbors'
import {
  buildClassicCardDetailHeader,
  buildClassicCardLevelLine,
  buildClassicCardStatLine,
} from '../../app/deck-builder-classic'
import type { DeckZone } from '../../app/model'
import { useCardArtOptions } from '../../app/use-card-art-options'
import { t } from '../../i18n'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { buildZoneActionEntries } from '../card-detail/card-zone-actions'
import { CardArtPicker } from '../card-detail/CardArtPicker'
import { CardPricesButton, CardPricesModal } from '../card-detail/CardPrices'
import { CardGlare, TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from '../card-detail/card-tilt'
import { CardZoom } from '../card-detail/CardZoom'
import { PrintingInfo } from '../card-detail/PrintingInfo'
import { DeckCopyControls, type DeckCopyActions } from '../card-detail/DeckCopyControls'
import { Heading } from '../ui/Heading'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
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
  /** Pasar a la carta anterior y a la siguiente de la lista de la que salió (el builder). Sin la prop no hay flechas; con `null` quedan apagadas, así lo de abajo no se corre. */
  navigation?: CardNavigation | null
  onAddToZone: (zone: DeckZone) => void
}

export function DeckBuilderClassicPreview({ card, source, deckCopy, navigation, onAddToZone }: DeckBuilderClassicPreviewProps) {
  const detailHeader = card ? buildClassicCardDetailHeader(card) : null
  const levelLine = card ? buildClassicCardLevelLine(card) : null
  const statLine = card ? buildClassicCardStatLine(card) : null
  const condensedStatLine = [levelLine, statLine].filter(Boolean).join(' ')
  // Tocar la imagen la muestra en grande, como en el detalle del celular.
  const [zoomed, setZoomed] = useState(false)
  const [pricesOpen, setPricesOpen] = useState(false)
  // Los artes alternativos de la carta (llegan después de elegirla) y cuál se ve: la elección vale sólo para esa carta.
  const arts = useCardArtOptions(card?.ygoprodeckId ?? null, card?.name ?? '')
  const [picked, setPicked] = useState<{ cardId: number; artId: string } | null>(null)
  const art = card && picked?.cardId === card.ygoprodeckId ? arts.find((option) => option.id === picked.artId) : undefined
  const artUrl = art?.imageUrl ?? card?.imageUrl ?? null

  return (
    <aside className="flex h-full max-h-full min-h-0 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain border-r border-border-subtle bg-card-background/50 px-4 pb-4 pt-4 [scrollbar-gutter:stable] [scrollbar-width:thin] [&>*]:shrink-0">
      {card ? (
        <>
          {/* El botón de precios va al lado del nombre y no sobre la carta: ella se inclina en 3D y el botón no tiene que moverse con ella. */}
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1">
            <span aria-hidden="true" />
            <Heading level="section" as="h3" className="text-center leading-tight">
              {card.name}
            </Heading>
            <CardPricesButton className="justify-self-end" onClick={() => setPricesOpen(true)} />
          </div>

          {navigation !== undefined ? (
            <div className="flex justify-center gap-2">
              <IconButton size="lg" aria-label={t('search.detail.previous')} title={t('search.detail.previous')} disabled={!navigation?.onPrevious} onClick={() => navigation?.onPrevious?.()}>
                <Icon name="chevron-left" />
              </IconButton>
              <IconButton size="lg" aria-label={t('search.detail.next')} title={t('search.detail.next')} disabled={!navigation?.onNext} onClick={() => navigation?.onNext?.()}>
                <Icon name="chevron-right" />
              </IconButton>
            </div>
          ) : null}

          {/* La carta se inclina en 3D hacia el mouse (como en el detalle): la perspectiva va en el contenedor y la inclinación en la carta. */}
          <div className="grid min-h-0 justify-items-center">
            <div
              className={cx(
                'relative',
                // La fila de flechas le saca su alto (3.5 rem) a lo que le queda a la carta.
                navigation !== undefined ? 'w-[min(100%,max(9rem,calc((100dvh-var(--app-footer-height)-32.5rem)*0.72)))]' : 'w-[min(100%,max(9rem,calc((100dvh-var(--app-footer-height)-29rem)*0.72)))]',
                TILT_PERSPECTIVE,
              )}
            >
              <div className={cx('relative', TILT_ART)} {...tiltHandlers}>
                <button
                  type="button"
                  aria-label={t('deck.classic.zoom')}
                  title={t('deck.classic.zoom')}
                  className="block w-full cursor-zoom-in rounded-none bg-transparent p-0 focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={() => setZoomed(true)}
                >
                  <CardArt remoteUrl={artUrl} fallbackUrl={card.imageUrl} name={card.name} className="w-full bg-transparent shadow-none" limitCard={card} limitBadgeSize="lg" />
                </button>
                <CardGlare />
              </div>
            </div>
          </div>

          <CardArtPicker arts={arts} selectedId={art?.id ?? null} onSelect={(artId) => setPicked({ cardId: card.ygoprodeckId, artId })} fallbackUrl={card.imageUrlSmall ?? card.imageUrl} />

          {/* De qué impresión es el arte elegido: otra rareza, otro set. */}
          <PrintingInfo printing={art?.printing} />

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
          {zoomed ? <CardZoom card={{ ...card, imageUrl: artUrl }} fallbackUrl={card.imageUrl} name={card.name} onClose={() => setZoomed(false)} /> : null}
          <CardPricesModal cardId={card.ygoprodeckId} name={card.name} isOpen={pricesOpen} onClose={() => setPricesOpen(false)} onGoToPrint={() => setPricesOpen(false)} />
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
