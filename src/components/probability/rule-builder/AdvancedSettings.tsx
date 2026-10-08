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
import { Switch } from '../../ui/Switch'
import { Callout } from '../../ui/Callout'
import { Segmented } from '../../ui/Segmented'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { NumberField } from '../../ui/NumberField'
import { field } from '../../ui/surfaces'

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
        <Callout tone="warning">Esta regla viene de una versión anterior. Revisá estos ajustes antes de confiar en el resultado.</Callout>
      ) : null}

      {/* Reuse policy — only show when there's actual overlap between conditions */}
      {hasOverlap ? (
        <div className="grid gap-1.5 py-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body font-medium text-foreground">
              ¿La misma carta cuenta para más de una condición?
            </span>
            <Switch
              checked={allowsSharedCards(pattern)}
              label="La misma carta cuenta para más de una condición"
              onChange={(checked) => actions.setPatternAllowSharedCards(pattern.id, checked)}
            />
          </div>
          <p className="m-0 text-micro text-muted">
            Hay cartas que aparecen en más de una condición.
            {allowsSharedCards(pattern)
              ? ' Una misma carta puede satisfacer varias condiciones a la vez.'
              : ' Cada condición necesita cartas distintas.'}
          </p>
        </div>
      ) : null}

      {/* Una salida puede "rescatar" cartas que de otro modo cuentan como muertas en los problemas. */}
      {pattern.kind === 'opening' ? (
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="grid gap-0.5">
            <span className="text-body font-medium text-foreground">Rescatar las cartas que usa</span>
            <span className="text-micro text-muted">
              {pattern.rescuesCards
                ? 'Si la mano cumple esta salida, sus cartas no cuentan como muertas en los problemas.'
                : 'Los problemas cuentan todas las cartas de la mano.'}
            </span>
          </span>
          <Switch
            checked={pattern.rescuesCards === true}
            label="Rescatar las cartas que usa"
            onChange={(checked) => actions.setPatternRescuesCards(pattern.id, checked)}
          />
        </div>
      ) : null}

      {/* Minimum matches (at-least mode) */}
      {showMinimumMatches ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted text-micro">
            Mínimo de condiciones a cumplir
          </span>
          <NumberField
            min={2}
            max={Math.max(conditionCount, 2)}
            value={minimumMatches}
            onChange={(value) => actions.setPatternMinimumMatches(pattern.id, String(value))}
            aria-label="Mínimo de condiciones a cumplir"
            className={`${field} h-9 w-16 px-2 text-center text-body`}
          />
        </div>
      ) : null}

      {/* Distinct toggle per condition */}
      {conditionsWithDistinct.length > 0 ? (
        <div className="grid gap-1.5">
          <span className="text-muted text-micro">
            ¿Contar copias o nombres distintos?
          </span>
          {conditionsWithDistinct.map((condition) => {
            const conditionIndex = pattern.conditions.indexOf(condition)

            return (
              <div key={condition.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="text-body text-foreground">Condición {formatInteger(conditionIndex + 1)}</span>
                <Segmented
                  size="sm"
                  label={`Contar copias o nombres de la condición ${formatInteger(conditionIndex + 1)}`}
                  value={condition.distinct ? 'names' : 'copies'}
                  onChange={(next) => actions.setRequirementDistinct(pattern.id, condition.id, next === 'names')}
                  options={[
                    { value: 'copies', label: 'Copias' },
                    { value: 'names', label: 'Nombres' },
                  ]}
                />
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
