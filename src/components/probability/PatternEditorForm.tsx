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
  const namePlaceholder = isOpening ? 'Escribí el nombre de la salida' : 'Escribí el nombre del problema'
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
  const shouldOpenAdvancedTuning = pattern.needsReview

  return (
    <div className="pattern-editor-form">
      <section className="pattern-editor-section">
        <div className="grid gap-1.5">
          <div className="grid gap-0.5">
            <small className="app-muted text-[0.68rem] uppercase tracking-widest">Configuración básica</small>
            <strong className="text-[0.92rem] text-(--text-main)">Definí la regla sin vueltas</strong>
          </div>
          <p className="pattern-editor-section-copy m-0">
            Empezá por nombre, tipo y lógica. Las condiciones van abajo y los ajustes finos quedan aparte.
          </p>
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
              <option value="opening">Salida</option>
              <option value="problem">Problema</option>
            </select>
          </label>
        </div>

        <div className="grid gap-2 min-[980px]:grid-cols-[minmax(0,1fr)_240px] min-[980px]:items-end">
          <label className="grid gap-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-widest">Lógica</span>
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

        <div className="pattern-editor-summary">
          <p className="pattern-editor-inline-note m-0">
            {patternPreview.summary}
          </p>
          <p className="pattern-editor-inline-note m-0">
            {patternPreview.logic}
          </p>
        </div>
      </section>

      <section className="pattern-editor-section">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-0.5">
            <small className="app-muted text-[0.68rem] uppercase tracking-widest">Condiciones</small>
            <strong className="text-[0.92rem] text-(--text-main)">Qué tiene que pasar en la mano</strong>
            <p className="pattern-editor-section-copy m-0">
              Sumá solo las condiciones necesarias. Si una sobra, la regla se vuelve más difícil de entender.
            </p>
          </div>

          <Button variant="secondary" size="sm" onClick={() => actions.addRequirement(pattern.id)}>
            Agregar condición
          </Button>
        </div>

        {pattern.conditions.length === 0 ? (
          <p className="pattern-editor-inline-note m-0">
            Esta regla todavía no tiene condiciones.
          </p>
        ) : (
          <div className="grid gap-2">
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

      <details className="details-toggle section-disclosure pattern-editor-disclosure" open={shouldOpenAdvancedTuning}>
        <summary className="section-disclosure-summary">
          <div className="section-disclosure-title">
            <div className="grid gap-0.5">
              <strong className="text-[0.86rem] text-(--text-main)">Ajustes avanzados</strong>
              <span className="app-muted text-[0.72rem] leading-[1.14]">
                Reutilización, vista rápida y afinado fino.
              </span>
            </div>
          </div>
          <span className="section-disclosure-arrow details-arrow">{'>'}</span>
        </summary>

        <div className="grid gap-3 pt-3">
          <section className="grid gap-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid gap-0.5">
                <small className="app-muted text-[0.68rem] uppercase tracking-widest">Reutilización</small>
                <strong className="text-[0.92rem] text-(--text-main)">Cómo comparte cartas entre condiciones</strong>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={allowsSharedCards(pattern) ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => actions.setPatternAllowSharedCards(pattern.id, true)}
                >
                  Permitir reutilización
                </Button>
                <Button
                  variant={allowsSharedCards(pattern) ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => actions.setPatternAllowSharedCards(pattern.id, false)}
                >
                  Prohibir reutilización
                </Button>
              </div>
            </div>

            <p className="pattern-editor-inline-note m-0">{patternPreview.reuse}</p>
          </section>

          <section className="grid gap-1.5 border-t border-(--border-subtle) pt-3">
            <small className="app-muted text-[0.68rem] uppercase tracking-widest">Vista rápida</small>
            <p className="m-0 text-[0.82rem] text-(--text-main)">{patternPreview.summary}</p>
            <p className="pattern-editor-inline-note m-0">
              {patternPreview.items.length > 0 ? patternPreview.items.join(' · ') : 'Todavía no hay una lectura rápida para esta regla.'}
            </p>
          </section>

          {pattern.needsReview ? (
            <p className="pattern-editor-inline-warning m-0">
              Este patron viene de una version anterior. Revisalo antes de confiar en el resultado.
            </p>
          ) : null}
        </div>
      </details>

      <section className="pattern-editor-section pattern-editor-section-danger">
        <small className="app-muted text-[0.68rem] uppercase tracking-widest">Zona delicada</small>
        <p className="pattern-editor-inline-note m-0">
          Eliminar esta regla la saca del analisis y cambia el resultado inmediatamente.
        </p>
        <div>
          <Button variant="tertiary" size="sm" onClick={() => onRequestDelete(pattern.id)}>
            Eliminar regla
          </Button>
        </div>
      </section>
    </div>
  )
}
