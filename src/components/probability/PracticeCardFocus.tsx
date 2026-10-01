import { useLayoutEffect, useRef } from 'react'

import { UI_ANIMATION_MS } from '../../app/motion'
import { useEscapeKey } from '../../app/use-overlay'
import { buildCardSummary } from '../card-detail/card-summary'
import { CardArt } from '../CardArt'
import type { PracticeHandCard } from './practice'

const CLOSE_MS = 180
const EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)'

interface PracticeCardFocusProps {
  card: PracticeHandCard
  /** Dónde estaba la carta en la mano: de ahí crece y a ahí vuelve. */
  origin: DOMRect | null
  onClose: () => void
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Transform que lleva la carta ampliada de vuelta al lugar (y tamaño) que tenía en la mano. */
function flightFrom(card: HTMLElement, origin: DOMRect): string {
  const target = card.getBoundingClientRect()
  const dx = origin.left + origin.width / 2 - (target.left + target.width / 2)
  const dy = origin.top + origin.height / 2 - (target.top + target.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${origin.width / Math.max(1, target.width)})`
}

/** Carta ampliada con su texto a la derecha: un solo contenedor fijo, scrollea sólo el efecto. */
export function PracticeCardFocus({ card, origin, onClose }: PracticeCardFocusProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const infoRef = useRef<HTMLElement | null>(null)
  const closingRef = useRef(false)
  const summary = card.apiCard ? buildCardSummary(card.apiCard) : null
  const description = card.apiCard?.description?.trim()

  useLayoutEffect(() => {
    const art = cardRef.current

    if (!art || typeof art.animate !== 'function' || prefersReducedMotion()) {
      return
    }

    rootRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
    infoRef.current?.animate(
      [
        { opacity: 0, transform: 'translateX(18px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: UI_ANIMATION_MS, easing: EASE, fill: 'backwards' },
    )

    if (origin) {
      art.animate([{ transform: flightFrom(art, origin) }, { transform: 'none' }], { duration: UI_ANIMATION_MS, easing: EASE })
    }
  }, [origin])

  const close = () => {
    const art = cardRef.current

    if (closingRef.current) {
      return
    }

    closingRef.current = true

    if (!art || typeof art.animate !== 'function' || prefersReducedMotion()) {
      onClose()
      return
    }

    const options = { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' } as const
    const fade = rootRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], options)
    infoRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { ...options, duration: CLOSE_MS * 0.7 })

    if (origin) {
      art.animate([{ transform: 'none' }, { transform: flightFrom(art, origin) }], options)
    }

    if (fade) {
      void fade.finished.then(onClose, onClose)
    } else {
      onClose()
    }
  }

  useEscapeKey(close)

  return (
    <div ref={rootRef} className="practice-focus" role="dialog" aria-label={card.name} onClick={close}>
      <div className="practice-focus-body" onClick={(event) => event.stopPropagation()}>
        <div ref={cardRef} className="practice-focus-card">
          <CardArt
            remoteUrl={card.apiCard?.imageUrl ?? card.apiCard?.imageUrlSmall ?? null}
            name={card.name}
            className="block h-full w-full bg-input object-cover"
            limitCard={card.apiCard}
            limitBadgeSize="lg"
          />
        </div>

        <section ref={infoRef} className="practice-focus-info" aria-label="Texto de la carta">
          <div className="practice-focus-info-inner">
            <h3>{card.name}</h3>
            {summary ? (
              <p className="practice-focus-meta">
                {summary.typeLine}
                {summary.statLine ? ` · ${summary.statLine}` : ''}
              </p>
            ) : null}
            <div className="practice-focus-text" tabIndex={0} role="region" aria-label="Efecto">
              <p>{description ? description : 'Sin texto disponible.'}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
