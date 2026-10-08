import type { PatternMatchMode } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { formatInteger } from '../../../app/utils'
import { Segmented } from '../../ui/Segmented'

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

/** Cómo se combinan las condiciones: Y (todas), O (alcanza una) o al menos N. */
export function LogicSelector({ patternId, currentMode, minimumConditionMatches, negated = false, actions }: LogicSelectorProps) {
  return (
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
  )
}
