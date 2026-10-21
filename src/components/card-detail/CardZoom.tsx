import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { foilOf } from '../../app/card-foil'
import { cardImageSrc } from '../../app/card-image-source'
import type { CardNavigation } from '../../app/card-neighbors'
import type { ArtChoice } from '../../app/use-card-art-options'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { CloseButton } from '../ui/IconButton'
import { CardEffectText } from './CardEffectText'
import { CardEffectTraits } from './CardEffectTraits'
import { CardFlip, FlipHint, useCardFlip } from './CardFlip'
import { CardStepButton } from './CardOverlay'
import { CardZoomBar, stepZoom, type ZoomStep } from './CardZoomBar'
import { buildCardSummary } from './card-summary'
import { TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from './card-tilt'
import { PrintingMenu } from './PrintingMenu'
import { usePinchZoom } from './use-pinch-zoom'

interface CardZoomProps {
  card: ApiCardReference
  name: string
  /** La imagen de YGOPRODeck de la carta, por si el arte que se muestra (el escaneo de una impresión) no carga. */
  fallbackUrl?: string | null
  /** Pasar a la carta anterior y a la siguiente de la lista de la que se abrió (flechas a los costados y ← →): `null` en una punta, la flecha no se muestra. */
  navigation?: CardNavigation | null
  /** Los artes de la carta y cuál se ve (`card.imageUrl` ya es el de éste): con ellos, arriba a la izquierda sale la impresión y su lista para pasar de una a otra. Sin `onArtChange` no hay lista. */
  arts?: readonly ArtChoice[]
  artId?: string | null
  onArtChange?: (artId: string) => void
  onClose: () => void
}

const NO_ARTS: readonly ArtChoice[] = []

/** Un clic sobre una barra de desplazamiento (no sobre el contenido ni el fondo): arrastrar la barra no cierra el zoom. */
function onScrollbar(event: MouseEvent<HTMLElement>): boolean {
  const box = event.currentTarget.getBoundingClientRect()

  return event.clientX - box.left >= event.currentTarget.clientWidth || event.clientY - box.top >= event.currentTarget.clientHeight
}

/**
 * La carta en grande, sola sobre el fondo (como al tocarla en el detalle del celular). Se cierra con la X, con Escape o al tocar afuera de la carta (en el fondo);
 * la carta en sí no cierra nada: se gira y se arrastra para inspeccionarla en 3D. Si hay un modal abajo, Escape cierra primero este.
 * Abajo, la barra con el zoom (100 %, 150 %, 200 %, 300 %: más grande que la pantalla, se desplaza con el dedo, la rueda o las barras; el giro 3D sólo va al 100 %; también se cambia con Ctrl + la rueda y pellizcando con dos dedos, `usePinchZoom`) y «Leer texto de efecto», que muestra
 * el texto resaltado sobre la carta; detrás, la misma carta agrandada y desenfocada, como en la referencia; arriba a la izquierda, la impresión (ver `PrintingMenu`). Teclas: F da vuelta la carta, + y − cambian el zoom, 0 vuelve al 100 %, ← y → pasan de carta.
 */
export function CardZoom({ card, name, fallbackUrl = null, navigation = null, arts = NO_ARTS, artId = null, onArtChange, onClose }: CardZoomProps) {
  useBodyScrollLock(true)
  const [menuOpen, setMenuOpen] = useState(false)
  // Escape cierra primero la lista de impresiones y después el zoom.
  useEscapeKey(() => (menuOpen ? setMenuOpen(false) : onClose()))
  const flip = useCardFlip()
  const { flip: turnOver, reset } = flip
  const previous = navigation?.onPrevious ?? null
  const next = navigation?.onNext ?? null
  const [scale, setScale] = useState<ZoomStep>(1)
  const [reading, setReading] = useState(false)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const stepZoomBy = useCallback((by: 1 | -1) => setScale((current) => stepZoom(current, by)), [])
  // Ctrl + la rueda (o el pellizco del trackpad) y dos dedos cambian el zoom; el segundo dedo cancela el giro que había empezado el primero.
  usePinchZoom(canvasRef, stepZoomBy, flip.cancel)
  // Más grande que la pantalla, arrastrar desplaza la carta: el giro y la inclinación sólo van al 100 %.
  const inspecting = scale === 1
  const summary = buildCardSummary(card)
  // La carta de fondo, desenfocada: la chica alcanza.
  const backdrop = card.imageUrlSmall ?? card.imageUrl ?? fallbackUrl
  // El brillo de la rareza de la impresión que se ve.
  const printing = arts.find((art) => art.id === artId)?.printing
  const foil = foilOf(printing?.rarity, card.frameType, printing?.variant)

  // Al pasar a otra carta vuelve al frente.
  const [shownId, setShownId] = useState(card.ygoprodeckId)

  if (shownId !== card.ygoprodeckId) {
    setShownId(card.ygoprodeckId)
    reset()
  }

  // F da vuelta la carta, como arrastrarla de costado; ← y → pasan a la carta anterior y a la siguiente; + y − cambian el zoom y 0 lo vuelve al 100 %.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return

      if (event.key.toLowerCase() === 'f') turnOver()
      else if (event.key === 'ArrowLeft' && previous) previous()
      else if (event.key === 'ArrowRight' && next) next()
      else if (event.key === '+' || event.key === '=') setScale((current) => stepZoom(current, 1))
      else if (event.key === '-') setScale((current) => stepZoom(current, -1))
      else if (event.key === '0') setScale(1)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [turnOver, previous, next])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('search.zoom.aria', { name })}
      // Para el detalle fijo del duelo: tocar adentro de la carta en grande no le suelta la carta fija (`use-dock-peek`).
      data-card-zoom=""
      className="fixed inset-0 z-250 cursor-zoom-out bg-background/90 animate-dialog-enter motion-reduce:animate-none"
      onClick={() => (menuOpen ? setMenuOpen(false) : onClose())}
    >
      {/* La misma carta, agrandada y desenfocada, de fondo: no es contenido (sin texto alternativo ni toques) y con movimiento reducido no se dibuja. */}
      {backdrop ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
          <img src={cardImageSrc(backdrop)} alt="" draggable={false} className="block size-full scale-125 object-cover opacity-35 blur-3xl" />
        </span>
      ) : null}
      {/* El lienzo se desplaza cuando la carta es más grande que la pantalla; `m-auto` la centra mientras entra (con `place-items-center` las puntas quedarían cortadas, sin forma de llegar a ellas). Un pellizco no acerca la página: lo toma `usePinchZoom`. */}
      <div ref={canvasRef} className="absolute inset-0 overflow-auto overscroll-contain [touch-action:pan-x_pan-y]" onClick={(event) => onScrollbar(event) && event.stopPropagation()}>
        <div className={cx('flex min-h-full min-w-full p-4', TILT_PERSPECTIVE)}>
          <div
            className={cx(
              'relative m-auto aspect-[421/614] h-[calc(min(94dvh,calc((100vw-2rem)*614/421))*var(--zoom))]',
              inspecting ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-default',
              TILT_ART,
            )}
            style={{ '--zoom': scale } as CSSProperties}
            title={inspecting ? t('search.flip.title') : undefined}
            aria-keyshortcuts="F"
            onPointerDown={inspecting ? (event) => {
              tiltHandlers.onPointerDown(event)
              flip.onPointerDown(event)
            } : undefined}
            onPointerMove={inspecting ? (event) => {
              tiltHandlers.onPointerMove(event)
              flip.onPointerMove(event)
            } : undefined}
            onPointerLeave={inspecting ? tiltHandlers.onPointerLeave : undefined}
            onPointerUp={flip.onPointerUp}
            onPointerCancel={flip.onPointerCancel}
            // Tocar o arrastrar la carta no cierra el zoom (sólo el fondo); lo que deja un arrastre se descarta.
            onClick={(event) => {
              event.stopPropagation()
              flip.consumeClick()
            }}
          >
            <CardFlip turns={flip.turns} flipperRef={flip.flipperRef} loadBack={flip.loadBack} foil={foil}>
              <CardArt remoteUrl={card.imageUrl ?? card.imageUrlSmall ?? null} fallbackUrl={fallbackUrl} name={name} className="block h-full w-full bg-input object-contain" limitCard={card} limitBadgeSize="lg" />
            </CardFlip>
            {inspecting ? <FlipHint /> : null}
          </div>
        </div>
      </div>
      {/* El texto del efecto, resaltado, sobre la carta: en el arte extendido o en un escaneo el de la imagen no se lee. */}
      {reading ? (
        <section
          aria-label={t('search.detail.panel')}
          className="absolute inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 mx-auto grid max-h-[45dvh] w-[min(100%,40rem)] cursor-auto content-start gap-2 overflow-y-auto overscroll-contain rounded-card border border-primary/40 bg-card-background/96 p-4 shadow-overlay"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="grid gap-1">
            <Heading level="card">{name}</Heading>
            <p className="m-0 text-body text-muted [overflow-wrap:anywhere]">{`${summary.typeLine}${summary.statLine ? ` · ${summary.statLine}` : ''}`}</p>
          </header>
          <CardEffectTraits ygoprodeckId={card.ygoprodeckId} />
          <CardEffectText text={card.description?.trim() || t('search.detail.noText')} className="text-lead" />
        </section>
      ) : null}
      {/* Las flechas van a los costados de la pantalla, a la altura del centro de la carta; hacia el lado donde no hay carta no se muestra (queda su lugar vacío: la otra sigue en su borde). */}
      {previous || next ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
          {previous ? <CardStepButton direction="previous" onStep={previous} /> : <span />}
          {next ? <CardStepButton direction="next" onStep={next} /> : <span />}
        </div>
      ) : null}
      {onArtChange ? <PrintingMenu arts={arts} artId={artId} open={menuOpen} onOpen={setMenuOpen} onPick={onArtChange} /> : null}
      <CardZoomBar scale={scale} onScale={setScale} reading={reading} onReading={setReading} />
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
