import type { PatternKind } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface KindToggleProps {
  patternId: string
  currentKind: PatternKind
  actions: PatternEditorActions
}

export function KindToggle({ patternId, currentKind, actions }: KindToggleProps) {
  const isOpening = currentKind === 'opening'

  return (
    <div className="inline-flex overflow-hidden rounded-md" role="radiogroup" aria-label="Tipo de regla">
      <button
        type="button"
        role="radio"
        aria-checked={isOpening}
        className={[
          'px-3 py-1.5 text-[0.8rem] font-medium transition-colors',
          isOpening
            ? 'bg-[rgb(var(--success-rgb)/0.18)] text-accent'
            : 'surface-panel-soft text-(--text-muted) hover:text-(--text-main)',
        ].join(' ')}
        onClick={() => actions.setPatternCategory(patternId, 'opening')}
      >
        Salida
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={!isOpening}
        className={[
          'px-3 py-1.5 text-[0.8rem] font-medium transition-colors',
          !isOpening
            ? 'bg-[rgb(var(--danger-rgb)/0.18)] text-destructive'
            : 'surface-panel-soft text-(--text-muted) hover:text-(--text-main)',
        ].join(' ')}
        onClick={() => actions.setPatternCategory(patternId, 'problem')}
      >
        Problema
      </button>
    </div>
  )
}
