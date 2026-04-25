import type { PatternMatchMode } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { formatInteger } from '../../../app/utils'

interface LogicSelectorProps {
  patternId: string
  currentMode: PatternMatchMode
  conditionCount: number
  minimumConditionMatches: number
  actions: PatternEditorActions
}

const MODE_DESCRIPTIONS: Record<PatternMatchMode, string> = {
  all: 'Todas las condiciones deben cumplirse a la vez.',
  any: 'Basta con que se cumpla una sola condición.',
  'at-least': 'Deben cumplirse al menos N de las condiciones.',
}

function getModeDescription(mode: PatternMatchMode, minimumMatches: number): string {
  if (mode === 'at-least') {
    return `Deben cumplirse al menos ${formatInteger(minimumMatches)} de las condiciones.`
  }

  return MODE_DESCRIPTIONS[mode]
}

export function getConnectorWord(mode: PatternMatchMode): string {
  return mode === 'all' ? 'Y' : 'O'
}

export function LogicSelector({
  patternId,
  currentMode,
  conditionCount,
  minimumConditionMatches,
  actions,
}: LogicSelectorProps) {
  const canUseAtLeast = conditionCount > 1

  return (
    <div className="grid gap-1.5">
      <div className="inline-flex overflow-hidden rounded-md" role="radiogroup" aria-label="Lógica de condiciones">
        <LogicOption
          label="Cumplir todas"
          isActive={currentMode === 'all'}
          disabled={false}
          onClick={() => actions.setPatternMatchMode(patternId, 'all')}
        />
        <LogicOption
          label="Cumplir cualquiera"
          isActive={currentMode === 'any'}
          disabled={false}
          onClick={() => actions.setPatternMatchMode(patternId, 'any')}
        />
        <LogicOption
          label={`Cumplir al menos ${formatInteger(minimumConditionMatches)}`}
          isActive={currentMode === 'at-least'}
          disabled={!canUseAtLeast}
          onClick={() => actions.setPatternMatchMode(patternId, 'at-least')}
        />
      </div>
      <p className="app-muted m-0 text-[0.72rem] leading-[1.16]">
        {getModeDescription(currentMode, minimumConditionMatches)}
      </p>
    </div>
  )
}

function LogicOption({
  label,
  isActive,
  disabled,
  onClick,
}: {
  label: string
  isActive: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-disabled={disabled}
      disabled={disabled}
      className={[
        'px-3 py-1.5 text-[0.78rem] font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed text-(--text-soft) opacity-40'
          : isActive
            ? 'bg-[rgb(var(--primary-rgb)/0.16)] text-(--text-main)'
            : 'surface-panel-soft text-(--text-muted) hover:text-(--text-main)',
      ].join(' ')}
      onClick={disabled ? undefined : onClick}
    >
      {label}
    </button>
  )
}
