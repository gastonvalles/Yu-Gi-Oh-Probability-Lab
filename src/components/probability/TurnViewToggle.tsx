import type { TurnView } from '../../types'

interface TurnViewToggleProps {
  activeView: TurnView
  onChange: (nextView: TurnView) => void
}

const OPTIONS: Array<{ value: TurnView; label: string }> = [
  { value: 'first', label: 'Going First' },
  { value: 'second', label: 'Going Second' },
  { value: 'average', label: 'Promedio' },
]

/**
 * Global three-button toggle rendered in the KPI Hero that controls the active
 * viewing lens (`'first' | 'second' | 'average'`) for the Probability Lab.
 * Style mirrors {@link TurnContextToggle} but this is a deck-wide selector, not
 * per-pattern — no `patternId` prop, no Redux action, just `onChange`.
 */
export function TurnViewToggle({ activeView, onChange }: TurnViewToggleProps) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-md"
      role="radiogroup"
      aria-label="Vista de turno"
    >
      {OPTIONS.map((option) => {
        const isActive = activeView === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={[
              'px-3 py-1.5 text-[0.8rem] font-medium transition-colors',
              isActive
                ? 'bg-[rgb(var(--accent-rgb)/0.18)] text-accent'
                : 'surface-panel-soft text-(--text-muted) hover:text-(--text-main)',
            ].join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
