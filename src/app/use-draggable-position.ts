import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { clampFabPosition, defaultFabPosition, isFabDrag, snapFabToEdge, type FabBounds, type FabPosition } from './fab-position'
import { useMediaQuery } from './use-media-query'

const MARGIN = 12
/** En mobile queda por encima de la barra de pasos (su alto + un respiro). */
const MOBILE_NAV_INSET = 76

interface DraggablePositionOptions {
  /** Clave para recordar dónde lo dejó el usuario. */
  storageKey: string
  /** Lado del elemento (se trata como cuadrado para los límites). */
  size: number
  /** Dónde arranca si nunca se movió. */
  corner?: 'right' | 'left'
}

type PointerHandler = (event: ReactPointerEvent<HTMLElement>) => void

export interface DraggablePosition {
  position: FabPosition
  dragging: boolean
  handlers: {
    onPointerDown: PointerHandler
    onPointerMove: PointerHandler
    onPointerUp: PointerHandler
    onPointerCancel: PointerHandler
  }
  /** El navegador dispara "click" después de soltar: devuelve true (una vez) si ese click viene de un arrastre y hay que ignorarlo. */
  consumeDragClick: () => boolean
}

function readPosition(key: string): FabPosition | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<FabPosition> | null
    // NaN o Infinity guardados a mano dejarían el elemento en translate3d(NaNpx…): sólo valen números finitos.
    return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y) ? { x: parsed!.x as number, y: parsed!.y as number } : null
  } catch {
    return null
  }
}

function writePosition(key: string, position: FabPosition) {
  try {
    localStorage.setItem(key, JSON.stringify(position))
  } catch {
    // Si no se puede guardar, vuelve a su lugar por defecto la próxima vez.
  }
}

/**
 * Un elemento flotante que se arrastra a cualquier lado: al soltarlo se pega al borde lateral más
 * cercano y recuerda la posición entre visitas. Un toque sin arrastrar sigue siendo un click.
 * Lo comparten el botón de práctica y la mascota.
 */
export function useDraggablePosition({ storageKey, size, corner = 'right' }: DraggablePositionOptions): DraggablePosition {
  const isMobile = useMediaQuery('(max-width: 1100px)')
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const bounds: FabBounds = {
    ...viewport,
    size,
    margin: MARGIN,
    bottomInset: isMobile ? MOBILE_NAV_INSET : 0,
  }
  const [stored, setStored] = useState<FabPosition | null>(() => readPosition(storageKey))
  const [dragPosition, setDragPosition] = useState<FabPosition | null>(null)
  const dragRef = useRef<{ pointerStart: FabPosition; origin: FabPosition; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const restingPosition = clampFabPosition(stored ?? defaultFabPosition(bounds, corner), bounds)
  const position = dragPosition ?? restingPosition

  const onPointerDown: PointerHandler = (event) => {
    if (event.button !== 0) {
      return
    }
    // Si un arrastre táctil no generó click, la marca no debe comerse este toque.
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerStart: { x: event.clientX, y: event.clientY }, origin: restingPosition, moved: false }
  }

  const onPointerMove: PointerHandler = (event) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }

    const pointer = { x: event.clientX, y: event.clientY }
    if (!drag.moved && !isFabDrag(drag.pointerStart, pointer)) {
      return
    }

    drag.moved = true
    setDragPosition(
      clampFabPosition(
        { x: drag.origin.x + pointer.x - drag.pointerStart.x, y: drag.origin.y + pointer.y - drag.pointerStart.y },
        bounds,
      ),
    )
  }

  const onPointerUp: PointerHandler = () => {
    const drag = dragRef.current
    dragRef.current = null

    if (!drag?.moved || !dragPosition) {
      setDragPosition(null)
      return
    }

    suppressClickRef.current = true
    const snapped = snapFabToEdge(dragPosition, bounds)
    setStored(snapped)
    writePosition(storageKey, snapped)
    setDragPosition(null)
  }

  return {
    position,
    dragging: dragPosition !== null,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    consumeDragClick: () => {
      const suppressed = suppressClickRef.current
      suppressClickRef.current = false
      return suppressed
    },
  }
}
