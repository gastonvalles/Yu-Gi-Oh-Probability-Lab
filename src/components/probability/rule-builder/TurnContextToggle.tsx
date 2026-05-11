import type { TurnContext } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface TurnContextToggleProps {
  patternId: string
  currentTurnContext: TurnContext
  actions: PatternEditorActions
}

const OPTIONS: Array<{ value: TurnContext; label: string }> = [
  { value: 'first', label: 'Primero' },
  { value: 'second', label: 'Segundo' },
  { value: 'either', label: 'Ambos' },
]

export function TurnContextToggle({ patternId, currentTurnContext, actions }: TurnContextToggleProps) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-md"
      role="radiogroup"
      aria-label="Contexto de turno"
    >
      {OPTIONS.map((option) => {
        const isActive = currentTurnContext === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={[
              'px-2.5 py-1 text-[0.72rem] transition-colors',
              isActive
                ? 'bg-(--border-subtle) text-(--text-main) font-medium'
                : 'text-(--text-soft) hover:text-(--text-muted)',
            ].join(' ')}
            onClick={() => actions.setPatternTurnContext(patternId, option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
