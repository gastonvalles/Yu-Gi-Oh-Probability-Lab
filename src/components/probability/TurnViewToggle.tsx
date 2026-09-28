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
    <div className="lab-turn-toggle" role="radiogroup" aria-label="Vista de turno">
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
            className="lab-turn-toggle-option"
            onClick={() => onChange(option.value)}
          >
            <span className="lab-turn-toggle-label">{option.label}</span>
            {detail ? <span className="lab-turn-toggle-detail">{detail}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
