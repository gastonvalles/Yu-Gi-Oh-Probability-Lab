import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { UI_ANIMATION_MS, prefersReducedMotion } from '../../app/motion'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { CloseButton } from '../ui/IconButton'

const CLOSE_MS = 180
const EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)'

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
 * Marco común de los modales de carta (detalle y clasificación): la carta arriba, que se agranda al
 * tocarla, y un panel con su información abajo. Una X blanca arriba a la derecha lo cierra; sólo la
 * carta y el panel interceptan los toques del fondo.
 */
export function CardOverlay({ ariaLabel, panelLabel, name, card, origin = null, tall = false, onClose, children }: CardOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const closingRef = useRef(false)
  // Tocar la carta la agranda al máximo; tocarla de nuevo (o el fondo) vuelve al panel.
  const [zoomed, setZoomed] = useState(false)
  const animationsRef = useRef<Animation[]>([])

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
        'fixed inset-0 z-240 grid place-items-center bg-background/90 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] min-[1101px]:backdrop-blur-[8px] [@media(max-height:540px)]:[--detail-art-height:28dvh] [@media(max-height:540px)]:py-3',
        tall ? '[--detail-art-height:min(24dvh,14rem)] [--detail-panel-height:min(68dvh,36rem)]' : '[--detail-art-height:min(36dvh,20rem)] [--detail-panel-height:min(52dvh,28rem)]',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={() => (zoomed ? setZoomed(false) : close())}
      onKeyDown={(event) => {
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
        className={cx('group pointer-events-none flex max-h-full flex-col items-center gap-3 [@media(max-height:540px)]:gap-2', tall ? 'w-[min(100%,36rem)]' : 'w-[min(100%,32rem)]')}
        data-zoomed={zoomed ? 'true' : 'false'}
      >
        <div
          ref={cardRef}
          className="pointer-events-auto aspect-[421/614] h-(--detail-art-height) max-w-full flex-none cursor-zoom-in overflow-hidden rounded-lg shadow-[0_24px_50px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.12),0_0_40px_rgb(var(--primary-rgb)/0.3)] transition-[height] duration-(--motion-duration) ease-[cubic-bezier(0.2,0.9,0.25,1)] group-data-[zoomed=true]:h-[min(94dvh,calc((100vw-2rem)*614/421))]"
          role="button"
          tabIndex={-1}
          aria-label={zoomed ? 'Volver al detalle' : 'Ver la carta en grande'}
          onClick={(event) => {
            event.stopPropagation()
            setZoomed((current) => !current)
          }}
        >
          <CardArt
            remoteUrl={card?.imageUrl ?? card?.imageUrlSmall ?? null}
            name={name}
            className="block h-full w-full bg-input object-cover"
            limitCard={card}
            limitBadgeSize="lg"
          />
        </div>
        <section
          ref={panelRef}
          tabIndex={-1}
          className="pointer-events-auto flex h-(--detail-panel-height) min-h-0 w-full flex-col gap-[0.4rem] rounded-card border border-primary/40 bg-linear-to-b from-card-background/98 to-background/98 px-4 py-[0.9rem] text-white outline-none group-data-[zoomed=true]:hidden [@media(max-height:540px)]:h-[calc(100dvh-var(--detail-art-height)-2rem)] [@media(max-height:540px)]:px-[0.85rem] [@media(max-height:540px)]:py-[0.65rem]"
          aria-label={panelLabel}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </section>
      </div>

      {/* La última del orden de tabulación: primero el contenido, después la X. */}
      <CloseButton
        tone="flat"
        size="lg"
        aria-label="Cerrar"
        className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] z-10"
        onClick={(event) => {
          event.stopPropagation()
          close()
        }}
      />
    </div>,
    document.body,
  )
}

/** Encabezado del panel: el nombre y, debajo, las líneas de contexto que haya (tipo y estadísticas, copias…). */
export function CardPanelHeader({ title, lines }: { title: string; lines: ReadonlyArray<ReactNode> }) {
  const visible = lines.filter((line) => line !== null && line !== undefined && line !== false && line !== '')

  return (
    <header className="grid flex-none gap-1">
      <h2 className="m-0 text-lead font-bold [overflow-wrap:anywhere]">{title}</h2>
      {visible.map((line, index) => (
        <p key={index} className="m-0 text-body text-white/66 [overflow-wrap:anywhere]">
          {line}
        </p>
      ))}
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

/** Pie del panel: las acciones, separadas por una línea fina. */
export function CardPanelFooter({ children }: { children: ReactNode }) {
  return <footer className="grid flex-none gap-2 border-t border-tint/10 pt-[0.65rem]">{children}</footer>
}
