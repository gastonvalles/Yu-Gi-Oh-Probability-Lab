import { useId, useRef, useState, type ReactNode } from 'react'

interface InfoTipProps {
  label: string
  children: ReactNode
}

/** Ícono "i" con explicación: se abre con hover o foco (desktop) y con un toque (mobile). */
export function InfoTip({ label, children }: InfoTipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const contentId = useId()
  // Un toque dispara hover y foco (que lo abren) antes del click: el click tiene que
  // decidir con el estado que había al empezar el toque, si no se cierra al instante.
  const pressRef = useRef<{ wasOpen: boolean; pointerType: string } | null>(null)

  return (
    <span
      className="info-tip"
      // Hover sólo con mouse real: en táctil el navegador simula entradas y salidas que lo cerrarían.
      onPointerEnter={(event) => event.pointerType === 'mouse' && setIsOpen(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && setIsOpen(false)}
    >
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={label}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? contentId : undefined}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onPointerDown={(event) => {
          pressRef.current = { wasOpen: isOpen, pointerType: event.pointerType }
        }}
        onClick={(event) => {
          event.stopPropagation()
          const press = pressRef.current
          pressRef.current = null

          if (!press) {
            setIsOpen((current) => !current)
          } else if (press.pointerType === 'mouse') {
            setIsOpen(true)
          } else {
            setIsOpen(!press.wasOpen)
          }
        }}
      >
        i
      </button>
      {isOpen ? (
        <span id={contentId} role="tooltip" className="info-tip-content">
          {children}
        </span>
      ) : null}
    </span>
  )
}
