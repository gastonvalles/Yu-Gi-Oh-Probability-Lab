import type { PatternMatchMode } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { formatInteger } from '../../../app/utils'
import { Segmented } from '../../ui/Segmented'
import { Stepper } from '../../ui/Stepper'

interface LogicSelectorProps {
  patternId: string
  currentMode: PatternMatchMode
  conditionCount: number
  minimumConditionMatches: number
  /** Todas las condiciones son "Sin …": Y significa "ninguna está" y O "falta alguna" (se dice así para no confundir). */
  negated?: boolean
  actions: PatternEditorActions
}

export function getConnectorWord(mode: PatternMatchMode): string {
  return mode === 'all' ? 'Y' : 'O'
}

/** Cómo se combinan las condiciones: Y (todas), O (alcanza una) o al menos N (con el N al lado). */
export function LogicSelector({ patternId, currentMode, conditionCount, minimumConditionMatches, negated = false, actions }: LogicSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        size="sm"
        label="Cómo se combinan las condiciones"
        value={currentMode}
        options={[
          { value: 'all', label: negated ? 'Y · ninguna está' : 'Y · todas' },
          { value: 'any', label: negated ? 'O · falta alguna' : 'O · una alcanza' },
          { value: 'at-least', label: negated ? `Faltan al menos ${formatInteger(minimumConditionMatches)}` : `Al menos ${formatInteger(minimumConditionMatches)}` },
        ]}
        onChange={(mode) => actions.setPatternMatchMode(patternId, mode)}
      />
      {currentMode === 'at-least' ? (
        <span className="inline-flex items-center gap-2 text-body text-muted">
          <Stepper
            label="Mínimo de condiciones a cumplir"
            value={minimumConditionMatches}
            min={2}
            max={Math.max(conditionCount, 2)}
            onChange={(value) => actions.setPatternMinimumMatches(patternId, String(value))}
          />
          de {formatInteger(conditionCount)}
        </span>
      ) : null}
    </div>
  )
}
