import type { PatternMatchMode } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { formatInteger } from '../../../app/utils'
import { cx } from '../../ui/cx'

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
      <div className="inline-flex overflow-hidden rounded-control border border-border-subtle" role="radiogroup" aria-label="Lógica de condiciones">
        <LogicOption
          label="Todas"
          isActive={currentMode === 'all'}
          disabled={false}
          onClick={() => actions.setPatternMatchMode(patternId, 'all')}
        />
        <LogicOption
          label="Cualquiera"
          isActive={currentMode === 'any'}
          disabled={false}
          onClick={() => actions.setPatternMatchMode(patternId, 'any')}
        />
        <LogicOption
          label={`Al menos ${formatInteger(minimumConditionMatches)}`}
          isActive={currentMode === 'at-least'}
          disabled={!canUseAtLeast}
          onClick={() => actions.setPatternMatchMode(patternId, 'at-least')}
        />
      </div>
      <p className="text-muted m-0 text-small">
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
      className={cx(
        'px-3 py-2 text-body font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus',
        disabled
          ? 'cursor-not-allowed bg-white/3 text-soft opacity-40'
          : isActive
            ? 'bg-primary/20 text-foreground'
            : 'bg-white/3 text-muted hover:bg-white/6 hover:text-foreground',
      )}
      onClick={disabled ? undefined : onClick}
    >
      {label}
    </button>
  )
}
