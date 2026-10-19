import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { CardNavigation } from '../../app/card-neighbors'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { CloseButton } from '../ui/IconButton'
import { CardFlip, FlipHint, useCardFlip } from './CardFlip'
import { CardStepButton } from './CardOverlay'
import { TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from './card-tilt'

interface CardZoomProps {
  card: ApiCardReference
  name: string
  /** La imagen de YGOPRODeck de la carta, por si el arte que se muestra (el escaneo de una impresión) no carga. */
  fallbackUrl?: string | null
  /** Pasar a la carta anterior y a la siguiente de la lista de la que se abrió (flechas a los costados y ← →): `null` en una punta, la flecha no se muestra. */
  navigation?: CardNavigation | null
  onClose: () => void
}

/**
 * La carta en grande, sola sobre el fondo (como al tocarla en el detalle del celular). Se cierra sólo con la X o con Escape
 * (un clic suelto no la cierra, para poder inspeccionarla en 3D); si hay un modal abajo, Escape cierra primero este.
 */
export function CardZoom({ card, name, fallbackUrl = null, navigation = null, onClose }: CardZoomProps) {
  useBodyScrollLock(true)
  useEscapeKey(onClose)
  const flip = useCardFlip()
  const { flip: turnOver, reset } = flip
  const previous = navigation?.onPrevious ?? null
  const next = navigation?.onNext ?? null

  // Al pasar a otra carta vuelve al frente.
  const [shownId, setShownId] = useState(card.ygoprodeckId)

  if (shownId !== card.ygoprodeckId) {
    setShownId(card.ygoprodeckId)
    reset()
  }

  // F da vuelta la carta, como arrastrarla de costado; ← y → pasan a la carta anterior y a la siguiente.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return

      if (event.key.toLowerCase() === 'f') turnOver()
      else if (event.key === 'ArrowLeft' && previous) previous()
      else if (event.key === 'ArrowRight' && next) next()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [turnOver, previous, next])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('search.zoom.aria', { name })}
      className={cx('fixed inset-0 z-250 grid place-items-center bg-background/90 p-4 animate-dialog-enter motion-reduce:animate-none', TILT_PERSPECTIVE)}
    >
      <div
        className={cx('relative aspect-[421/614] h-[min(94dvh,calc((100vw-2rem)*614/421))] max-w-full touch-none', TILT_ART)}
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
      >
        <CardFlip turns={flip.turns} flipperRef={flip.flipperRef} loadBack={flip.loadBack}>
          <CardArt remoteUrl={card.imageUrl ?? card.imageUrlSmall ?? null} fallbackUrl={fallbackUrl} name={name} className="block h-full w-full bg-input object-contain" limitCard={card} limitBadgeSize="lg" />
        </CardFlip>
        <FlipHint />
      </div>
      {/* Las flechas van a los costados de la pantalla, a la altura del centro de la carta; hacia el lado donde no hay carta no se muestra (queda su lugar vacío: la otra sigue en su borde). */}
      {previous || next ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
          {previous ? <CardStepButton direction="previous" onStep={previous} /> : <span />}
          {next ? <CardStepButton direction="next" onStep={next} /> : <span />}
        </div>
      ) : null}
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
