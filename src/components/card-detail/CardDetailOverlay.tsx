import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { UI_ANIMATION_MS } from '../../app/motion'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { buildCardSummary } from './card-summary'

const DETAIL_META = 'm-0 text-[0.8rem] leading-[1.35] text-white/66 [overflow-wrap:anywhere]'
const CLOSE_MS = 180
const EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)'

interface CardDetailOverlayProps {
  name: string
  card: ApiCardReference | null
  origin?: DOMRect | null
  metadata?: ReactNode
  actions?: ReactNode
  onClose: () => void
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function flightFrom(card: HTMLElement, origin: DOMRect): string {
  const target = card.getBoundingClientRect()
  const dx = origin.left + origin.width / 2 - (target.left + target.width / 2)
  const dy = origin.top + origin.height / 2 - (target.top + target.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${origin.width / Math.max(1, target.width)})`
}

/** Detalle compartido: sólo la carta y su texto interceptan los toques del fondo. */
export function CardDetailOverlay({ name, card, origin = null, metadata, actions, onClose }: CardDetailOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const infoRef = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)
  // Tocar la carta la agranda al máximo; tocarla de nuevo (o el fondo) vuelve al detalle.
  const [zoomed, setZoomed] = useState(false)
  const animationsRef = useRef<Animation[]>([])
  const summary = card ? buildCardSummary(card) : null

  useBodyScrollLock(true)

  useLayoutEffect(() => {
    const art = cardRef.current
    closingRef.current = false

    if (art && typeof art.animate === 'function' && !prefersReducedMotion()) {
      const fade = rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
      const info = infoRef.current?.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
        { duration: UI_ANIMATION_MS, easing: EASE },
      )
      const flight = art.animate(
        [{ transform: origin ? flightFrom(art, origin) : 'scale(0.96)' }, { transform: 'none' }],
        { duration: UI_ANIMATION_MS, easing: EASE },
      )
      animationsRef.current = [fade, info, flight].filter((animation): animation is Animation => Boolean(animation))
    }

    return () => {
      animationsRef.current.forEach((animation) => animation.cancel())
      animationsRef.current = []
    }
  }, [origin])

  useEffect(() => {
    const previousFocus = document.activeElement
    textRef.current?.focus({ preventScroll: true })
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
      className="fixed inset-0 z-240 grid place-items-center bg-background/90 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] min-[1101px]:backdrop-blur-[8px] [--detail-art-height:min(36dvh,20rem)] [@media(max-height:540px)]:[--detail-art-height:28dvh] [@media(max-height:540px)]:py-3"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${name}`}
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
        className="group pointer-events-none flex max-h-full w-[min(100%,32rem)] flex-col items-center gap-3 [@media(max-height:540px)]:gap-2"
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
        <section ref={infoRef} className="pointer-events-auto flex h-[min(52dvh,28rem)] min-h-0 w-full flex-col gap-[0.4rem] rounded-[1.1rem] border border-primary/40 bg-linear-to-b from-card-background/98 to-background/98 px-4 py-[0.9rem] text-white group-data-[zoomed=true]:hidden [@media(max-height:540px)]:h-[calc(100dvh-var(--detail-art-height)-2rem)] [@media(max-height:540px)]:px-[0.85rem] [@media(max-height:540px)]:py-[0.65rem]" aria-label="Texto de la carta" onClick={(event) => event.stopPropagation()}>
          <header className="grid flex-none gap-1">
            <h2 className="m-0 text-[1.15rem] font-bold leading-[1.2] [overflow-wrap:anywhere]">{name}</h2>
            {summary ? (
              <p className={DETAIL_META}>
                {summary.typeLine}
                {summary.statLine ? ` · ${summary.statLine}` : ''}
              </p>
            ) : null}
            {metadata ? <p className={DETAIL_META}>{metadata}</p> : null}
          </header>
          <div ref={textRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/10 pr-[0.2rem] pt-[0.55rem] text-[0.95rem] leading-[1.5] text-white outline-none focus-visible:border-t-primary/65" tabIndex={0} role="region" aria-label="Efecto">
            <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{card?.description?.trim() || 'Sin texto disponible.'}</p>
          </div>
          {actions ? <footer className="grid flex-none gap-2 border-t border-white/10 pt-[0.65rem]">{actions}</footer> : null}
        </section>
      </div>
    </div>,
    document.body,
  )
}
