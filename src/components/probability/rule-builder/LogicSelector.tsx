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
  actions: PatternEditorActions
}

/**
 * Cómo se combinan las condiciones, con palabras: «Con 3 condiciones, la mano cumple: Todas · Alguna · Un mínimo» y, con «Un mínimo», «al menos [− 2 +] de las 3».
 * Cada condición ya dice «Tiene» o «No tiene», así que las palabras no se invierten con las condiciones negadas.
 */
export function LogicSelector({ patternId, currentMode, conditionCount, minimumConditionMatches, actions }: LogicSelectorProps) {
  return (
    <div className="grid gap-1.5">
      <p className="m-0 text-body text-muted">{t('builder.logic.lead', { count: formatInteger(conditionCount) })}</p>
      <Segmented
        fullWidth
        label={t('builder.logic.label')}
        value={currentMode}
        options={[
          { value: 'all', label: t('builder.logic.all') },
          { value: 'any', label: t('builder.logic.any') },
          { value: 'at-least', label: t('builder.logic.atLeast') },
        ]}
        onChange={(mode) => {
          actions.setPatternMatchMode(patternId, mode)

          // «Un mínimo» que pide todas es lo mismo que «Todas»: arranca en una menos (y nunca menos de 2).
          if (mode === 'at-least' && currentMode !== 'at-least') {
            actions.setPatternMinimumMatches(patternId, String(Math.max(2, conditionCount - 1)))
          }
        }}
      />
      {currentMode === 'at-least' ? (
        <span className="flex items-center gap-2 text-body text-foreground">
          {t('builder.logic.atLeastLead')}
          <Stepper
            size="lg"
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
