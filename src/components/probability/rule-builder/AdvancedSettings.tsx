import { useMemo } from 'react'

import {
  allowsSharedCards,
  getPatternMatchMode,
  normalizeMinimumConditionMatches,
  resolveConditionCardIds,
} from '../../../app/patterns'
import { buildDerivedDeckGroupMap } from '../../../app/deck-groups'
import { formatInteger } from '../../../app/utils'
import type { CardEntry, HandPattern } from '../../../types'
import { Button } from '../../ui/Button'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface AdvancedSettingsProps {
  pattern: HandPattern
  actions: PatternEditorActions
  derivedMainCards: CardEntry[]
}

export function AdvancedSettings({ pattern, actions, derivedMainCards }: AdvancedSettingsProps) {
  const matchMode = getPatternMatchMode(pattern)
  const conditionCount = pattern.conditions.length
  const showMinimumMatches = matchMode === 'at-least' && conditionCount > 1
  const minimumMatches = normalizeMinimumConditionMatches(pattern)
  const conditionsWithDistinct = pattern.conditions.filter((c) => c.quantity > 1)

  // Detect overlap: are there cards that appear in more than one condition?
  const hasOverlap = useMemo(() => {
    if (conditionCount < 2) return false

    const groupsByKey = buildDerivedDeckGroupMap(derivedMainCards)
    const conditionCardSets = pattern.conditions
      .filter((c) => c.matcher !== null)
      .map((c) => new Set(resolveConditionCardIds(c, groupsByKey, derivedMainCards)))

    for (let i = 0; i < conditionCardSets.length; i++) {
      for (let j = i + 1; j < conditionCardSets.length; j++) {
        for (const cardId of conditionCardSets[i]) {
          if (conditionCardSets[j].has(cardId)) {
            return true
          }
        }
      }
    }

    return false
  }, [conditionCount, derivedMainCards, pattern.conditions])

  return (
    <div className="grid gap-3">
      {pattern.needsReview ? (
        <p className="surface-card-warning m-0 px-2.5 py-2 text-[0.76rem] text-(--warning)">
          Esta regla viene de una versión anterior. Revisá estos ajustes antes de confiar en el resultado.
        </p>
      ) : null}

      {/* Reuse policy — only show when there's actual overlap between conditions */}
      {hasOverlap ? (
        <div className="surface-card grid gap-1.5 px-3 py-2.5 rounded">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.76rem] text-(--text-main) leading-[1.14]">
              ¿La misma carta cuenta para más de una condición?
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={allowsSharedCards(pattern)}
              className={[
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                allowsSharedCards(pattern) ? 'bg-(--primary)' : 'bg-(--border-subtle)',
              ].join(' ')}
              onClick={() => actions.setPatternAllowSharedCards(pattern.id, !allowsSharedCards(pattern))}
            >
              <span
                className={[
                  'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  allowsSharedCards(pattern) ? 'translate-x-5' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </div>
          <p className="m-0 text-[0.68rem] text-(--text-muted) leading-[1.2]">
            Hay cartas que aparecen en más de una condición.
            {allowsSharedCards(pattern)
              ? ' Una misma carta puede satisfacer varias condiciones a la vez.'
              : ' Cada condición necesita cartas distintas.'}
          </p>
        </div>
      ) : null}

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
