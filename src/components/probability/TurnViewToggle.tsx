import type { TurnView } from '../../types'

interface TurnViewToggleProps {
  activeView: TurnView
  onChange: (nextView: TurnView) => void
  /** Texto secundario por opción (p. ej. "5 cartas · 57%"). */
  details?: Partial<Record<TurnView, string>>
}

const OPTIONS: Array<{ value: TurnView; label: string }> = [
  { value: 'first', label: 'Primero' },
  { value: 'second', label: 'Segundo' },
  { value: 'average', label: 'Promedio' },
]

/** Selector de turno del Probability Lab: cambia qué mano se analiza (5 o 6 cartas). */
export function TurnViewToggle({ activeView, onChange, details }: TurnViewToggleProps) {
  return (
    <div className="grid w-full max-w-[34rem] grid-cols-3 gap-[0.3rem] rounded-panel border border-border bg-secondary/80 p-[0.3rem]" role="radiogroup" aria-label="Vista de turno">
      {OPTIONS.map((option) => {
        const isActive = activeView === option.value
        const detail = details?.[option.value]

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={option.label}
            data-active={isActive ? 'true' : 'false'}
            className="grid min-h-[2.9rem] justify-items-center gap-[0.1rem] rounded-[calc(var(--radius-panel)-0.3rem)] px-[0.4rem] py-[0.35rem] text-muted transition-[background,color] duration-150 hover:bg-foreground/4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary/70 data-[active=true]:bg-primary/20 data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_rgb(var(--primary-rgb)/0.5)]"
            onClick={() => onChange(option.value)}
          >
            <span className="text-[0.86rem] font-bold leading-[1.1]">{option.label}</span>
            {detail ? <span className="whitespace-nowrap text-[0.7rem] leading-[1.1] tabular-nums">{detail}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
