import { useId, useRef, useState, type ReactNode } from 'react'

import { cx } from './cx'

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
        className="grid size-[1.35rem] place-items-center rounded-full border border-border bg-foreground/5 text-caption font-extrabold italic text-muted transition-[color,border-color] duration-150 hover:border-primary/60 hover:text-foreground aria-expanded:border-primary/60 aria-expanded:text-foreground"
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
        <span id={contentId} role="tooltip" className={cx(
            'absolute z-60 grid gap-[0.35rem]',
            anchor === 'self'
              ? 'right-0 top-[calc(100%+0.45rem)] w-[min(22rem,calc(100vw-2rem))]'
              : 'left-0 top-[calc(100%+0.25rem)] w-[min(26rem,100%)]',
            'rounded-control border border-border-strong bg-card-background px-[0.8rem] py-[0.7rem] text-left text-small text-muted shadow-[0_18px_40px_rgba(0,0,0,0.45)] [&_strong]:text-foreground',
          )}>
          {children}
        </span>
      ) : null}
    </span>
  )
}
