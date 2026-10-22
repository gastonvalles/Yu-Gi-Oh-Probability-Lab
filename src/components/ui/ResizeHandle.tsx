import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cx } from './cx'

/** Cuánto mueve el ancho una flecha del teclado; con Shift, cuatro veces más. */
const STEP_PX = 16
const BIG_STEP_PX = 64

/**
 * En reposo no se ve (quedan los bordes de siempre de los paneles); con el mouse encima, arrastrándolo o con el foco del teclado, el cursor ↔ y una línea ámbar de 2 px a todo el alto,
 * justo sobre el borde. El área que se agarra mide 12 px (6 a cada lado del borde) y es `absolute`: no ocupa lugar, así que pasar el mouse no corre nada.
 */
const HANDLE = cx(
  'absolute inset-y-0 z-60 w-3 cursor-ew-resize touch-none select-none focus-visible:outline-none focus-visible:shadow-focus',
  'before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:w-0.5 before:-translate-x-1/2 before:bg-info before:opacity-0 before:transition-opacity before:duration-150 before:content-[""] motion-reduce:before:transition-none',
  'hover:before:opacity-100 focus-visible:before:opacity-100 data-[dragging=true]:before:opacity-100',
)

interface ResizeHandleProps {
  /** El panel que se agranda: el de la izquierda (el agarre va en su borde derecho: → lo agranda) o el de la derecha (en su borde izquierdo: ← lo agranda). */
  panel: 'left' | 'right'
  /** Su ancho, en px, y sus topes. */
  value: number
  min: number
  max: number
  /** El nombre del separador para los lectores de pantalla, y el cartel al pasar el mouse. */
  label: string
  title?: string
  /** Mientras se arrastra (una vez por cuadro): el ancho nuevo, para mostrarlo sin esperar; `null` al cancelar (vuelve el de antes). */
  onPreview: (width: number | null) => void
  /** Al soltarlo (si se movió) o con el teclado: el ancho elegido. */
  onCommit: (width: number) => void
  /** Doble clic: el ancho de siempre (como en VS Code). */
  onReset: () => void
  /** Dónde va: lo pone quien lo usa (el agarre no sabe en qué borde está). */
  className?: string
}

/**
 * El agarre del borde de un panel, como el de la barra lateral de VS Code (Gastón, 2026-10-22: «algo así pero horizontal»): se arrastra para cambiar el ancho, el doble clic vuelve al de siempre y con
 * el teclado es un separador (`role="separator"`): las flechas lo mueven 16 px (con Shift, 64) en la dirección en que se ven, e Inicio y Fin lo llevan al mínimo y al máximo.
 * Mientras se arrastra, el puntero queda capturado (sigue aunque salga del agarre o de la ventana) y una capa transparente deja el cursor ↔ en toda la pantalla, sin que nada de abajo reaccione.
 */
export function ResizeHandle({ panel, value, min, max, label, title, onPreview, onCommit, onReset, className }: ResizeHandleProps) {
  // De dónde arrancó el arrastre (el ancho y la x del puntero); el ancho que va teniendo es estado sólo de este agarre: la pantalla de atrás no se vuelve a dibujar en cada cuadro.
  const origin = useRef<{ pointerId: number; x: number; from: number } | null>(null)
  const frame = useRef(0)
  const [live, setLive] = useState<number | null>(null)
  const grow = panel === 'left' ? 1 : -1
  const clamp = (width: number) => Math.min(max, Math.max(min, Math.round(width)))
  const widthAt = (x: number) => (origin.current ? clamp(origin.current.from + grow * (x - origin.current.x)) : value)

  const finish = (width: number | null) => {
    cancelAnimationFrame(frame.current)
    origin.current = null
    setLive(null)

    if (width === null) onPreview(null)
    else onCommit(width)
  }

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={live ?? value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        title={title}
        // Apretarlo no es tocar «afuera»: el detalle fijo de la carta no se suelta (`use-dock-peek`).
        data-panel-resizer=""
        data-dragging={live === null ? undefined : 'true'}
        className={cx(HANDLE, className)}
        onPointerDown={(event) => {
          if (event.button !== 0) return

          // Sin seleccionar texto ni empezar el arrastre de otra cosa.
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          origin.current = { pointerId: event.pointerId, x: event.clientX, from: value }
          setLive(value)
        }}
        onPointerMove={(event) => {
          if (origin.current?.pointerId !== event.pointerId) return

          const width = widthAt(event.clientX)

          setLive(width)
          cancelAnimationFrame(frame.current)
          frame.current = requestAnimationFrame(() => onPreview(width))
        }}
        onPointerUp={(event) => {
          if (origin.current?.pointerId !== event.pointerId) return

          const width = widthAt(event.clientX)

          // Un clic sin mover (o volver adonde estaba) no elige nada: el panel sigue con el ancho de siempre si lo tenía.
          finish(width === origin.current.from ? null : width)
        }}
        onPointerCancel={() => {
          if (origin.current) finish(null)
        }}
        onLostPointerCapture={() => {
          if (origin.current) finish(null)
        }}
        onDoubleClick={onReset}
        onKeyDown={(event) => {
          const step = event.shiftKey ? BIG_STEP_PX : STEP_PX
          const next = event.key === 'ArrowRight' ? value + grow * step : event.key === 'ArrowLeft' ? value - grow * step : event.key === 'Home' ? min : event.key === 'End' ? max : null

          if (next === null) return

          event.preventDefault()

          if (clamp(next) !== value) onCommit(clamp(next))
        }}
      />
      {live !== null && typeof document !== 'undefined' ? createPortal(<div aria-hidden="true" className="fixed inset-0 z-300 cursor-ew-resize" />, document.body) : null}
    </>
  )
}
