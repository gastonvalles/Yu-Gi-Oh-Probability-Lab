import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { UI_ANIMATION_MS } from '../../app/motion'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { buildCardSummary } from './card-summary'

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
      className="card-detail-overlay"
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
      <div className="card-detail-stack" data-zoomed={zoomed ? 'true' : 'false'}>
        <div
          ref={cardRef}
          className="card-detail-art"
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
        <section ref={infoRef} className="card-detail-info" aria-label="Texto de la carta" onClick={(event) => event.stopPropagation()}>
          <header className="card-detail-heading">
            <h2>{name}</h2>
            {summary ? (
              <p className="card-detail-meta">
                {summary.typeLine}
                {summary.statLine ? ` · ${summary.statLine}` : ''}
              </p>
            ) : null}
            {metadata ? <p className="card-detail-meta">{metadata}</p> : null}
          </header>
          <div ref={textRef} className="card-detail-text" tabIndex={0} role="region" aria-label="Efecto">
            <p>{card?.description?.trim() || 'Sin texto disponible.'}</p>
          </div>
          {actions ? <footer className="card-detail-actions">{actions}</footer> : null}
        </section>
      </div>
    </div>,
    document.body,
  )
}
