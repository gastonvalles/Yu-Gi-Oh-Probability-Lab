import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { MatPile, MatSpot } from './practice-mat'

export type MatDropTarget = { kind: 'spot'; spot: MatSpot; index: number } | { kind: 'pile'; pile: MatPile }

const PILES = new Set<string>(['deck', 'extra', 'hand', 'gy', 'banished'])
const ZONES = new Set<string>(['mz', 'emz', 'st'])

/** Lee el atributo `data-drop` de una zona: "mz:2", "field", "hand"… */
function parseDropTarget(value: string | null | undefined): MatDropTarget | null {
  if (!value) return null
  if (value === 'field') return { kind: 'spot', spot: 'field', index: 0 }
  if (PILES.has(value)) return { kind: 'pile', pile: value as MatPile }

  const [zone, index] = value.split(':')
  const at = Number(index)

  return zone && ZONES.has(zone) && Number.isInteger(at) && at >= 0 ? { kind: 'spot', spot: zone as MatSpot, index: at } : null
}

/** Lo que se arrastra: la carta (o el tope del deck, que se muestra de dorso). */
export interface MatDragSource {
  id: string
  name: string
  art: string | null
  back?: boolean
  /** Tamaño del fantasma cuando no es el del elemento que se arrastra (la ficha del menú: una carta del tamaño de una zona); queda centrado bajo el puntero. */
  size?: () => { width: number; height: number } | null
}

export interface MatDragState {
  source: MatDragSource
  width: number
  height: number
}

interface Session {
  source: MatDragSource
  pointerId: number
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  moved: boolean
  element: HTMLElement
  size: { width: number; height: number } | null
}

const DRAG_THRESHOLD = 6

interface UseMatDragOptions {
  onDrop: (source: MatDragSource, target: MatDropTarget) => void
  /** Toque sin arrastre. */
  onTap: (source: MatDragSource, rect: DOMRect) => void
  /**
   * La zona (`data-drop`) bajo el puntero cambió: la que se dejó y la nueva (null = ninguna). Encenderla es cosa de quien llama, por el DOM:
   * si pasara por el estado de React, cruzar cada zona volvería a dibujar la mesa entera. Tiene que ser una función estable.
   */
  onOver?: (previous: string | null, next: string | null) => void
}

/**
 * Arrastre entre zonas de la mesa, con el idioma de la mano de práctica: captura del puntero, umbral
 * de 6 px (mouse y dedo: las cartas son `touch-none`) y un cuadro por frame. El destino se busca con
 * `elementFromPoint` sobre `[data-drop]`; el fantasma se mueve por el ref y la zona de abajo se avisa con `onOver`, sin pasar por React.
 */
export function useMatDrag({ onDrop, onTap, onOver }: UseMatDragOptions) {
  const [drag, setDrag] = useState<MatDragState | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)
  const frameRef = useRef(0)
  const positionRef = useRef({ x: 0, y: 0 })
  const overRef = useRef<string | null>(null)

  const placeGhost = useCallback(() => {
    const ghost = ghostRef.current
    const { x, y } = positionRef.current

    if (ghost) {
      ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
  }, [])

  const applyPending = useCallback(() => {
    frameRef.current = 0
    const session = sessionRef.current
    const move = pendingRef.current
    pendingRef.current = null

    if (!session || !move) {
      return
    }

    positionRef.current = { x: move.x - session.offsetX, y: move.y - session.offsetY }
    placeGhost()

    const target = document.elementFromPoint(move.x, move.y)?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null

    if (target !== overRef.current) {
      const previous = overRef.current
      overRef.current = target
      onOver?.(previous, target)
    }
  }, [placeGhost, onOver])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, source: MatDragSource) => {
    if (event.button !== 0 || sessionRef.current) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const size = source.size?.() ?? null
    sessionRef.current = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: size ? size.width / 2 : event.clientX - rect.left,
      offsetY: size ? size.height / 2 : event.clientY - rect.top,
      moved: false,
      element: event.currentTarget,
      size,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current

      if (!session || session.pointerId !== event.pointerId) {
        return
      }

      if (!session.moved) {
        if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < DRAG_THRESHOLD) {
          return
        }

        session.moved = true
        const rect = session.element.getBoundingClientRect()
        setDrag({ source: session.source, width: session.size?.width ?? rect.width, height: session.size?.height ?? rect.height })
      }

      pendingRef.current = { x: event.clientX, y: event.clientY }

      if (!frameRef.current) {
        frameRef.current = window.requestAnimationFrame(applyPending)
      }
    },
    [applyPending],
  )

  const onPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current

      if (!session || session.pointerId !== event.pointerId) {
        return
      }

      sessionRef.current = null
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      pendingRef.current = null

      if (session.moved) {
        // Se mira la zona bajo el puntero en el momento de soltar (puede no haber llegado el último frame).
        const value = event.type === 'pointerup' ? (document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? overRef.current) : null
        const target = parseDropTarget(value)

        setDrag(null)
        onOver?.(overRef.current, null)
        overRef.current = null

        if (target) {
          onDrop(session.source, target)
        }

        return
      }

      if (event.type === 'pointerup') {
        onTap(session.source, session.element.getBoundingClientRect())
      }
    },
    [onDrop, onTap, onOver],
  )

  const bind = useCallback(
    (source: MatDragSource) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => onPointerDown(event, source),
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      // Sin aviso (el celular le quita el puntero a la carta): el arrastre termina igual, sin soltarla.
      onLostPointerCapture: onPointerEnd,
    }),
    [onPointerDown, onPointerMove, onPointerEnd],
  )

  /** Para el fantasma: al montarse toma la última posición conocida. */
  const setGhostElement = useCallback(
    (element: HTMLDivElement | null) => {
      ghostRef.current = element
      placeGhost()
    },
    [placeGhost],
  )

  return { drag, bind, setGhostElement }
}
