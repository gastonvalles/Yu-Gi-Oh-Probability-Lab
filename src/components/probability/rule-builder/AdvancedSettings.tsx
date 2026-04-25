import {
  allowsSharedCards,
  getPatternMatchMode,
  normalizeMinimumConditionMatches,
} from '../../../app/patterns'
import { formatInteger } from '../../../app/utils'
import type { HandPattern } from '../../../types'
import { Button } from '../../ui/Button'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface AdvancedSettingsProps {
  pattern: HandPattern
  actions: PatternEditorActions
}

export function AdvancedSettings({ pattern, actions }: AdvancedSettingsProps) {
  const matchMode = getPatternMatchMode(pattern)
  const conditionCount = pattern.conditions.length
  const showMinimumMatches = matchMode === 'at-least' && conditionCount > 1
  const minimumMatches = normalizeMinimumConditionMatches(pattern)
  const conditionsWithDistinct = pattern.conditions.filter((c) => c.quantity > 1)
  const hasAnythingToShow = showMinimumMatches || conditionsWithDistinct.length > 0 || pattern.needsReview

  return (
    <div className="grid gap-3">
      {pattern.needsReview ? (
        <p className="surface-card-warning m-0 px-2.5 py-2 text-[0.76rem] text-(--warning)">
          Esta regla viene de una versión anterior. Revisá estos ajustes antes de confiar en el resultado.
        </p>
      ) : null}

      {/* Reuse policy — always visible, compact */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="app-muted text-[0.72rem] leading-[1.14]">
          ¿Una carta puede cubrir varias condiciones?
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={allowsSharedCards(pattern) ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => actions.setPatternAllowSharedCards(pattern.id, true)}
          >
            Sí
          </Button>
          <Button
            variant={allowsSharedCards(pattern) ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => actions.setPatternAllowSharedCards(pattern.id, false)}
          >
            No
          </Button>
        </div>
      </div>

      {/* Minimum matches (at-least mode) */}
      {showMinimumMatches ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="app-muted text-[0.72rem] leading-[1.14]">
            Mínimo de condiciones a cumplir
          </span>
          <input
            type="number"
            min={2}
            max={Math.max(conditionCount, 1)}
            value={minimumMatches}
            onChange={(event) => actions.setPatternMinimumMatches(pattern.id, event.target.value)}
            className="app-field w-16 px-2 py-[0.35rem] text-center text-[0.82rem]"
          />
        </div>
      ) : null}

      {/* Distinct toggle per condition */}
      {conditionsWithDistinct.length > 0 ? (
        <div className="grid gap-1.5">
          <span className="app-muted text-[0.72rem] leading-[1.14]">
            ¿Contar copias o nombres distintos?
          </span>
          {conditionsWithDistinct.map((condition) => {
            const conditionIndex = pattern.conditions.indexOf(condition)

            return (
              <div
                key={condition.id}
                className="flex flex-wrap items-center justify-between gap-2 surface-card px-2.5 py-1.5 rounded"
              >
                <span className="text-[0.76rem] text-(--text-main)">
                  Condición {formatInteger(conditionIndex + 1)}
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant={condition.distinct ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => actions.setRequirementDistinct(pattern.id, condition.id, false)}
                  >
                    Copias
                  </Button>
                  <Button
                    variant={condition.distinct ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => actions.setRequirementDistinct(pattern.id, condition.id, true)}
                  >
                    Nombres
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
