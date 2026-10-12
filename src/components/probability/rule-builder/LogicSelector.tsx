import type { PatternMatchMode } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { formatInteger } from '../../../app/utils'
import { t } from '../../../i18n'
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
  return t(mode === 'all' ? 'builder.logic.and' : 'builder.logic.or')
}

/** Cómo se combinan las condiciones: Y (todas), O (alcanza una) o al menos N (con el N al lado). */
export function LogicSelector({ patternId, currentMode, conditionCount, minimumConditionMatches, negated = false, actions }: LogicSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        size="sm"
        label={t('builder.logic.label')}
        value={currentMode}
        options={[
          { value: 'all', label: t(negated ? 'builder.logic.allNegated' : 'builder.logic.all') },
          { value: 'any', label: t(negated ? 'builder.logic.anyNegated' : 'builder.logic.any') },
          { value: 'at-least', label: t(negated ? 'builder.logic.atLeastNegated' : 'builder.logic.atLeast', { count: formatInteger(minimumConditionMatches) }) },
        ]}
        onChange={(mode) => actions.setPatternMatchMode(patternId, mode)}
      />
      {currentMode === 'at-least' ? (
        <span className="inline-flex items-center gap-2 text-body text-muted">
          <Stepper
            label={t('builder.logic.minimum')}
            value={minimumConditionMatches}
            min={2}
            max={Math.max(conditionCount, 2)}
            onChange={(value) => actions.setPatternMinimumMatches(patternId, String(value))}
          />
          {t('builder.logic.outOf', { count: formatInteger(conditionCount) })}
        </span>
      ) : null}
    </div>
  )
}
