import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react'

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
  /** Se puede mantener apretado (`onHold`): mientras se espera, el elemento lleva `data-holding="true"`, el indicio de que algo va a pasar. */
  hold?: boolean
  /** No se arrastra (en el duelo automático, una carta del campo: nada se mueve a mano): moverse no la levanta ni la suelta en ningún lado, sólo deja de ser un toque. */
  still?: boolean
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
  /** El temporizador de la retención (0: no se espera ninguna). */
  hold: number
}

const DRAG_THRESHOLD = 6
/**
 * Mantener apretado (mouse, dedo o lápiz) sin moverse: a los 450 ms la pulsación es una retención, no un toque. Moverse más que el umbral del arrastre ya es arrastrar
 * (la tolerancia es la misma: no hay un tramo en el que no sea ni una cosa ni la otra). El indicio (`animate-hold-press`, en index.css) dura lo mismo.
 */
export const HOLD_MS = 450

interface UseMatDragOptions {
  /** Soltar después de arrastrar: en una zona o una pila (`data-drop`) o fuera de todas (null). Si el navegador corta el arrastre, no se suelta en ningún lado. */
  onDrop: (source: MatDragSource, target: MatDropTarget | null) => void
  /** Toque sin arrastre. */
  onTap: (source: MatDragSource, rect: DOMRect) => void
  /**
   * Retención de una fuente con `hold`: true si hizo algo (la pulsación ya se usó: soltar no es un toque ni moverse, un arrastre); false si no tiene nada que hacer ahora (la pulsación
   * sigue como siempre: al soltar es un toque). Se llama con lo último que se dibujó, no con lo de cuando se apretó.
   */
  onHold?: (source: MatDragSource, rect: DOMRect) => boolean
  /**
   * La zona (`data-drop`) bajo el puntero cambió: la que se dejó y la nueva (null = ninguna). Encenderla es cosa de quien llama, por el DOM:
   * si pasara por el estado de React, cruzar cada zona volvería a dibujar la mesa entera. Tiene que ser una función estable.
   */
  onOver?: (previous: string | null, next: string | null) => void
}

const preventCompatClick = (event: ReactTouchEvent<HTMLElement>) => event.preventDefault()

/** Deja de esperar la retención y saca el indicio. */
function stopHold(session: Session) {
  window.clearTimeout(session.hold)
  session.hold = 0
  delete session.element.dataset.holding
}

/**
 * Arrastre entre zonas de la mesa, con el idioma de la mano de práctica: captura del puntero, umbral
 * de 6 px (mouse y dedo: las cartas son `touch-none`) y un cuadro por frame. El destino se busca con
 * `elementFromPoint` sobre `[data-drop]`; el fantasma se mueve por el ref y la zona de abajo se avisa con `onOver`, sin pasar por React.
 * Una fuente con `hold` también se puede mantener apretada (`onHold`, a los `HOLD_MS`); el indicio va por el DOM, como la zona encendida.
 */
export function useMatDrag({ onDrop, onTap, onHold, onOver }: UseMatDragOptions) {
  const [drag, setDrag] = useState<MatDragState | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)
  const frameRef = useRef(0)
  const positionRef = useRef({ x: 0, y: 0 })
  const overRef = useRef<string | null>(null)
  // La retención se resuelve 450 ms después de apretar: con lo que la mesa tenga para entonces.
  const holdRef = useRef(onHold)

  useEffect(() => {
    holdRef.current = onHold
  }, [onHold])

  useEffect(
    () => () => {
      if (sessionRef.current) stopHold(sessionRef.current)
    },
    [],
  )

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

    const element = event.currentTarget
    const rect = element.getBoundingClientRect()
    const size = source.size?.() ?? null
    const session: Session = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: size ? size.width / 2 : event.clientX - rect.left,
      offsetY: size ? size.height / 2 : event.clientY - rect.top,
      moved: false,
      element,
      size,
      hold: 0,
    }

    sessionRef.current = session
    element.setPointerCapture(event.pointerId)

    if (source.hold) {
      element.dataset.holding = 'true'
      session.hold = window.setTimeout(() => {
        stopHold(session)

        // Hizo algo: la pulsación termina acá (lo que llegue del puntero hasta soltarlo ya no es de nadie) y el celular lo marca con una vibración corta.
        if (sessionRef.current === session && holdRef.current?.(source, element.getBoundingClientRect())) {
          sessionRef.current = null
          navigator.vibrate?.(12)
        }
      }, HOLD_MS)
    }
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
        stopHold(session)
        if (session.source.still) return
        const rect = session.element.getBoundingClientRect()
        // El tamaño de la carta, no el del rect: en el campo inclinado el rect sale achatado y la carta arrastrada saldría más ancha que alta.
        setDrag({ source: session.source, width: session.size?.width ?? (session.element.offsetWidth || rect.width), height: session.size?.height ?? (session.element.offsetHeight || rect.height) })
      }

      // Lo que no se arrastra no lleva fantasma ni enciende zonas.
      if (session.source.still) return
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
      stopHold(session)
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      pendingRef.current = null

      if (session.moved) {
        if (session.source.still) return
        setDrag(null)
        onOver?.(overRef.current, null)

        // Se mira la zona bajo el puntero en el momento de soltar (puede no haber llegado el último frame). Cortado (cancelado, o sin la captura), no se suelta.
        if (event.type === 'pointerup') {
          onDrop(session.source, parseDropTarget(document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? overRef.current))
        }

        overRef.current = null
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
      // El gesto son los eventos del puntero: el click que el celular manda después de levantar el dedo caería en lo que se acaba de abrir debajo (una carta del visor del deck, el fondo del
      // menú que abrió la retención) y haría otra cosa. Se corta en el `touchend` (con el mouse no hay).
      onTouchEnd: preventCompatClick,
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
