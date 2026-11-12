import { useRef, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

import { settleLowered } from './use-sheet-drag'

/**
 * Arrastrar un cartel de la mesa para minimizarlo o abrirlo (Gastón, 2026-11-01: «poder arrastrarlo para minimizarlo o agrandarlo»): las hojas del duelo (`Modal lowerable`) y los carteles
 * del medio (`MatPrompt`) se bajan arrastrando su franja de arriba hacia abajo (`down`) y su asa minimizada (`PromptHandle`) se abre arrastrándola hacia arriba (`up`), además de la flecha de
 * siempre. Decide como `useSheetDrag` (`settleLowered`: un tirón, o 64 px). Mientras se baja, `follow(dy)` deja que el cartel siga al dedo (`dy` ≥ 0, una vez por cuadro y sin redibujar
 * React); `follow(null)` le saca el corrimiento al soltar, y `onFold` recibe dónde quedó (el último `dy` dibujado): de ahí baja hasta la tira (`useFoldMotion`). Un toque sigue siendo un toque:
 * después de un arrastre se descarta el clic (la X o la flecha no se disparan solas).
 * Devuelve los manejadores de la franja, que además va con `touch-action: none` (lo de abajo, que scrollea, no la mueve).
 */

/** Lo que hay que arrastrar antes de que cuente como gesto (y no como un toque): px. */
const START_PX = 8
const SAMPLE_MS = 100

interface Swipe {
  id: number
  y: number
  active: boolean
  samples: Array<readonly [number, number]>
}

export function useSwipeFold({ dir, onFold, follow }: { dir: 'down' | 'up'; onFold: (from: number) => void; follow?: (dy: number | null) => void }) {
  const swipe = useRef<Swipe | null>(null)
  const frame = useRef(0)
  const moved = useRef(false)
  // Lo último que se dibujó siguiendo al dedo (px).
  const shown = useRef(0)

  const sample = (current: Swipe, event: ReactPointerEvent) => {
    current.samples = [...current.samples.filter(([time]) => event.timeStamp - time <= SAMPLE_MS), [event.timeStamp, event.clientY]]
  }
  const end = () => {
    swipe.current = null
    cancelAnimationFrame(frame.current)
    follow?.(null)
  }

  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return

      moved.current = false
      shown.current = 0
      swipe.current = { id: event.pointerId, y: event.clientY, active: false, samples: [[event.timeStamp, event.clientY]] }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = swipe.current

      if (!current || current.id !== event.pointerId) return
      // El botón ya no está apretado (se soltó afuera, sin aviso): no es un gesto.
      if (event.buttons === 0) return end()

      const dy = event.clientY - current.y

      if (!current.active) {
        if (Math.abs(dy) < START_PX) return
        current.active = true
        moved.current = true
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }
      sample(current, event)
      if (dir === 'down') {
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => {
          shown.current = Math.max(0, dy)
          follow?.(shown.current)
        })
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const current = swipe.current

      if (!current || current.id !== event.pointerId) return
      const { active } = current

      if (active) sample(current, event)
      const [t0, y0] = current.samples[0]!
      const [t1, y1] = current.samples[current.samples.length - 1]!
      const velocity = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0
      const dy = event.clientY - current.y
      const from = shown.current

      end()
      if (active && (dir === 'down' ? settleLowered(false, dy, velocity, 0) : !settleLowered(true, dy, velocity, 0))) onFold(from)
    },
    onPointerCancel: end,
    // Lo que deja un arrastre no es un toque: el clic que viene detrás se descarta.
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!moved.current) return

      moved.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }
}
