import { useId, useRef, useState, type ReactNode } from 'react'

import { cx } from './cx'
import { Icon } from './Icon'

interface InfoTipProps {
  label: string
  children: ReactNode
  /** 'self': el globo se ancla al ícono · 'parent': al contenedor posicionado más cercano. */
  anchor?: 'self' | 'parent'
}

/** Ícono "i" con explicación: se abre con hover o foco (desktop) y con un toque (mobile). */
export function InfoTip({ label, children, anchor = 'self' }: InfoTipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const contentId = useId()
  // Un toque dispara hover y foco (que lo abren) antes del click: el click tiene que
  // decidir con el estado que había al empezar el toque, si no se cierra al instante.
  const pressRef = useRef<{ wasOpen: boolean; pointerType: string } | null>(null)

  return (
    <span
      className={cx('inline-flex', anchor === 'self' && 'relative')}
      // Hover sólo con mouse real: en táctil el navegador simula entradas y salidas que lo cerrarían.
      onPointerEnter={(event) => event.pointerType === 'mouse' && setIsOpen(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && setIsOpen(false)}
    >
      <button
        type="button"
        className="grid size-6 place-items-center rounded-full text-soft transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus aria-expanded:text-primary-soft"
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
        <Icon name="info" size={16} />
      </button>
      {isOpen ? (
        <span id={contentId} role="tooltip" className={cx(
            'absolute z-60 grid gap-1.5',
            anchor === 'self'
              ? 'right-0 top-[calc(100%+0.45rem)] w-[min(22rem,calc(100vw-2rem))]'
              : 'left-0 top-[calc(100%+0.25rem)] w-[min(26rem,100%)]',
            'rounded-control border border-white/10 bg-surface-raised px-3 py-2.5 text-left text-body text-muted shadow-overlay [&_strong]:text-foreground',
          )}>
          {children}
        </span>
      ) : null}
    </span>
  )
}
