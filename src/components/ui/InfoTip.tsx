import { useId, useState, type ReactNode } from 'react'

interface InfoTipProps {
  label: string
  children: ReactNode
}

/** Ícono "i" con explicación: se abre con hover o foco (desktop) y con un toque (mobile). */
export function InfoTip({ label, children }: InfoTipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const contentId = useId()

  return (
    <span className="info-tip" onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setIsOpen(false)}>
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={label}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? contentId : undefined}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((current) => !current)
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
