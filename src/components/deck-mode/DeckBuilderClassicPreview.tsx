import { useState } from 'react'

import type { CardNavigation } from '../../app/card-neighbors'
import {
  buildClassicCardDetailHeader,
  buildClassicCardLevelLine,
  buildClassicCardStatLine,
} from '../../app/deck-builder-classic'
import type { DeckZone } from '../../app/model'
import { foilOf } from '../../app/card-foil'
import { useCardArtOptions } from '../../app/use-card-art-options'
import { Presence } from '../../app/use-presence'
import { t } from '../../i18n'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { buildZoneActionEntries } from '../card-detail/card-zone-actions'
import { CardArtPicker } from '../card-detail/CardArtPicker'
import { CardEffectText } from '../card-detail/CardEffectText'
import { CardEffectTraits } from '../card-detail/CardEffectTraits'
import { CardPricesButton, CardPricesModal } from '../card-detail/CardPrices'
import { TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from '../card-detail/card-tilt'
import { CardFlip, useCardFlip } from '../card-detail/CardFlip'
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
  /** Pasar a la carta anterior y a la siguiente de la lista de la que salió (el builder): las flechas van a los costados de la carta y, hacia el lado donde no hay carta, no se muestran. Sin la prop no hay flechas ni lugar para ellas; con `null` (la búsqueda cambió y la carta ya no está en la lista) el lugar queda, vacío, así la carta no cambia de tamaño. */
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
  // Dar vuelta la carta para ver el dorso: vuelve al frente con otra carta.
  const flip = useCardFlip()
  const [flippedFor, setFlippedFor] = useState(card?.ygoprodeckId)

  if (flippedFor !== card?.ygoprodeckId) {
    setFlippedFor(card?.ygoprodeckId)
    flip.reset()
  }
  // Los artes alternativos de la carta (llegan después de elegirla) y cuál se ve: la elección vale sólo para esa carta.
  const arts = useCardArtOptions(card?.ygoprodeckId ?? null, card?.name ?? '')
  const [picked, setPicked] = useState<{ cardId: number; artId: string } | null>(null)
  const art = card && picked?.cardId === card.ygoprodeckId ? arts.find((option) => option.id === picked.artId) : undefined
  const artUrl = art?.imageUrl ?? card?.imageUrl ?? null

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain border-r border-border-subtle bg-card-background/50 px-4 pb-4 pt-4 [scrollbar-gutter:stable] [scrollbar-width:thin] [&>*]:shrink-0">
      {card ? (
        <>
          {/* El botón de precios va al lado del nombre y no sobre la carta: ella se inclina en 3D y el botón no tiene que moverse con ella. */}
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1">
            <span aria-hidden="true" />
            <Heading level="section" className="text-center leading-tight">
              {card.name}
            </Heading>
            <CardPricesButton className="justify-self-end" onClick={() => setPricesOpen(true)} />
          </div>

          {/* De izquierda a derecha: la flecha de la carta anterior, la galería de artes en vertical (Gastón, 2026-10-19: «la galería de artes debe ser vertical y estar a la izquierda de la carta»), la carta y la flecha de la siguiente, centradas en el alto de la carta. La columna de la galería está siempre (vacía si la carta tiene un solo arte): la carta no cambia de tamaño ni de lugar de una a otra. */}
          <div className={cx('grid min-h-0 items-center gap-1', navigation !== undefined ? 'grid-cols-[2.25rem_2.5rem_minmax(0,1fr)_2.25rem]' : 'grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]')}>
            {navigation !== undefined ? (
              <div className="flex justify-center">
                {navigation?.onPrevious ? (
                  <IconButton size="sm" aria-label={t('search.detail.previous')} title={t('search.detail.previous')} onClick={() => navigation.onPrevious?.()}>
                    <Icon name="chevron-left" />
                  </IconButton>
                ) : null}
              </div>
            ) : null}

            {/* Las miniaturas de los artes, en una franja de 2,5 rem pegada a la carta: la elección vale sólo para esta carta. Afuera de la carta que se inclina, así no se mueve con ella. La caja no tiene alto propio (la galería va `absolute` adentro): mide lo que la fila, o sea la carta, y con muchos artes la galería scrollea por dentro. */}
            <div className="relative w-10 self-stretch">
              <CardArtPicker arts={arts} selectedId={art?.id ?? null} onSelect={(artId) => setPicked({ cardId: card.ygoprodeckId, artId })} fallbackUrl={card.imageUrlSmall ?? card.imageUrl} direction="column" />
            </div>

            {/* La carta se inclina en 3D hacia el mouse (como en el detalle): la perspectiva va en el contenedor y la inclinación en la carta. */}
            <div className="grid min-h-0 justify-items-center">
            <div
              className={cx(
                'relative',
                'w-[min(100%,max(9rem,calc((100dvh-32.5rem)*0.72)))]',
                TILT_PERSPECTIVE,
              )}
            >
              <div
                className={cx('relative aspect-[421/614] touch-none', TILT_ART)}
                title={t('search.flip.title')}
                onPointerDown={(event) => {
                  tiltHandlers.onPointerDown(event)
                  flip.onPointerDown(event)
                }}
                onPointerMove={(event) => {
                  tiltHandlers.onPointerMove(event)
                  flip.onPointerMove(event)
                }}
                onPointerLeave={tiltHandlers.onPointerLeave}
                onPointerUp={flip.onPointerUp}
                onPointerCancel={flip.onPointerCancel}
              >
                <CardFlip turns={flip.turns} flipperRef={flip.flipperRef} loadBack={flip.loadBack} shadow={false} foil={foilOf(art?.printing?.rarity, card.frameType, art?.printing?.variant)}>
                  <button
                    type="button"
                    aria-label={t('deck.classic.zoom')}
                    title={t('deck.classic.zoom')}
                    className="block size-full cursor-zoom-in rounded-none bg-transparent p-0 focus-visible:outline-none focus-visible:shadow-focus"
                    onClick={() => {
                      // Lo que deja un arrastre (dar vuelta la carta) no es un toque: no la agranda.
                      if (!flip.consumeClick()) setZoomed(true)
                    }}
                  >
                    <CardArt remoteUrl={artUrl} fallbackUrl={card.imageUrl} name={card.name} className="h-full w-full bg-transparent object-contain shadow-none" limitCard={card} limitBadgeSize="lg" />
                  </button>
                </CardFlip>
              </div>
            </div>
            </div>

            {navigation !== undefined ? (
              <div className="flex justify-center">
                {navigation?.onNext ? (
                  <IconButton size="sm" aria-label={t('search.detail.next')} title={t('search.detail.next')} onClick={() => navigation.onNext?.()}>
                    <Icon name="chevron-right" />
                  </IconButton>
                ) : null}
              </div>
            ) : (
              <span aria-hidden="true" />
            )}
          </div>

          {/* De qué impresión es el arte elegido: otra rareza, otro set. */}
          <PrintingInfo printing={art?.printing} />

          <article className="grid min-h-48 flex-[1_0_auto] content-start gap-2 border-t border-border-subtle pt-3 text-foreground">
            {detailHeader ? <p className="m-0 whitespace-pre-wrap text-body text-foreground">{detailHeader}</p> : null}
            {condensedStatLine ? <p className="m-0 whitespace-pre-wrap text-body text-foreground">{condensedStatLine}</p> : null}
            <CardEffectTraits ygoprodeckId={card.ygoprodeckId} />
            {card.description ? <CardEffectText text={card.description} className="text-body text-foreground" /> : null}
          </article>

          {/* Los botones son lo último del componente, debajo de la descripción (Gastón, 2026-10-19), y quedan pegados al borde de abajo al desplazar: con una descripción larga no hay que bajar para sumar o quitar una copia. */}
          {(source === 'deck' && deckCopy) || source === 'search' ? (
            // `-bottom-4` y no `bottom-0`: el navegador pega una barra pegada (`sticky`) al borde de abajo del CONTENIDO del que se desplaza, no al de su relleno (`pb-4`); con `bottom-0` quedaban 16 px de hueco debajo de la barra y por ahí se veía pasar el texto (Gastón, 2026-10-21).
            <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 grid gap-2 border-t border-border-subtle bg-card-background px-4 pb-4 pt-3">
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
            </div>
          ) : null}
          {/* Al cerrarse, la carta en grande sigue mientras sale (`Presence`). */}
          <Presence>{zoomed ? <CardZoom card={{ ...card, imageUrl: art?.imageUrlLarge ?? artUrl }} fallbackUrl={art?.imageUrl ?? card.imageUrl} name={card.name} navigation={navigation} arts={arts} artId={art?.id ?? null} onArtChange={(artId) => setPicked({ cardId: card.ygoprodeckId, artId })} onClose={() => setZoomed(false)} /> : null}</Presence>
          <CardPricesModal cardId={card.ygoprodeckId} name={card.name} isOpen={pricesOpen} onClose={() => setPricesOpen(false)} onGoToPrint={() => setPricesOpen(false)} />
        </>
      ) : (
        <div className="grid flex-1 content-center justify-items-center gap-5 text-center">
          <div className="grid justify-items-center gap-2 text-body text-soft">
            <Icon name="image" size={28} className="text-foreground" />
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
    </div>
  )
}
