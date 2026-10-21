import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type TransitionEvent } from 'react'

import { prefersReducedMotion } from './motion'

/** Lo que hay que arrastrar de costado antes de que cuente como el gesto (y no como un toque): px. */
const START_PX = 8
/** Con este arrastre (px) el cartel se saca; o con un tirón corto y rápido: más de `FLICK_PX` a más de `FLICK_SPEED` px/ms. */
const AWAY_PX = 72
const FLICK_PX = 24
const FLICK_SPEED = 0.5
/** Lo que tarda en irse o en volver (ms): lo que responde a un toque sale en 150 o menos. */
export const SWIPE_MS = 150
/** Si la transición no avisa que terminó (la pestaña quedó atrás), se termina igual a su duración más este margen. */
const NET_MS = 100
/** Con cuánta distancia (px) se mide el desvanecimiento mientras se arrastra: a esa distancia queda al 40 %. */
const FADE_PX = 240

type Phase = 'idle' | 'drag' | 'back' | 'away'

interface Drag {
  id: number
  x: number
  y: number
  at: number
  dx: number
  active: boolean
}

/**
 * Sacar un cartel con el dedo (o con el mouse): lo arrastrás de costado y, si lo soltás lejos o de un tirón, se va hacia ese lado y llama a `onAway`; si lo soltás cerca, vuelve.
 * Un arrastre vertical no cuenta (es de la página: `touch-action: pan-y` en el cartel); un toque sigue siendo un toque (después de un arrastre se descarta el clic).
 * Con teclado, Supr o Retroceso lo sacan. Con movimiento reducido se va de una. Devuelve lo que hay que ponerle al elemento: `props` y `style` (y `className` para su transición).
 */
export function useSwipeAway(onAway: () => void) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [offset, setOffset] = useState(0)
  const drag = useRef<Drag | null>(null)
  const moved = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  // `onAway` cambia en cada vuelta de quien lo usa: se lee desde una ref para no soltar un cartel con lo viejo.
  const away = useRef(onAway)

  useEffect(() => {
    away.current = onAway
  })

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const reset = useCallback(() => {
    window.clearTimeout(timer.current)
    setPhase('idle')
    setOffset(0)
  }, [])

  const finish = useCallback(() => {
    window.clearTimeout(timer.current)
    away.current()
    setPhase('idle')
    setOffset(0)
  }, [])

  const leave = useCallback(
    (direction: -1 | 1, width: number) => {
      if (prefersReducedMotion()) {
        finish()
        return
      }

      setPhase('away')
      setOffset(direction * (width || 320))
      timer.current = window.setTimeout(finish, SWIPE_MS + NET_MS)
    },
    [finish],
  )

  const props = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (phase === 'away' || (event.pointerType === 'mouse' && event.button !== 0)) return

      moved.current = false
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, dx: 0, active: false }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current

      if (!current || current.id !== event.pointerId) return

      const dx = event.clientX - current.x
      const dy = event.clientY - current.y

      if (!current.active) {
        // Todavía no es un gesto; si va más para arriba o abajo que de costado, es de la página.
        if (Math.abs(dx) < START_PX) return

        if (Math.abs(dy) > Math.abs(dx)) {
          drag.current = null
          return
        }

        current.active = true
        moved.current = true
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }

      current.dx = dx
      setPhase('drag')
      setOffset(dx)
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current

      if (!current || current.id !== event.pointerId) return

      drag.current = null

      if (!current.active) return

      const distance = Math.abs(current.dx)
      const speed = distance / Math.max(1, event.timeStamp - current.at)

      if (distance >= AWAY_PX || (distance >= FLICK_PX && speed >= FLICK_SPEED)) {
        leave(current.dx < 0 ? -1 : 1, event.currentTarget.offsetWidth)
        return
      }

      setPhase('back')
      setOffset(0)
    },
    onPointerCancel: () => {
      if (drag.current?.active) {
        setPhase('back')
        setOffset(0)
      }

      drag.current = null
    },
    // Lo que deja un arrastre no es un toque: el clic que viene detrás se descarta.
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!moved.current) return

      moved.current = false
      event.preventDefault()
      event.stopPropagation()
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return

      event.preventDefault()
      leave(-1, event.currentTarget.offsetWidth)
    },
    onTransitionEnd: (event: TransitionEvent<HTMLElement>) => {
      // Cada propiedad avisa por su cuenta: con la de `transform` alcanza.
      if (event.target !== event.currentTarget || event.propertyName !== 'transform') return

      if (phase === 'away') finish()
      else if (phase === 'back') reset()
    },
  }

  const style: CSSProperties = {
    transform: phase === 'idle' ? undefined : `translateX(${offset}px)`,
    opacity: phase === 'away' ? 0 : phase === 'drag' ? 1 - Math.min(1, Math.abs(offset) / FADE_PX) * 0.6 : undefined,
    // Mientras se arrastra sigue al dedo sin demora; al soltar, la clase de la transición lo lleva (o lo trae).
    transition: phase === 'drag' ? 'none' : undefined,
  }

  return { props, style, dragging: phase === 'drag' || phase === 'away' }
}
