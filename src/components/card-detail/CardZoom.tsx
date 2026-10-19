import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { CloseButton } from '../ui/IconButton'
import { CardFlip, FlipHint, useCardFlip } from './CardFlip'
import { CardGlare, TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from './card-tilt'

interface CardZoomProps {
  card: ApiCardReference
  name: string
  /** La imagen de YGOPRODeck de la carta, por si el arte que se muestra (el escaneo de una impresión) no carga. */
  fallbackUrl?: string | null
  onClose: () => void
}

/**
 * La carta en grande, sola sobre el fondo (como al tocarla en el detalle del celular). Se cierra tocando
 * en cualquier lado, con la X o con Escape; si hay un modal abajo, Escape cierra primero este.
 */
export function CardZoom({ card, name, fallbackUrl = null, onClose }: CardZoomProps) {
  useBodyScrollLock(true)
  useEscapeKey(onClose)
  const flip = useCardFlip()
  const { flip: turnOver } = flip

  // F da vuelta la carta, como arrastrarla hacia arriba o abajo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'f' && !event.altKey && !event.ctrlKey && !event.metaKey) turnOver()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [turnOver])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('search.zoom.aria', { name })}
      className={cx('fixed inset-0 z-250 grid cursor-zoom-out place-items-center bg-background/90 p-4 animate-dialog-enter motion-reduce:animate-none', TILT_PERSPECTIVE)}
      onClick={onClose}
    >
      <div
        className={cx('relative aspect-[421/614] h-[min(94dvh,calc((100vw-2rem)*614/421))] max-w-full touch-pan-y', TILT_ART)}
        title={t('search.flip.title')}
        aria-keyshortcuts="F"
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
        // Lo que deja un arrastre (dar vuelta la carta) no es un toque: no cierra el zoom.
        onClick={(event) => {
          if (flip.consumeClick()) event.stopPropagation()
        }}
      >
        <CardFlip turns={flip.turns} flipperRef={flip.flipperRef} loadBack={flip.loadBack}>
          <CardArt remoteUrl={card.imageUrl ?? card.imageUrlSmall ?? null} fallbackUrl={fallbackUrl} name={name} className="block h-full w-full bg-input object-contain" limitCard={card} limitBadgeSize="lg" />
        </CardFlip>
        <CardGlare />
        <FlipHint />
      </div>
      <CloseButton
        tone="flat"
        size="lg"
        aria-label={t('common.close')}
        className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] z-10"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      />
    </div>,
    document.body,
  )
}
