import { type CSSProperties } from 'react'

import {
  allowsSharedCards,
  getPatternCategorySingular,
  getPatternMatchMode,
  normalizeHandPatternCategory,
  normalizeMinimumConditionMatches,
} from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { CardEntry, HandPattern, PatternMatchMode } from '../../types'
import { Button } from '../ui/Button'
import type { PatternEditorActions } from './pattern-editor-actions'
import { buildPatternPreview } from './pattern-helpers'
import { RequirementRow } from './RequirementRow'

interface PatternCardProps {
  pattern: HandPattern
  isOpen: boolean
  isPendingCreation: boolean
  onToggleOpen: (patternId: string) => void
  onCancelPendingPattern: (patternId: string) => void
  derivedMainCards: CardEntry[]
  actions: PatternEditorActions
}

function getPatternCardTone(isOpening: boolean): CSSProperties {
  return {
    '--pattern-accent-rgb': isOpening ? 'var(--success-rgb)' : 'var(--danger-rgb)',
  } as CSSProperties
}

function getPatternMatchModeLabel(mode: PatternMatchMode, minimumMatches: number): string {
  if (mode === 'all') {
    return 'Todas'
  }

  if (mode === 'any') {
    return 'Cualquiera'
  }

  return `Al menos ${formatInteger(minimumMatches)}`
}

export function PatternCard({
  pattern,
  isOpen,
  isPendingCreation,
  onToggleOpen,
  onCancelPendingPattern,
  derivedMainCards,
  actions,
}: PatternCardProps) {
  const conditionCount = pattern.conditions.length
  const categorySingular = getPatternCategorySingular(pattern.kind)
  const isOpening = normalizeHandPatternCategory(pattern.kind) === 'opening'
  const trimmedName = pattern.name.trim()
  const displayName = trimmedName || (isOpening ? 'Nueva apertura' : 'Nuevo problema')
  const includeRequirementCount = pattern.conditions.filter((condition) => condition.kind === 'include').length
  const namePlaceholder = isOpening ? 'Escribí el nombre de la apertura' : 'Escribí el nombre del problema'
  const canUseMinimumParts = conditionCount > 1
  const minimumPartsValue = Math.max(2, Math.min(normalizeMinimumConditionMatches(pattern), Math.max(conditionCount, 2)))
  const patternMatchMode = getPatternMatchMode(pattern)
  const patternPreview = buildPatternPreview(
    pattern,
    new Map(derivedMainCards.map((card) => [card.id, card])),
  )

  const handleSummaryToggle = () => {
    if (!trimmedName) {
      return
    }

    onToggleOpen(pattern.id)
  }

  const handleNameChange = (value: string) => {
    actions.setPatternName(pattern.id, value)
  }

  return (
    <details
      open={isOpen}
      className={[
        'details-toggle pattern-card grid gap-0',
        isOpening ? 'pattern-card-good' : 'pattern-card-bad',
      ].join(' ')}
      style={getPatternCardTone(isOpening)}
    >
      <summary
        className="pattern-card-summary flex cursor-pointer items-center justify-between gap-3 px-2.5 py-2.5"
        onClick={(event) => {
          event.preventDefault()
          handleSummaryToggle()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleSummaryToggle()
          }
        }}
      >
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="pattern-card-meta text-[0.68rem]">
              {isOpening ? 'Apertura' : 'Problema'}
            </span>
            {!allowsSharedCards(pattern) && includeRequirementCount > 1 ? (
              <span className="pattern-card-meta pattern-card-meta-muted text-[0.68rem]">
                Sin reutilizar
              </span>
            ) : null}
          </div>
          <strong className="truncate text-[0.9rem] text-(--text-main)">{displayName}</strong>
          <p className="app-muted m-0 truncate text-[0.74rem] leading-[1.12]">
            {patternPreview.summary}
          </p>
        </div>
        <button
          type="button"
          className="app-icon-button shrink-0 text-[1rem] leading-none"
          aria-label={`Quitar ${displayName}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            actions.removePattern(pattern.id)
          }}
        >
          ×
        </button>
      </summary>

      <div className="grid gap-2 px-2.5 py-2.5">
        <label className="grid gap-1">
          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Nombre</span>
          <input
            type="text"
            value={pattern.name}
            autoFocus={isPendingCreation}
            placeholder={namePlaceholder}
            onChange={(event) => handleNameChange(event.target.value)}
            onBlur={(event) => {
              if (isPendingCreation && event.currentTarget.value.trim().length === 0) {
                onCancelPendingPattern(pattern.id)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancelPendingPattern(pattern.id)
              }
            }}
            className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
          />
        </label>

        <div className="surface-panel-soft grid gap-2 p-2.5">
          <div className="grid gap-2 min-[1040px]:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
            <div className="grid gap-1">
              <span className="app-muted text-[0.68rem] uppercase tracking-widest">Tipo</span>
              <div className="surface-card inline-flex w-fit items-center gap-1.5 px-2 py-1 text-[0.78rem] text-(--text-main)">
                <strong>{isOpening ? 'Opening' : 'Problem'}</strong>
                <span className="text-(--text-muted)">({isOpening ? 'Apertura' : 'Problema'})</span>
              </div>
            </div>

            <label className="grid gap-1">
              <span className="app-muted text-[0.68rem] uppercase tracking-widest">Lógica</span>
              <select
                value={patternMatchMode}
                onChange={(event) => actions.setPatternMatchMode(pattern.id, event.target.value as PatternMatchMode)}
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="all">Todas las condiciones</option>
                <option value="any">Al menos una condición</option>
                {canUseMinimumParts ? (
                  <option value="at-least">
                    Al menos {formatInteger(minimumPartsValue)} condiciones
                  </option>
                ) : null}
              </select>
            </label>
          </div>

          {patternMatchMode === 'at-least' && conditionCount > 2 ? (
            <label className="grid max-w-45 gap-1">
              <span className="app-muted text-[0.68rem] uppercase tracking-widest">Cantidad mínima de condiciones</span>
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

          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid gap-0.5">
                <span className="app-muted text-[0.68rem] uppercase tracking-widest">Política de reutilización</span>
                <span className="app-soft text-[0.74rem] leading-[1.14]">
                  Define si una misma carta puede cubrir varias condiciones del patrón.
                </span>
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
            <p className="surface-card m-0 px-2 py-1.5 text-[0.74rem] text-(--text-muted)">
              {patternPreview.reuse}
            </p>
          </div>
        </div>

        <div className="surface-card grid gap-1.5 px-2.5 py-2.5">
          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Vista rápida</span>
          <p className="m-0 text-[0.82rem] text-(--text-main)">{patternPreview.summary}</p>
          <ul className="m-0 grid gap-1 pl-4 text-[0.78rem] text-(--text-muted)">
            {patternPreview.items.map((item, index) => (
              <li key={`${pattern.id}-preview-${index}`}>{item}</li>
            ))}
          </ul>
          <div className="grid gap-1 min-[860px]:grid-cols-2">
            <p className="surface-panel-soft m-0 px-2 py-1.5 text-[0.74rem] text-(--text-muted)">
              <strong className="text-(--text-main)">Lógica:</strong> {patternPreview.logic}
            </p>
            <p className="surface-panel-soft m-0 px-2 py-1.5 text-[0.74rem] text-(--text-muted)">
              <strong className="text-(--text-main)">Reutilización:</strong> {patternPreview.reuse}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          {pattern.needsReview ? (
            <p className="surface-card-warning m-0 px-2 py-1.5 text-[0.76rem] text-(--warning)">
              Este patrón viene de una versión anterior. Revisá sus matchers y condiciones antes de volver a calcular.
            </p>
          ) : null}

          {pattern.conditions.length === 0 ? (
            <p className="surface-card p-2 text-[0.76rem] text-(--text-muted)">
              Esta {categorySingular} todavía no tiene condiciones.
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

          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start"
            onClick={() => actions.addRequirement(pattern.id)}
          >
            Agregar otra condición
          </Button>
        </div>
      </div>
    </details>
  )
}
