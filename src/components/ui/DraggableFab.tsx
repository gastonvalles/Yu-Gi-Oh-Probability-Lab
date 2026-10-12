import type { ReactNode } from 'react'

import { useDraggablePosition } from '../../app/use-draggable-position'

const FAB_SIZE = 56

interface DraggableFabProps {
  label: string
  /** Clave para recordar dónde lo dejó el usuario. */
  storageKey: string
  onClick: () => void
  children: ReactNode
  /** Cuánto subirlo (px) respecto del rincón: para apilar un botón sobre otro. */
  lift?: number
}

/**
 * Botón flotante que se puede arrastrar a cualquier lado. Al soltarlo se pega al borde
 * más cercano; un toque sin arrastrar lo activa. Recuerda la posición entre visitas.
 */
export function DraggableFab({ label, storageKey, onClick, children, lift }: DraggableFabProps) {
  const { position, dragging, handlers, consumeDragClick } = useDraggablePosition({ storageKey, size: FAB_SIZE, lift, group: 'fab' })

  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (arrastralo para moverlo)`}
      className="fixed left-0 top-0 z-120 grid size-14 cursor-grab touch-none select-none place-items-center rounded-full border-[3px] border-background/90 bg-primary text-white shadow-[0_10px_26px_rgb(var(--primary-rgb)/0.45)] transition-[transform,box-shadow] duration-180 ease-[cubic-bezier(0.2,0.8,0.2,1)] [-webkit-tap-highlight-color:transparent] after:pointer-events-none after:absolute after:-inset-[3px] after:animate-fab-pulse after:rounded-[inherit] after:border-2 after:border-primary-hover after:opacity-0 focus-visible:shadow-focus focus-visible:outline-none motion-reduce:transition-none motion-reduce:after:animate-none data-[dragging=true]:cursor-grabbing data-[dragging=true]:shadow-[0_16px_34px_rgb(var(--primary-rgb)/0.55)] data-[dragging=true]:transition-none data-[dragging=true]:after:animate-none"
      data-dragging={dragging ? 'true' : 'false'}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      {...handlers}
      onClick={(event) => {
        if (consumeDragClick()) {
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
