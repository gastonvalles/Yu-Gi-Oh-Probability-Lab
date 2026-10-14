import { useEffect, useRef, type ReactNode } from 'react'

import { useDraggablePosition } from '../../app/use-draggable-position'
import { t } from '../../i18n'

const FAB_SIZE = 56
/** Cada cuánto late el aro del botón (el latido en sí dura 700 ms, ver `fab-pulse` en index.css). */
const PULSE_EVERY_MS = 5000

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
  const ref = useRef<HTMLButtonElement>(null)

  // El aro late una vez cada 5 s: se enciende `data-pulse` y la animación lo apaga al terminar. Una animación infinita, aunque pase casi todo el
  // tiempo transparente, mantiene a la página dibujando cuadros sin parar (y a la batería del celular). El atributo no va en el JSX para que React no lo pise.
  // Al arrastrarlo no late; al soltarlo vuelve a latir de una y retoma la cuenta de 5 s.
  useEffect(() => {
    const button = ref.current

    if (!button || dragging) {
      return
    }

    const start = () => button.setAttribute('data-pulse', '')
    const stop = () => button.removeAttribute('data-pulse')

    start()
    const timer = window.setInterval(start, PULSE_EVERY_MS)
    button.addEventListener('animationend', stop)

    return () => {
      window.clearInterval(timer)
      button.removeEventListener('animationend', stop)
    }
  }, [dragging])

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={t('shell.fab.dragHint', { label })}
      className="fixed left-0 top-0 z-120 grid size-14 cursor-grab touch-none select-none place-items-center rounded-full border-[3px] border-background/90 bg-primary text-white shadow-[0_10px_26px_rgb(var(--primary-rgb)/0.45)] transition-[transform,box-shadow] duration-(--sidebar-duration) ease-(--sidebar-ease) [-webkit-tap-highlight-color:transparent] after:pointer-events-none after:absolute after:-inset-[3px] motion-safe:data-pulse:not-data-[dragging=true]:after:animate-fab-pulse after:rounded-[inherit] after:border-2 after:border-primary-hover after:opacity-0 focus-visible:shadow-focus focus-visible:outline-none motion-reduce:transition-none data-[dragging=true]:cursor-grabbing data-[dragging=true]:shadow-[0_16px_34px_rgb(var(--primary-rgb)/0.55)] data-[dragging=true]:transition-none"
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
