import { useMemo } from 'react'

import {
  allowsSharedCards,
  getPatternMatchMode,
  normalizeMinimumConditionMatches,
} from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { CardEntry, HandPattern, HandPatternCategory, PatternMatchMode } from '../../types'
import { Button } from '../ui/Button'
import { buildPatternPreview } from './pattern-helpers'
import type { PatternEditorActions } from './pattern-editor-actions'
import { RequirementRow } from './RequirementRow'

interface PatternEditorFormProps {
  actions: PatternEditorActions
  derivedMainCards: CardEntry[]
  isPendingCreation?: boolean
  onRequestDelete: (patternId: string) => void
  pattern: HandPattern
}

export function PatternEditorForm({
  actions,
  derivedMainCards,
  isPendingCreation = false,
  onRequestDelete,
  pattern,
}: PatternEditorFormProps) {
  const conditionCount = pattern.conditions.length
  const isOpening = pattern.kind === 'opening'
  const includeRequirementCount = pattern.conditions.filter((condition) => condition.kind === 'include').length
  const namePlaceholder = isOpening ? 'Escribí el nombre del chequeo' : 'Escribí el nombre del riesgo'
  const canUseMinimumParts = conditionCount > 1
  const minimumPartsValue = Math.max(
    2,
    Math.min(normalizeMinimumConditionMatches(pattern), Math.max(conditionCount, 2)),
  )
  const patternMatchMode = getPatternMatchMode(pattern)
  const patternPreview = useMemo(
    () => buildPatternPreview(pattern, new Map(derivedMainCards.map((card) => [card.id, card]))),
    [derivedMainCards, pattern],
  )
  const shouldOpenAdvancedTuning = patternMatchMode === 'at-least' || includeRequirementCount > 1 || pattern.needsReview

  return (
    <div className="grid gap-3">
      <section className="surface-card grid gap-2.5 px-3 py-3">
        <div className="grid gap-0.5">
          <small className="app-muted text-[0.68rem] uppercase tracking-widest">Que queres medir</small>
          <strong className="text-[0.92rem] text-(--text-main)">Defini el chequeo</strong>
        </div>

        <div className="grid gap-2 min-[980px]:grid-cols-[minmax(0,1fr)_180px]">
          <label className="grid gap-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-widest">Nombre</span>
            <input
              type="text"
              value={pattern.name}
              autoFocus={isPendingCreation}
              placeholder={namePlaceholder}
              onChange={(event) => actions.setPatternName(pattern.id, event.target.value)}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            />
          </label>

          <label className="grid gap-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-widest">Tipo</span>
            <select
              value={pattern.kind}
              onChange={(event) => actions.setPatternCategory(pattern.id, event.target.value as HandPatternCategory)}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="opening">Apertura</option>
              <option value="problem">Problema</option>
            </select>
          </label>
        </div>

        <p className="surface-panel-soft m-0 px-2.5 py-2 text-[0.76rem] text-(--text-muted)">
          {patternPreview.summary}
        </p>
      </section>

      <section className="surface-card grid gap-2.5 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-0.5">
            <small className="app-muted text-[0.68rem] uppercase tracking-widest">Condiciones</small>
            <strong className="text-[0.92rem] text-(--text-main)">Que tiene que pasar en la mano</strong>
          </div>

          <Button variant="secondary" size="sm" onClick={() => actions.addRequirement(pattern.id)}>
            Agregar condicion
          </Button>
        </div>

        {pattern.conditions.length === 0 ? (
          <p className="surface-panel-soft m-0 px-2.5 py-2 text-[0.76rem] text-(--text-muted)">
            Este chequeo todavia no tiene condiciones.
          </p>
        ) : (
          <div className="grid gap-1.5">
            {pattern.conditions.map((requirement, requirementIndex) => (
              <RequirementRow
                key={requirement.id}
                index={requirementIndex}
                patternId={pattern.id}
                requirement={requirement}
                derivedMainCards={derivedMainCards}
                actions={actions}
              />
            ))}
          </div>
        )}
      </section>

      <section className="surface-card grid gap-2.5 px-3 py-3">
        <div className="grid gap-0.5">
          <small className="app-muted text-[0.68rem] uppercase tracking-widest">Como se evalua</small>
          <strong className="text-[0.92rem] text-(--text-main)">Define la logica del chequeo</strong>
        </div>

        <div className="grid gap-2 min-[980px]:grid-cols-[minmax(0,1fr)_240px] min-[980px]:items-end">
          <label className="grid gap-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-widest">Logica</span>
            <select
              value={patternMatchMode}
              onChange={(event) => actions.setPatternMatchMode(pattern.id, event.target.value as PatternMatchMode)}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="all">Todas las condiciones</option>
              <option value="any">Al menos una condicion</option>
              {canUseMinimumParts ? (
                <option value="at-least">Al menos {formatInteger(minimumPartsValue)} condiciones</option>
              ) : null}
            </select>
          </label>

          {patternMatchMode === 'at-least' && conditionCount > 2 ? (
            <label className="grid gap-1">
              <span className="app-muted text-[0.68rem] uppercase tracking-widest">Minimo de condiciones</span>
              <input
                type="number"
                min={2}
                max={Math.max(pattern.conditions.length, 1)}
                value={pattern.minimumConditionMatches}
                onChange={(event) => actions.setPatternMinimumMatches(pattern.id, event.target.value)}
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              />
            </label>
          ) : null}
        </div>

        <p className="surface-panel-soft m-0 px-2.5 py-2 text-[0.76rem] text-(--text-muted)">
          {patternPreview.logic}
        </p>
      </section>

      <details className="details-toggle section-disclosure" open={shouldOpenAdvancedTuning}>
        <summary className="section-disclosure-summary">
          <div className="section-disclosure-title">
            <div className="grid gap-0.5">
              <strong className="text-[0.86rem] text-(--text-main)">Mas ajustes</strong>
              <span className="app-muted text-[0.72rem] leading-[1.14]">
                Reutilizacion y lectura rapida del chequeo.
              </span>
            </div>
          </div>
          <span className="section-disclosure-arrow details-arrow">{'>'}</span>
        </summary>

        <div className="grid gap-3 p-3">
          <section className="surface-card grid gap-2.5 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid gap-0.5">
                <small className="app-muted text-[0.68rem] uppercase tracking-widest">Reutilizacion</small>
                <strong className="text-[0.92rem] text-(--text-main)">Como comparte cartas entre condiciones</strong>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={allowsSharedCards(pattern) ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => actions.setPatternAllowSharedCards(pattern.id, true)}
                >
                  Permitir reutilizacion
                </Button>
                <Button
                  variant={allowsSharedCards(pattern) ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => actions.setPatternAllowSharedCards(pattern.id, false)}
                >
                  Prohibir reutilizacion
                </Button>
              </div>
            </div>

            <p className="surface-panel-soft m-0 px-2.5 py-2 text-[0.76rem] text-(--text-muted)">
              {patternPreview.reuse}
            </p>
          </section>

          <section className="surface-card grid gap-1.5 px-3 py-3">
            <small className="app-muted text-[0.68rem] uppercase tracking-widest">Vista rapida</small>
            <p className="m-0 text-[0.82rem] text-(--text-main)">{patternPreview.summary}</p>
            <ul className="m-0 grid gap-1 pl-4 text-[0.78rem] text-(--text-muted)">
              {patternPreview.items.map((item, index) => (
                <li key={`${pattern.id}-preview-${index}`}>{item}</li>
              ))}
            </ul>
          </section>

          {pattern.needsReview ? (
            <p className="surface-card-warning m-0 px-3 py-2 text-[0.76rem] text-(--warning)">
              Este patron viene de una version anterior. Revisalo antes de confiar en el resultado.
            </p>
          ) : null}
        </div>
      </details>

      <section className="surface-card grid gap-1.5 border border-[rgb(var(--destructive-rgb)/0.18)] px-3 py-3">
        <small className="app-muted text-[0.68rem] uppercase tracking-widest">Zona delicada</small>
        <p className="m-0 text-[0.78rem] text-(--text-muted)">
          Eliminar este chequeo lo saca del analisis y cambia el resultado inmediatamente.
        </p>
        <div>
          <Button variant="tertiary" size="sm" onClick={() => onRequestDelete(pattern.id)}>
            Eliminar chequeo
          </Button>
        </div>
      </section>
    </div>
  )
}
