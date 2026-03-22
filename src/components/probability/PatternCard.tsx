import { type CSSProperties } from 'react'

import { getPatternCategorySingular, normalizeHandPatternCategory } from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { DerivedDeckGroup } from '../../app/deck-groups'
import type { CardEntry, HandPattern, PatternMatchMode } from '../../types'
import { Button } from '../ui/Button'
import type { PatternEditorActions } from './pattern-editor-actions'
import { RequirementRow } from './RequirementRow'

interface PatternCardProps {
  pattern: HandPattern
  isOpen: boolean
  isPendingCreation: boolean
  onToggleOpen: (patternId: string) => void
  onCancelPendingPattern: (patternId: string) => void
  derivedMainCards: CardEntry[]
  derivedGroups: DerivedDeckGroup[]
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
  derivedGroups,
  actions,
}: PatternCardProps) {
  const conditionCount = pattern.requirements.length
  const categorySingular = getPatternCategorySingular(pattern.category)
  const isOpening = normalizeHandPatternCategory(pattern.category) === 'good'
  const trimmedName = pattern.name.trim()
  const displayName = trimmedName || (isOpening ? 'Nueva apertura' : 'Nuevo problema')
  const includeRequirementCount = pattern.requirements.filter((requirement) => requirement.kind === 'include').length
  const namePlaceholder = isOpening ? 'Escribí el nombre de la apertura' : 'Escribí el nombre del problema'
  const canUseMinimumParts = conditionCount > 1
  const minimumPartsValue = Math.max(2, Math.min(pattern.minimumMatches, Math.max(conditionCount, 2)))
  const conditionLabel = `${formatInteger(conditionCount)} condicion${conditionCount === 1 ? '' : 'es'}`
  const logicLabel = conditionCount > 1 ? getPatternMatchModeLabel(pattern.matchMode, minimumPartsValue) : null

  const handleSummaryToggle = () => {
    if (!trimmedName) {
      return
    }

    onToggleOpen(pattern.id)
  }

  const handleNameChange = (value: string) => {
    const shouldOpenAfterNaming = !trimmedName && value.trim().length > 0

    actions.setPatternName(pattern.id, value)

    if (shouldOpenAfterNaming && !isOpen) {
      onToggleOpen(pattern.id)
    }
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
        <div className="grid min-w-0 gap-0.5">
          {trimmedName ? (
            <>
              <strong className="truncate text-[0.9rem] text-(--text-main)">{displayName}</strong>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="pattern-card-meta text-[0.72rem]">{conditionLabel}</span>
                {logicLabel ? (
                  <span className="pattern-card-meta text-[0.72rem]">{logicLabel}</span>
                ) : null}
                {!pattern.allowSharedCards && includeRequirementCount > 1 ? (
                  <span className="pattern-card-meta pattern-card-meta-muted text-[0.72rem]">
                    No reutiliza carta
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <div
              className="grid gap-1"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <strong className="text-[0.9rem] text-(--text-main)">{displayName}</strong>
              <input
                type="text"
                value={pattern.name}
                autoFocus
                placeholder={namePlaceholder}
                onChange={(event) => handleNameChange(event.target.value)}
                onBlur={(event) => {
                  if (isPendingCreation && event.currentTarget.value.trim().length === 0) {
                    onCancelPendingPattern(pattern.id)
                  }
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()

                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancelPendingPattern(pattern.id)
                  }
                }}
                className="app-field min-w-65 max-w-105 px-2 py-[0.45rem] text-[0.84rem] max-[760px]:min-w-0"
              />
            </div>
          )}
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
        <div
          className={[
            'grid gap-2 min-[1040px]:items-end',
            conditionCount > 1
              ? 'min-[1040px]:grid-cols-[minmax(0,1fr)_auto]'
              : 'min-[1040px]:grid-cols-[auto]',
          ].join(' ')}
        >
          {conditionCount > 1 ? (
            <label className="grid gap-1">
              <span className="app-muted text-[0.68rem] uppercase tracking-widest">Lógica</span>
              <select
                value={pattern.matchMode}
                onChange={(event) => actions.setPatternMatchMode(pattern.id, event.target.value as PatternMatchMode)}
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="all">Se cumple con todo esto</option>
                <option value="any">Se cumple con cualquiera de estas condiciones</option>
                {canUseMinimumParts ? (
                  <option value="at-least">
                    Se cumple con al menos {formatInteger(minimumPartsValue)} de estas condiciones
                  </option>
                ) : null}
              </select>
            </label>
          ) : null}

          <div />
        </div>

        {pattern.matchMode === 'at-least' && conditionCount > 2 ? (
          <label className="grid max-w-45 gap-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-widest">Condiciones que deben cumplirse</span>
            <input
              type="number"
              min={2}
              max={Math.max(pattern.requirements.length, 1)}
              value={pattern.minimumMatches}
              onChange={(event) => actions.setPatternMinimumMatches(pattern.id, event.target.value)}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            />
          </label>
        ) : null}

        {includeRequirementCount > 1 ? (
          <div className="surface-card flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
            <div className="grid gap-0.5">
              <span className="app-muted text-[0.68rem] uppercase tracking-widest">Reutilizar carta</span>
              <span className="app-soft text-[0.74rem] leading-[1.14]">
                Si una carta entra en dos grupos dentro de esta regla.
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={pattern.allowSharedCards ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => actions.setPatternAllowSharedCards(pattern.id, true)}
              >
                Reutilizar
              </Button>
              <Button
                variant={pattern.allowSharedCards ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => actions.setPatternAllowSharedCards(pattern.id, false)}
              >
                Utilizar otra
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2">
          {pattern.requirements.length === 0 ? (
            <p className="surface-card p-2 text-[0.76rem] text-(--text-muted)">
              Esta {categorySingular} todavía no tiene condiciones.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {pattern.requirements.map((requirement, requirementIndex) => (
                <RequirementRow
                  key={requirement.id}
                  index={requirementIndex}
                  patternId={pattern.id}
                  requirement={requirement}
                  derivedMainCards={derivedMainCards}
                  derivedGroups={derivedGroups}
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
