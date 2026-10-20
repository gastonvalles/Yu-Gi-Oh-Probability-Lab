import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { CardNavigation } from '../../app/card-neighbors'
import { UI_ANIMATION_MS, prefersReducedMotion } from '../../app/motion'
import { foilOf } from '../../app/card-foil'
import { useCardArtOptions, type ArtChoice } from '../../app/use-card-art-options'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { cx } from '../ui/cx'
import { CloseButton, IconButton } from '../ui/IconButton'
import { CardArtPicker } from './CardArtPicker'
import { CardPricesButton, CardPricesModal } from './CardPrices'
import { PrintingInfo, SelectedPrintingContext, useSelectedPrinting } from './PrintingInfo'
import { CardFlip, FlipHint, useCardFlip } from './CardFlip'
import { levelOut, tiltHandlers } from './card-tilt'

const CLOSE_MS = 180
/** Cómo se abren los precios desde adentro del panel: el pie con botones (Anterior / Siguiente) lleva el $ en su misma fila y avisa que está para que el panel no dibuje otro. */
const PricesContext = createContext<{ openPrices: () => void; registerFooter: (mounted: boolean) => void } | null>(null)
const EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)'
/** Lo que la carta nueva tarda en aparecer al pasar a otra, y cuánto se desliza desde el lado de donde viene. */
const SWITCH_MS = 180
const SWITCH_SLIDE_PX = 28
/** Cuánto hay que arrastrar el dedo de costado, fuera de la carta, para que cuente como deslizar a la de al lado, y cuánto más ancho que alto tiene que ser. */
const SWIPE_MIN_PX = 48
const SWIPE_RATIO = 1.5

interface CardOverlayProps {
  /** Texto accesible del diálogo ("Detalle de X", "Clasificar X"). */
  ariaLabel: string
  /** Texto accesible del panel de abajo. */
  panelLabel: string
  name: string
  card: ApiCardReference | null
  /** Rectángulo desde el que "vuela" la carta al abrir (lo usa la práctica). */
  origin?: DOMRect | null
  /** Panel más alto y carta más chica: para el que lleva muchos controles (clasificación). */
  tall?: boolean
  /** Algo encima de la carta, en la esquina superior derecha (p. ej. la flecha de tendencia del meta). */
  artOverlay?: ReactNode
  /** El arte con el que se abre (p. ej. el de la impresión que se tocó en una expansión): arranca elegido y se ve de entrada. */
  initialArt?: Pick<ArtChoice, 'id' | 'imageUrl'>
  /**
   * Pasar a la carta anterior y a la siguiente de la lista de la que se abrió (sin cerrar): dos flechas a los costados de la carta, ← y → del teclado y,
   * en el celular, deslizar la carta de costado. Quien tiene la lista cambia `card` (y el panel que le pasa); el marco se queda y sólo acomoda lo suyo:
   * el arte elegido vuelve al primero, el panel al principio y la carta nueva aparece con un fundido. Sin esto, o sin ningún vecino, no hay flechas.
   */
  navigation?: CardNavigation | null
  onClose: () => void
  /** Contenido del panel: `CardPanelHeader`, `CardPanelBody` y, si hace falta, `CardPanelFooter`. */
  children: ReactNode
}

function flightFrom(card: HTMLElement, origin: DOMRect): string {
  const target = card.getBoundingClientRect()
  const dx = origin.left + origin.width / 2 - (target.left + target.width / 2)
  const dy = origin.top + origin.height / 2 - (target.top + target.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${origin.width / Math.max(1, target.width)})`
}

/**
 * Marco común de los modales de carta (detalle, clasificación y meta): la carta arriba, que se agranda al
 * tocarla, y un panel con su información abajo (en escritorio, la carta a la izquierda y el panel a la derecha, del mismo alto que ella). Una X blanca arriba a la derecha lo cierra; sólo la
 * carta y el panel interceptan los toques del fondo. Si la carta tiene datos, al lado de ella (afuera, para que no se mueva con la inclinación
 * 3D) lleva el botón de precios de TCGplayer, que abre el modal de precios y recién ahí los pide, y, si tiene artes alternativos, sus
 * miniaturas para cambiar el arte grande.
 */
export function CardOverlay(props: CardOverlayProps) {
  const { card, name } = props
  const [pricesOpen, setPricesOpen] = useState(false)

  return (
    <>
      <CardOverlayFrame {...props} onOpenPrices={card ? () => setPricesOpen(true) : null} />
      {/* Hermano del marco, no hijo: los clics de React suben por los portales y tocar el modal cerraría la carta. */}
      {card ? <CardPricesModal
          cardId={card.ygoprodeckId}
          name={name}
          isOpen={pricesOpen}
          onClose={() => setPricesOpen(false)}
          onGoToPrint={() => {
            setPricesOpen(false)
            props.onClose()
          }}
        /> : null}
    </>
  )
}

function CardOverlayFrame({ ariaLabel, panelLabel, name, card, origin = null, tall = false, artOverlay = null, initialArt, navigation = null, onOpenPrices = null, onClose, children }: CardOverlayProps & { onOpenPrices?: (() => void) | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const closingRef = useRef(false)
  // En escritorio sobra ancho: la carta a la izquierda y el panel a la derecha, del mismo alto (en el celular, uno sobre el otro).
  const wide = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // Tocar la carta la agranda al máximo; tocarla de nuevo (o el fondo) vuelve al panel. Un toque afuera de la carta y del panel cierra de a un nivel (la carta en 3D se toca, gira y arrastra sin cerrar nada).
  const [zoomed, setZoomed] = useState(false)
  // Un pie con botones lleva el $ en su fila; sin pie, el $ va solo abajo a la derecha del texto.
  const [hasFooter, setHasFooter] = useState(false)
  const pricesSlot = useMemo(() => (onOpenPrices ? { openPrices: onOpenPrices, registerFooter: setHasFooter } : null), [onOpenPrices])
  const animationsRef = useRef<Animation[]>([])
  // Los artes de la carta (los de YGOPRODeck y las impresiones: llegan después de abrir) y cuál se ve.
  const cardId = card?.ygoprodeckId ?? null
  const arts = useCardArtOptions(cardId, name)
  const [artId, setArtId] = useState<string | null>(initialArt?.id ?? null)
  // Al pasar a otra carta (flechas del detalle, o quien lo tiene abierto la cambia) —o a otra impresión de la misma, en Expansiones— el arte elegido era
  // del anterior: vuelve al primero (o al arte con el que se abre).
  const shownKey = `${cardId}|${initialArt?.id ?? ''}`
  const [lastKey, setLastKey] = useState(shownKey)
  // Girar la carta (ver el dorso) arrastrándola hacia donde sea, o dar vuelta con la tecla F: también vuelve al frente al pasar a otra.
  const flip = useCardFlip()
  if (lastKey !== shownKey) {
    setLastKey(shownKey)
    setArtId(initialArt?.id ?? null)
    flip.reset()
  }
  const art = arts.find((option) => option.id === artId) ?? (initialArt && artId === initialArt.id ? initialArt : undefined)
  // Hacia dónde se fue en el último pase (1: siguiente, -1: anterior), para que la carta nueva venga de ese lado.
  const directionRef = useRef<1 | -1 | 0>(0)
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  const swipedRef = useRef(false)

  useBodyScrollLock(true)

  useLayoutEffect(() => {
    const art = cardRef.current
    closingRef.current = false

    if (art && typeof art.animate === 'function' && !prefersReducedMotion()) {
      const fade = rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
      const panel = panelRef.current?.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
        { duration: UI_ANIMATION_MS, easing: EASE },
      )
      const flight = art.animate(
        [{ transform: origin ? flightFrom(art, origin) : 'scale(0.96)' }, { transform: 'none' }],
        { duration: UI_ANIMATION_MS, easing: EASE },
      )
      animationsRef.current = [fade, panel, flight].filter((animation): animation is Animation => Boolean(animation))
    }

    return () => {
      animationsRef.current.forEach((animation) => animation.cancel())
      animationsRef.current = []
    }
  }, [origin])

  useEffect(() => {
    const previousFocus = document.activeElement
    const panel = panelRef.current
    ;(panel?.querySelector<HTMLElement>('[data-initial-focus]') ?? panel)?.focus({ preventScroll: true })
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [])

  // Al aparecer otra carta en el mismo marco: el panel vuelve arriba, el foco no se pierde (si estaba en algo que ya no está o quedó apagado, pasa al panel) y la
  // carta nueva llega con un fundido desde el lado al que se fue. No corre al abrir: de eso se ocupa el vuelo de arriba.
  const previousKey = useRef(shownKey)
  useLayoutEffect(() => {
    if (previousKey.current === shownKey) return
    previousKey.current = shownKey

    const direction = directionRef.current
    const panel = panelRef.current
    const art = cardRef.current
    const focused = document.activeElement
    directionRef.current = 0

    panel?.querySelectorAll('[data-initial-focus]').forEach((body) => {
      body.scrollTop = 0
    })

    if (!focused || !rootRef.current?.contains(focused) || (focused instanceof HTMLButtonElement && focused.disabled)) {
      ;(panel?.querySelector<HTMLElement>('[data-initial-focus]') ?? panel)?.focus({ preventScroll: true })
    }

    if (art && panel && typeof art.animate === 'function' && !prefersReducedMotion()) {
      const options = { duration: SWITCH_MS, easing: 'ease-out' } as const

      animationsRef.current.push(
        art.animate([{ opacity: 0, transform: `translateX(${direction * SWITCH_SLIDE_PX}px)` }, { opacity: 1, transform: 'none' }], options),
        panel.animate([{ opacity: 0 }, { opacity: 1 }], options),
      )
    }
  }, [shownKey])

  const goTo = (direction: 'previous' | 'next') => {
    const step = direction === 'previous' ? navigation?.onPrevious : navigation?.onNext

    if (!step || closingRef.current) return
    directionRef.current = direction === 'next' ? 1 : -1
    step()
  }
  const hasNavigation = Boolean(navigation && (navigation.onPrevious || navigation.onNext))

  const close = () => {
    if (closingRef.current) return
    closingRef.current = true

    const art = cardRef.current
    const root = rootRef.current
    if (!art || !root || typeof art.animate !== 'function' || prefersReducedMotion()) {
      onClose()
      return
    }

    const opacity = getComputedStyle(root).opacity
    const transform = getComputedStyle(art).transform
    animationsRef.current.forEach((animation) => animation.cancel())
    const options = { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' } as const
    const fade = root.animate([{ opacity }, { opacity: 0 }], options)
    const flight = art.animate(
      [{ transform }, { transform: origin ? flightFrom(art, origin) : 'scale(0.96)' }],
      options,
    )
    animationsRef.current = [fade, flight]
    void fade.finished.then(onClose, () => {})
  }

  useEscapeKey(close)

  return createPortal(
    <div
      ref={rootRef}
      className={cx(
        'fixed inset-0 z-240 grid place-items-center bg-background/90 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] [@media(max-height:540px)]:[--detail-art-height:28dvh] [@media(max-height:540px)]:py-3',
        // Al clasificar la carta se ve grande (32dvh): el panel de abajo cede espacio y su cuerpo scrollea si hace falta.
        wide ? '[--detail-art-height:min(72dvh,34rem)]' : tall ? '[--detail-art-height:min(32dvh,20rem)] [--detail-panel-height:min(64dvh,36rem)]' : '[--detail-art-height:min(36dvh,20rem)] [--detail-panel-height:min(52dvh,28rem)]',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onPointerDown={(event) => {
        swipedRef.current = false
        // Sólo con el dedo, con vecinos y fuera de la carta (esa se arrastra para darla vuelta) y de lo que se toca (botones, campos).
        const onCard = event.target instanceof HTMLElement && event.target.closest('[aria-keyshortcuts="F"], button, a, input, textarea, select')

        swipeRef.current = hasNavigation && event.pointerType === 'touch' && !onCard ? { x: event.clientX, y: event.clientY } : null
      }}
      onPointerUp={(event) => {
        const start = swipeRef.current
        swipeRef.current = null

        if (!start) return
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y

        if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return
        swipedRef.current = true
        goTo(dx < 0 ? 'next' : 'previous')
      }}
      onPointerCancel={() => {
        swipeRef.current = null
      }}
      onClick={() => {
        // Lo que deja un deslizamiento no es un toque.
        if (swipedRef.current) {
          swipedRef.current = false
          return
        }

        // Un toque afuera de la carta y del panel (el fondo) cierra de a un nivel: con la carta agrandada vuelve al detalle; en el detalle, lo cierra. La carta se toca, se gira y se arrastra sin cerrar nada.
        if (zoomed) setZoomed(false)
        else close()
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          // Con una tecla de edición o dentro de un campo de texto, las flechas son del cursor.
          const editing = event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')

          if (hasNavigation && !editing && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault()
            goTo(event.key === 'ArrowLeft' ? 'previous' : 'next')
          }

          return
        }

        // F: da vuelta la carta (el gesto del arrastre, desde el teclado).
        if (event.key.toLowerCase() === 'f' && !event.altKey && !event.ctrlKey && !event.metaKey && !(event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]'))) {
          event.preventDefault()
          flip.flip()

          return
        }

        if (event.key !== 'Tab') return
        const focusable = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('*') ?? [])
          .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled'))
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}
    >
      <div
        className={cx('group pointer-events-none relative flex max-h-full [perspective:900px]', wide ? 'w-[min(100%,66rem)] flex-row items-center gap-14' : cx('flex-col items-center gap-3 [@media(max-height:540px)]:gap-2', tall ? 'w-[min(100%,36rem)]' : 'w-[min(100%,32rem)]'), 'data-[zoomed=true]:w-full data-[zoomed=true]:justify-center')}
        data-zoomed={zoomed ? 'true' : 'false'}
      >
        {/* El envoltorio no se inclina ni vuela: lo que va al costado de la carta (artes y precios) queda quieto mientras ella se mueve. */}
        <div className="pointer-events-none relative max-w-full flex-none">
          <div
            ref={cardRef}
            className={cx(
              'group/art pointer-events-auto relative aspect-[421/614] h-(--detail-art-height) max-w-full flex-none cursor-zoom-in transition-[height,rotate] duration-(--motion-duration) ease-[cubic-bezier(0.2,0.9,0.25,1)] group-data-[zoomed=true]:h-[min(94dvh,calc((100vw-2rem)*614/421))]',
              // El dedo es de la carta (la gira hacia donde se arrastre): sobre ella no desplaza la pantalla.
              'touch-none',
            )}
            role="button"
            tabIndex={-1}
            aria-label={zoomed ? t('search.overlay.backToDetail') : t('search.overlay.zoomIn')}
            aria-keyshortcuts="F"
            title={t('search.flip.title')}
            // La inclinación en 3D (ver card-tilt), también con la carta agrandada.
            {...tiltHandlers}
            onPointerMove={(event) => {
              tiltHandlers.onPointerMove(event)
              flip.onPointerMove(event)
            }}
            onPointerDown={(event) => {
              tiltHandlers.onPointerDown(event)
              flip.onPointerDown(event)
            }}
            onPointerUp={flip.onPointerUp}
            onPointerCancel={flip.onPointerCancel}
            onClick={(event) => {
              event.stopPropagation()

              // Lo que deja un arrastre (dar vuelta la carta) no es un toque: no agranda la carta.
              if (flip.consumeClick()) return

              levelOut(event.currentTarget)
              setZoomed((current) => !current)
            }}
          >
            <CardFlip turns={flip.turns} flipperRef={flip.flipperRef} loadBack={flip.loadBack} foil={card ? foilOf((art as ArtChoice | undefined)?.printing?.rarity, card.frameType) : null}>
              <CardArt
                // Agrandada, la imagen grande de la impresión (~1000 px), como en el zoom a pantalla completa; sin ella (un arte de YGOPRODeck), la de siempre.
                remoteUrl={(zoomed ? (art as ArtChoice | undefined)?.imageUrlLarge : undefined) ?? art?.imageUrl ?? card?.imageUrl ?? card?.imageUrlSmall ?? null}
                fallbackUrl={art?.imageUrl ?? card?.imageUrl ?? card?.imageUrlSmall ?? null}
                name={name}
                className="block h-full w-full bg-input object-contain"
                limitCard={card}
                limitBadgeSize="lg"
              />
            </CardFlip>
            {artOverlay ? <div className="absolute right-2 top-2 z-1">{artOverlay}</div> : null}
            <FlipHint />
          </div>
          {arts.length > 1 ? (
            <div className="pointer-events-auto absolute inset-y-0 -left-12 w-10 group-data-[zoomed=true]:hidden">
              <CardArtPicker arts={arts} selectedId={art?.id ?? null} onSelect={setArtId} fallbackUrl={card?.imageUrlSmall ?? card?.imageUrl ?? null} direction="column" />
            </div>
          ) : null}
          {/* Las flechas van afuera de la carta y de lo que va a sus costados (artes y precios), en el centro del alto de la carta: en el celular, en los bordes de la pantalla. */}
          {hasNavigation && !wide ? (
            <div className="pointer-events-none absolute left-1/2 top-0 flex h-full w-[min(100vw,calc(100%+12.5rem))] -translate-x-1/2 items-center justify-between pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] group-data-[zoomed=true]:hidden">
              {/* Hacia el lado donde no hay carta, la flecha no se muestra (queda su lugar vacío: la otra sigue en su borde). */}
              {navigation?.onPrevious ? <CardStepButton direction="previous" onStep={() => goTo('previous')} /> : <span />}
              {navigation?.onNext ? <CardStepButton direction="next" onStep={() => goTo('next')} /> : <span />}
            </div>
          ) : null}
        </div>
        {hasNavigation && wide ? (
          <div className="pointer-events-none absolute left-1/2 top-0 flex h-full w-[min(100vw,calc(100%+13rem))] -translate-x-1/2 items-center justify-between group-data-[zoomed=true]:hidden">
            {navigation?.onPrevious ? <CardStepButton direction="previous" onStep={() => goTo('previous')} /> : <span />}
            {navigation?.onNext ? <CardStepButton direction="next" onStep={() => goTo('next')} /> : <span />}
          </div>
        ) : null}
        <section
          ref={panelRef}
          tabIndex={-1}
          className={cx('pointer-events-auto flex min-h-0 w-full flex-col gap-[0.4rem] rounded-card border border-primary/40 bg-linear-to-b from-card-background/98 to-background/98 px-4 py-[0.9rem] text-white outline-none group-data-[zoomed=true]:hidden [@media(max-height:540px)]:px-[0.85rem] [@media(max-height:540px)]:py-[0.65rem]', wide ? 'h-(--detail-art-height) min-w-0 flex-1' : cx('[@media(max-height:540px)]:h-[calc(100dvh-var(--detail-art-height)-2rem)]', tall ? 'max-h-(--detail-panel-height)' : 'h-(--detail-panel-height)'))}
          aria-label={panelLabel}
          onClick={(event) => event.stopPropagation()}
        >
          {/* El panel dice de qué impresión es el arte que se ve: al cambiar de arte (otra rareza, otro set) cambia también lo que dice. */}
          <PricesContext.Provider value={pricesSlot}>
            <SelectedPrintingContext.Provider value={(art as ArtChoice | undefined)?.printing}>{children}</SelectedPrintingContext.Provider>
          </PricesContext.Provider>
          {/* El $ de los precios, en la esquina de abajo a la derecha del texto de la carta: en el flujo, abajo del todo, así no tapa el texto. Si el panel tiene un pie con botones, el $ va en la fila de esos botones (no pasa su línea) y éste no se dibuja. */}
          {onOpenPrices && !hasFooter ? (
            <div className="-mb-2 -mr-2 flex flex-none justify-end">
              <CardPricesButton onClick={onOpenPrices} />
            </div>
          ) : null}
        </section>
      </div>

      {/* La última del orden de tabulación: primero el contenido, después la X. */}
      <CloseButton
        tone="flat"
        size="lg"
        aria-label={t('common.close')}
        className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] z-10"
        onClick={(event) => {
          event.stopPropagation()
          close()
        }}
      />

      {/* Al pasar de carta el lector de pantalla oye cuál es. */}
      {hasNavigation ? (
        <p className="sr-only" aria-live="polite">
          {name}
        </p>
      ) : null}
    </div>,
    document.body,
  )
}

/** Una flecha del detalle (anterior o siguiente): 44 px de toque. En la punta de la lista no se muestra (quien la usa sólo la pone si hay a dónde ir). */
export function CardStepButton({ direction, onStep }: { direction: 'previous' | 'next'; onStep: () => void }) {
  const label = t(direction === 'previous' ? 'search.detail.previous' : 'search.detail.next')

  return (
    <div className="pointer-events-auto" onClick={(event) => event.stopPropagation()}>
      <IconButton size="lg" aria-label={label} title={label} onClick={onStep}>
        <Icon name={direction === 'previous' ? 'chevron-left' : 'chevron-right'} />
      </IconButton>
    </div>
  )
}

/** Encabezado del panel: el nombre y, debajo, las líneas de contexto que haya (tipo y estadísticas, copias…). */
export function CardPanelHeader({ title, lines }: { title: string; lines: ReadonlyArray<ReactNode> }) {
  const printing = useSelectedPrinting()
  const visible = lines.filter((line) => line !== null && line !== undefined && line !== false && line !== '')

  return (
    <header className="grid flex-none gap-1">
      <Heading level="section">{title}</Heading>
      {visible.map((line, index) => (
        <p key={index} className="m-0 text-body text-white/66 [overflow-wrap:anywhere]">
          {line}
        </p>
      ))}
      <PrintingInfo printing={printing} className="mt-1" />
    </header>
  )
}

/** Cuerpo del panel: se desplaza solo y recibe el foco al abrir. */
export function CardPanelBody({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      data-initial-focus
      className={cx(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-tint/10 pr-[0.2rem] pt-[0.55rem] text-white outline-none focus-visible:border-t-primary/65',
        className,
      )}
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      {children}
    </div>
  )
}

/** Pie del panel: las acciones, separadas por una línea fina, y a la derecha de la última fila el $ de los precios (en la misma línea que los botones). */
export function CardPanelFooter({ children }: { children: ReactNode }) {
  const prices = useContext(PricesContext)
  const registerFooter = prices?.registerFooter

  useLayoutEffect(() => {
    registerFooter?.(true)

    return () => registerFooter?.(false)
  }, [registerFooter])

  return (
    <footer className="flex flex-none items-end gap-2 border-t border-tint/10 pt-[0.65rem]">
      <div className="grid min-w-0 flex-1 gap-2">{children}</div>
      {prices ? <CardPricesButton className="-mr-2" onClick={prices.openPrices} /> : null}
    </footer>
  )
}
