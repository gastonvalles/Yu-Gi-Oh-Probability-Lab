import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

import { EASE_SNAP, prefersReducedMotion } from './motion'

/**
 * Bajar una hoja de abajo sin cerrarla (Gastón, 2026-10-24: ver la mano mientras se busca en el deck, el cementerio o el destierro algo que va a la mano). Se arrastra desde su franja de
 * arriba (el asa y el encabezado: `SheetHandle`) y la hoja sigue al dedo; bajada, queda sólo el asa como una tira sobre el borde de abajo (con el título) y se sube igual, o tocándola.
 * Bajarla no cambia nada de lo de adentro (lo buscado, lo elegido, el scroll, la pregunta que espera): sólo se corre. La hoja es `fixed` y flota encima: la mesa no se mueve.
 * Al soltar decide un tirón (más de `FLICK_SPEED` px/ms en los últimos `SAMPLE_MS`, hacia donde fue) o, si no, la posición: `MOVE_PX` desde donde estaba (o la mitad del recorrido, si es más
 * corto). Un toque sigue siendo un toque (después de un arrastre se descarta el clic). Con movimiento reducido cambia sin deslizarse.
 * Se corre con `translate`, no con `transform`: la entrada de las hojas (`sheet-in`, `sheet-up`) anima `transform` y se queda en su último cuadro, que pisaría uno en línea.
 */

/** Dónde queda bajada: se ve el asa (`h-7`, 28 px) sobre lo que tapa el sistema abajo. La mano de la mesa deja 28 px libres debajo: la tira entra ahí y no la tapa. */
const LOWERED = 'calc(100% - 1.75rem - env(safe-area-inset-bottom, 0px))'
/** El alto de esa tira en px, para medir el recorrido al soltar. */
const STRIP_PX = 28
/** Lo que hay que arrastrar antes de que cuente como gesto (y no como un toque): px. */
const START_PX = 8
/** Soltada a esta distancia (px) de donde estaba, cambia de lugar. */
const MOVE_PX = 64
/** Un tirón: más de esta velocidad (px/ms) medida en los últimos `SAMPLE_MS` ms del arrastre. */
const FLICK_SPEED = 0.5
const SAMPLE_MS = 100
/** Lo que tarda en terminar de bajar o subir al soltarla (ms): recorre media pantalla. */
const SHEET_DRAG_MS = 200

/** Si la hoja termina bajada después de un arrastre de `dy` px (positivo, hacia abajo) que se soltó a `velocity` px/ms; `travel` es su recorrido (0 si no se sabe). */
export function settleLowered(wasLowered: boolean, dy: number, velocity: number, travel: number): boolean {
  if (Math.abs(velocity) >= FLICK_SPEED) return velocity > 0

  const reach = travel > 0 ? Math.min(MOVE_PX, travel / 2) : MOVE_PX

  return wasLowered ? -dy < reach : dy >= reach
}

interface Drag {
  id: number
  y: number
  active: boolean
  /** Los últimos puntos (tiempo, y) del arrastre: de ahí sale la velocidad al soltar. */
  samples: Array<readonly [number, number]>
}

/**
 * El arrastre de una hoja de abajo (`panelRef`: la hoja que se corre). Devuelve si está bajada (y cómo cambiarlo), lo que va en su franja de arriba (`handlers`, que pone `SheetHandle`), el `style` de la
 * hoja y la ref del asa: al bajarla, si el foco estaba en lo que queda tapado (que pasa a ser inerte), va al asa, que sigue a la vista (y el teclado del celular se cierra).
 */
export function useSheetDrag(panelRef: RefObject<HTMLElement | null>) {
  const [lowered, setLowered] = useState(false)
  // Lo arrastrado (px) mientras dura el arrastre; `null`, quieta.
  const [offset, setOffset] = useState<number | null>(null)
  const drag = useRef<Drag | null>(null)
  const moved = useRef(false)
  const gripRef = useRef<HTMLButtonElement | null>(null)

  // Sin el aro del foco (`focusVisible`, donde el navegador lo entiende): esto pasa sólo si la bajó un dedo; con el teclado el foco ya está en el asa.
  useLayoutEffect(() => {
    const grip = gripRef.current
    const active = document.activeElement

    if (lowered && grip && active instanceof HTMLElement && active !== grip && panelRef.current?.contains(active)) grip.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
  }, [lowered, panelRef])

  const sample = (current: Drag, event: ReactPointerEvent) => {
    current.samples = [...current.samples.filter(([time]) => event.timeStamp - time <= SAMPLE_MS), [event.timeStamp, event.clientY]]
  }

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return

      moved.current = false
      drag.current = { id: event.pointerId, y: event.clientY, active: false, samples: [[event.timeStamp, event.clientY]] }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current

      if (!current || current.id !== event.pointerId) return

      // El botón ya no está apretado (se soltó afuera, sin aviso): no es un arrastre.
      if (event.buttons === 0) {
        drag.current = null
        return
      }

      const dy = event.clientY - current.y

      if (!current.active) {
        if (Math.abs(dy) < START_PX) return

        current.active = true
        moved.current = true
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }

      sample(current, event)
      setOffset(dy)
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current

      if (!current || current.id !== event.pointerId) return

      drag.current = null

      if (!current.active) return

      sample(current, event)
      const [t0, y0] = current.samples[0]!
      const [t1, y1] = current.samples[current.samples.length - 1]!
      const velocity = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0

      setLowered(settleLowered(lowered, event.clientY - current.y, velocity, (panelRef.current?.offsetHeight ?? 0) - STRIP_PX))
      setOffset(null)
    },
    onPointerCancel: () => {
      drag.current = null
      setOffset(null)
    },
    // Lo que deja un arrastre no es un toque: el clic que viene detrás se descarta.
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!moved.current) return

      moved.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }

  const style: CSSProperties = {
    // Mientras se arrastra sigue al dedo, entre arriba del todo y bajada; quieta, en su lugar.
    translate: offset !== null ? `0 clamp(0px, calc(${lowered ? LOWERED : '0px'} + ${offset}px), ${LOWERED})` : lowered ? `0 ${LOWERED}` : undefined,
    transition: offset !== null || prefersReducedMotion() ? 'none' : `translate ${SHEET_DRAG_MS}ms ${EASE_SNAP}`,
  }

  return { lowered, setLowered, toggle: () => setLowered((current) => !current), handlers, style, gripRef }
}

export type SheetDrag = ReturnType<typeof useSheetDrag>
