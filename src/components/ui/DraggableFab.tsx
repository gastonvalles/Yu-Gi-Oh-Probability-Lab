import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import {
  clampFabPosition,
  defaultFabPosition,
  isFabDrag,
  snapFabToEdge,
  type FabBounds,
  type FabPosition,
} from '../../app/fab-position'
import { useMediaQuery } from '../../app/use-media-query'

const FAB_SIZE = 56
const FAB_MARGIN = 12
/** En mobile queda por encima de la barra de pasos (su alto + un respiro). */
const MOBILE_NAV_INSET = 76

interface DraggableFabProps {
  label: string
  /** Clave para recordar dónde lo dejó el usuario. */
  storageKey: string
  onClick: () => void
  children: ReactNode
}

function readPosition(key: string): FabPosition | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<FabPosition> | null
    return typeof parsed?.x === 'number' && typeof parsed?.y === 'number' ? { x: parsed.x, y: parsed.y } : null
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
 * Botón flotante que se puede arrastrar a cualquier lado. Al soltarlo se pega al borde
 * más cercano; un toque sin arrastrar lo activa. Recuerda la posición entre visitas.
 */
export function DraggableFab({ label, storageKey, onClick, children }: DraggableFabProps) {
  const isMobile = useMediaQuery('(max-width: 1100px)')
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const bounds: FabBounds = {
    ...viewport,
    size: FAB_SIZE,
    margin: FAB_MARGIN,
    bottomInset: isMobile ? MOBILE_NAV_INSET : 0,
  }
  const [stored, setStored] = useState<FabPosition | null>(() => readPosition(storageKey))
  const [dragPosition, setDragPosition] = useState<FabPosition | null>(null)
  const dragRef = useRef<{ pointerStart: FabPosition; origin: FabPosition; moved: boolean } | null>(null)
  // El navegador dispara "click" después de soltar: si hubo arrastre, ese click se ignora.
  const suppressClickRef = useRef(false)

  useEffect(() => {
    const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const restingPosition = clampFabPosition(stored ?? defaultFabPosition(bounds), bounds)
  const position = dragPosition ?? restingPosition

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return
    }
    // Si un arrastre táctil no generó click, la marca no debe comerse este toque.
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerStart: { x: event.clientX, y: event.clientY }, origin: restingPosition, moved: false }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
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

  const handlePointerUp = () => {
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

  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (arrastralo para moverlo)`}
      className="fixed left-0 top-0 z-120 grid size-14 cursor-grab touch-none select-none place-items-center rounded-full border-[3px] border-background/90 bg-primary text-white shadow-[0_10px_26px_rgb(var(--primary-rgb)/0.45)] transition-[transform,box-shadow] duration-180 ease-[cubic-bezier(0.2,0.8,0.2,1)] [-webkit-tap-highlight-color:transparent] after:pointer-events-none after:absolute after:-inset-[3px] after:animate-fab-pulse after:rounded-[inherit] after:border-2 after:border-primary-hover after:opacity-0 focus-visible:shadow-focus focus-visible:outline-none motion-reduce:transition-none motion-reduce:after:animate-none data-[dragging=true]:cursor-grabbing data-[dragging=true]:shadow-[0_16px_34px_rgb(var(--primary-rgb)/0.55)] data-[dragging=true]:transition-none data-[dragging=true]:after:animate-none"
      data-dragging={dragPosition ? 'true' : 'false'}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          event.preventDefault()
          return
        }
        onClick()
      }}
    >
      {children}
    </button>
  )
}
