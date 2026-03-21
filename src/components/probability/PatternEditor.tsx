import { useEffect, useMemo, useState } from 'react'

import {
  getPatternCategorySingular,
  getPatternDedupKey,
  normalizeHandPatternCategory,
} from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { DerivedDeckGroup } from '../../app/deck-groups'
import type {
  CardEntry,
  CardGroupKey,
  HandPattern,
  HandPatternCategory,
  PatternMatchMode,
  PatternRequirement,
  RequirementKind,
  RequirementSource,
} from '../../types'
import { buildPatternMatchExplanation, buildRequirementSummary } from './pattern-helpers'

interface PatternEditorProps {
  patterns: HandPattern[]
  derivedMainCards: CardEntry[]
  derivedGroups: DerivedDeckGroup[]
  onAddPattern: (category: HandPatternCategory) => string
  onRemovePattern: (patternId: string) => void
  onPatternCategoryChange: (patternId: string, value: HandPatternCategory) => void
  onPatternNameChange: (patternId: string, value: string) => void
  onPatternMatchModeChange: (patternId: string, value: PatternMatchMode) => void
  onPatternMinimumMatchesChange: (patternId: string, value: string) => void
  onPatternAllowSharedCardsChange: (patternId: string, value: boolean) => void
  onAddRequirement: (patternId: string) => void
  onRemoveRequirement: (patternId: string, requirementId: string) => void
  onAddRequirementCard: (patternId: string, requirementId: string, cardId: string) => void
  onRemoveRequirementCard: (patternId: string, requirementId: string, cardId: string) => void
  onRequirementKindChange: (patternId: string, requirementId: string, value: RequirementKind) => void
  onRequirementDistinctChange: (patternId: string, requirementId: string, value: boolean) => void
  onRequirementCountChange: (patternId: string, requirementId: string, value: string) => void
  onRequirementSourceChange: (patternId: string, requirementId: string, value: RequirementSource) => void
  onRequirementGroupChange: (patternId: string, requirementId: string, value: CardGroupKey | null) => void
}

export function PatternEditor({
  patterns,
  derivedMainCards,
  derivedGroups,
  onAddPattern,
  onRemovePattern,
  onPatternCategoryChange,
  onPatternNameChange,
  onPatternMatchModeChange,
  onPatternMinimumMatchesChange,
  onPatternAllowSharedCardsChange,
  onAddRequirement,
  onRemoveRequirement,
  onAddRequirementCard,
  onRemoveRequirementCard,
  onRequirementKindChange,
  onRequirementDistinctChange,
  onRequirementCountChange,
  onRequirementSourceChange,
  onRequirementGroupChange,
}: PatternEditorProps) {
  const dedupedPatterns = useMemo(
    () =>
      patterns.filter((pattern, index, entries) => {
        const patternKey = getPatternDedupKey(pattern)

        return entries.findIndex((entry) => getPatternDedupKey(entry) === patternKey) === index
      }),
    [patterns],
  )
  const [activeCategory, setActiveCategory] = useState<HandPatternCategory>('good')
  const [openPatternIds, setOpenPatternIds] = useState<Set<string>>(() => new Set())
  const [pendingPatternIds, setPendingPatternIds] = useState<Set<string>>(() => new Set())
  const isOpeningView = activeCategory === 'good'
  const openingCount = useMemo(
    () => dedupedPatterns.filter((pattern) => normalizeHandPatternCategory(pattern.category) === 'good').length,
    [dedupedPatterns],
  )
  const problemCount = useMemo(
    () => dedupedPatterns.filter((pattern) => normalizeHandPatternCategory(pattern.category) === 'bad').length,
    [dedupedPatterns],
  )
  const visiblePatterns = useMemo(
    () => dedupedPatterns.filter((pattern) => normalizeHandPatternCategory(pattern.category) === activeCategory),
    [activeCategory, dedupedPatterns],
  )
  const sectionEmptyMessage =
    isOpeningView
      ? 'Todavía no cargaste aperturas. Agregá una para marcar qué mano sí querés ver al robar.'
      : 'Todavía no cargaste problemas. Agregá uno para marcar qué mano no querés ver al robar.'

  const handleCategoryChange = (category: HandPatternCategory) => {
    setActiveCategory(category)
    setOpenPatternIds(new Set())
  }

  useEffect(() => {
    setPendingPatternIds((current) => {
      const next = new Set<string>()

      for (const patternId of current) {
        const pattern = dedupedPatterns.find((entry) => entry.id === patternId)

        if (pattern && pattern.name.trim().length === 0) {
          next.add(patternId)
        }
      }

      return next
    })
  }, [dedupedPatterns])

  const handlePatternToggle = (patternId: string) => {
    setOpenPatternIds((current) => {
      const next = new Set(current)

      if (next.has(patternId)) {
        next.delete(patternId)
      } else {
        next.add(patternId)
      }

      return next
    })
  }

  const handleAddPattern = () => {
    const patternId = onAddPattern(activeCategory)

    setPendingPatternIds((current) => new Set(current).add(patternId))
    setOpenPatternIds((current) => {
      const next = new Set(current)
      next.delete(patternId)
      return next
    })
  }

  const handleCancelPendingPattern = (patternId: string) => {
    setPendingPatternIds((current) => {
      const next = new Set(current)
      next.delete(patternId)
      return next
    })
    onRemovePattern(patternId)
  }

  return (
    <div className="grid min-h-0 content-start gap-2">
      <div className="mb-2.5 flex items-start justify-between gap-2.5 max-[760px]:flex-col max-[760px]:items-stretch">
        <div>
          <h3 className="m-0 text-[1rem] leading-none">
            {isOpeningView ? 'Aperturas que querés ver' : 'Problemas que querés evitar'}
          </h3>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2 max-[760px]:justify-start">
          <div className="app-tab-strip">
            <button
              type="button"
              className={[
                'app-tab text-[0.8rem]',
                activeCategory === 'good' ? 'app-tab-active' : '',
              ].join(' ')}
              onClick={() => handleCategoryChange('good')}
            >
              Aperturas {formatInteger(openingCount)}
            </button>
            <button
              type="button"
              className={[
                'app-tab text-[0.8rem]',
                activeCategory === 'bad' ? 'app-tab-active' : '',
              ].join(' ')}
              onClick={() => handleCategoryChange('bad')}
            >
              Problemas {formatInteger(problemCount)}
            </button>
          </div>
          <button
            type="button"
            className="app-button app-button-primary px-2 py-1 text-[0.8rem]"
            onClick={handleAddPattern}
          >
            {activeCategory === 'good' ? 'Agregar apertura' : 'Agregar problema'}
          </button>
        </div>
      </div>

      <p className="app-muted m-0 text-[0.74rem] leading-[1.16]">
        {isOpeningView
          ? 'Cada apertura representa una mano o combinación de cartas que te gusta abrir.'
          : 'Cada problema representa algo incómodo que no querés que te pase al robar.'}
      </p>

      {visiblePatterns.length === 0 ? (
        <p className="surface-card p-2.5 text-[0.82rem] text-[var(--text-muted)]">
          {sectionEmptyMessage}
        </p>
      ) : (
        <div className="min-h-0 overflow-y-auto min-[1180px]:pr-1">
          <div className="grid gap-2.5">
            {visiblePatterns.map((pattern) => (
              <PatternCard
                key={pattern.id}
                pattern={pattern}
                isOpen={openPatternIds.has(pattern.id)}
                isPendingCreation={pendingPatternIds.has(pattern.id)}
                onToggleOpen={handlePatternToggle}
                onCancelPendingPattern={handleCancelPendingPattern}
                derivedMainCards={derivedMainCards}
                derivedGroups={derivedGroups}
                onRemovePattern={onRemovePattern}
                onPatternCategoryChange={onPatternCategoryChange}
                onPatternNameChange={onPatternNameChange}
                onPatternMatchModeChange={onPatternMatchModeChange}
                onPatternMinimumMatchesChange={onPatternMinimumMatchesChange}
                onPatternAllowSharedCardsChange={onPatternAllowSharedCardsChange}
                onAddRequirement={onAddRequirement}
                onRemoveRequirement={onRemoveRequirement}
                onAddRequirementCard={onAddRequirementCard}
                onRemoveRequirementCard={onRemoveRequirementCard}
                onRequirementKindChange={onRequirementKindChange}
                onRequirementDistinctChange={onRequirementDistinctChange}
                onRequirementCountChange={onRequirementCountChange}
                onRequirementSourceChange={onRequirementSourceChange}
                onRequirementGroupChange={onRequirementGroupChange}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface PatternCardProps extends Omit<PatternEditorProps, 'patterns' | 'onAddPattern'> {
  pattern: HandPattern
  isOpen: boolean
  isPendingCreation: boolean
  onToggleOpen: (patternId: string) => void
  onCancelPendingPattern: (patternId: string) => void
}

function PatternCard({
  pattern,
  isOpen,
  isPendingCreation,
  onToggleOpen,
  onCancelPendingPattern,
  derivedMainCards,
  derivedGroups,
  onRemovePattern,
  onPatternNameChange,
  onPatternMatchModeChange,
  onPatternMinimumMatchesChange,
  onPatternAllowSharedCardsChange,
  onAddRequirement,
  onRemoveRequirement,
  onAddRequirementCard,
  onRemoveRequirementCard,
  onRequirementKindChange,
  onRequirementDistinctChange,
  onRequirementCountChange,
  onRequirementSourceChange,
  onRequirementGroupChange,
}: PatternCardProps) {
  const conditionCount = pattern.requirements.length
  const categorySingular = getPatternCategorySingular(pattern.category)
  const isOpening = normalizeHandPatternCategory(pattern.category) === 'good'
  const categoryTitle = isOpening ? 'Apertura' : 'Problema'
  const trimmedName = pattern.name.trim()
  const displayName = trimmedName || (isOpening ? 'Nueva apertura' : 'Nuevo problema')
  const includeRequirementCount = pattern.requirements.filter((requirement) => requirement.kind === 'include').length
  const namePlaceholder = isOpening ? 'Escribí el nombre de la apertura' : 'Escribí el nombre del problema'
  const removePatternClass =
    'shrink-0 border-0 bg-transparent p-0 text-[1rem] leading-none text-[var(--text-soft)] transition duration-150 hover:scale-110 hover:text-[#d04a57]'
  const canUseMinimumParts = conditionCount > 1
  const minimumPartsValue = Math.max(2, Math.min(pattern.minimumMatches, Math.max(conditionCount, 2)))

  const handleSummaryToggle = () => {
    if (!trimmedName) {
      return
    }

    onToggleOpen(pattern.id)
  }

  const handleNameChange = (value: string) => {
    const shouldOpenAfterNaming = !trimmedName && value.trim().length > 0

    onPatternNameChange(pattern.id, value)

    if (shouldOpenAfterNaming && !isOpen) {
      onToggleOpen(pattern.id)
    }
  }

  return (
    <details
      open={isOpen}
      className={[
        'details-toggle grid gap-2',
        isOpening
          ? 'surface-panel-soft border border-[rgba(69,211,111,0.48)] shadow-[0_0_0_1px_rgba(69,211,111,0.12),0_0_24px_rgba(69,211,111,0.08)]'
          : 'surface-panel-soft border border-[rgba(139,13,24,0.48)] shadow-[0_0_0_1px_rgba(139,13,24,0.12),0_0_24px_rgba(139,13,24,0.08)]',
      ].join(' ')}
    >
      <summary
        className="flex cursor-pointer items-center justify-between gap-3 px-2.5 py-2.5"
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
              <strong className="truncate text-[0.9rem] text-[var(--text-main)]">{displayName}</strong>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
                <span className="app-muted text-[0.76rem]">
                  {formatInteger(conditionCount)} parte{conditionCount === 1 ? '' : 's'}
                </span>
              </div>
            </>
          ) : (
            <div
              className="grid gap-1"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <strong className="text-[0.9rem] text-[var(--text-main)]">{displayName}</strong>
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
                className="app-field min-w-[260px] max-w-[420px] px-2 py-[0.45rem] text-[0.84rem] max-[760px]:min-w-0"
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className={removePatternClass}
          aria-label={`Quitar ${displayName}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemovePattern(pattern.id)
          }}
        >
          ×
        </button>
      </summary>

        <div className="grid gap-2 border-t border-[var(--border-subtle)] px-2.5 py-2.5">
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
              <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">
                {isOpening ? 'Esta apertura aparece si...' : 'Este problema aparece si...'}
              </span>
              <select
                value={pattern.matchMode}
                onChange={(event) => onPatternMatchModeChange(pattern.id, event.target.value as PatternMatchMode)}
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="all">Se cumple con todo esto</option>
                <option value="any">Se cumple con cualquiera de estas partes</option>
                {canUseMinimumParts ? (
                  <option value="at-least">
                    Se cumple con al menos {formatInteger(minimumPartsValue)} de estas partes
                  </option>
                ) : null}
              </select>
            </label>
          ) : null}

          <div />
        </div>

        {pattern.matchMode === 'at-least' && conditionCount > 2 ? (
          <label className="grid max-w-[180px] gap-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Partes que deben cumplirse</span>
            <input
              type="number"
              min={2}
              max={Math.max(pattern.requirements.length, 1)}
              value={pattern.minimumMatches}
              onChange={(event) => onPatternMinimumMatchesChange(pattern.id, event.target.value)}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            />
          </label>
        ) : null}

        <p className="app-muted m-0 text-[0.76rem] leading-[1.16]">{buildPatternMatchExplanation(pattern)}</p>

        {includeRequirementCount > 1 ? (
          <div className="surface-panel-soft grid gap-1.5 p-2">
            <p className="app-muted m-0 text-[0.68rem] uppercase tracking-[0.08em]">
              Si una carta entra en dos grupos...
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={[
                  'app-button px-2 py-1 text-[0.78rem]',
                  pattern.allowSharedCards ? 'app-button-primary text-white' : '',
                ].join(' ')}
                onClick={() => onPatternAllowSharedCardsChange(pattern.id, true)}
              >
                Sí, la misma carta sirve
              </button>
              <button
                type="button"
                className={[
                  'app-button px-2 py-1 text-[0.78rem]',
                  pattern.allowSharedCards ? '' : 'app-button-primary text-white',
                ].join(' ')}
                onClick={() => onPatternAllowSharedCardsChange(pattern.id, false)}
              >
                No, hace falta otra
              </button>
            </div>
            <p className="app-soft m-0 text-[0.74rem] leading-[1.16]">
              Esto solo cambia esta apertura o este problema.
            </p>
          </div>
        ) : null}

        <div className="grid gap-2">
          {pattern.requirements.length === 0 ? (
            <p className="surface-card p-2 text-[0.76rem] text-[var(--text-muted)]">
              Esta {categorySingular} todavía no tiene partes.
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
                  onRemoveRequirement={onRemoveRequirement}
                  onAddRequirementCard={onAddRequirementCard}
                  onRemoveRequirementCard={onRemoveRequirementCard}
                  onRequirementKindChange={onRequirementKindChange}
                  onRequirementDistinctChange={onRequirementDistinctChange}
                  onRequirementCountChange={onRequirementCountChange}
                  onRequirementSourceChange={onRequirementSourceChange}
                  onRequirementGroupChange={onRequirementGroupChange}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            className="app-button px-2 py-1 text-[0.8rem]"
            onClick={() => onAddRequirement(pattern.id)}
          >
            Agregar otra parte
          </button>
        </div>
      </div>
    </details>
  )
}

interface RequirementRowProps {
  index: number
  patternId: string
  requirement: PatternRequirement
  derivedMainCards: CardEntry[]
  derivedGroups: DerivedDeckGroup[]
  onRemoveRequirement: (patternId: string, requirementId: string) => void
  onAddRequirementCard: (patternId: string, requirementId: string, cardId: string) => void
  onRemoveRequirementCard: (patternId: string, requirementId: string, cardId: string) => void
  onRequirementKindChange: (patternId: string, requirementId: string, value: RequirementKind) => void
  onRequirementDistinctChange: (patternId: string, requirementId: string, value: boolean) => void
  onRequirementCountChange: (patternId: string, requirementId: string, value: string) => void
  onRequirementSourceChange: (patternId: string, requirementId: string, value: RequirementSource) => void
  onRequirementGroupChange: (patternId: string, requirementId: string, value: CardGroupKey | null) => void
}

function RequirementRow({
  index,
  patternId,
  requirement,
  derivedMainCards,
  derivedGroups,
  onRemoveRequirement,
  onAddRequirementCard,
  onRemoveRequirementCard,
  onRequirementKindChange,
  onRequirementDistinctChange,
  onRequirementCountChange,
  onRequirementSourceChange,
  onRequirementGroupChange,
}: RequirementRowProps) {
  const [nextCardId, setNextCardId] = useState('')
  const availableCards = derivedMainCards.filter((card) => !requirement.cardIds.includes(card.id))
  const availableGroups = derivedGroups.filter((group) => group.copies > 0 || group.key === requirement.groupKey)
  const selectedCards = requirement.cardIds
    .map((cardId) => derivedMainCards.find((card) => card.id === cardId))
    .filter((card): card is CardEntry => Boolean(card))
  const selectedGroup =
    requirement.source === 'group' && requirement.groupKey
      ? derivedGroups.find((group) => group.key === requirement.groupKey) ?? null
      : null
  const selectorLabel = requirement.source === 'group' ? 'Grupo' : 'Cartas'
  const showsDistinctToggle = requirement.count > 1

  return (
    <article tabIndex={0} className="condition-card surface-card grid gap-2 p-2 outline-none">
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-1">
          <strong className="text-[0.78rem] text-[#f0f0f0]">Parte {index + 1}</strong>
          <p className="app-muted m-0 text-[0.76rem] leading-[1.16]">
            {buildRequirementSummary(requirement, selectedCards, selectedGroup)}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 border-0 bg-transparent p-0 text-[1rem] leading-none text-[var(--text-soft)] transition duration-150 hover:scale-110 hover:text-[#d04a57]"
          aria-label={`Borrar parte ${index + 1}`}
          onClick={() => onRemoveRequirement(patternId, requirement.id)}
        >
          ×
        </button>
      </div>

      <div className="grid gap-2 min-[960px]:grid-cols-[220px_72px_124px_minmax(0,1fr)] min-[960px]:items-end">
        <label className="grid w-full gap-1 min-[960px]:max-w-[220px]">
          <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">En la mano estas cartas...</span>
          <select
            value={requirement.kind}
            onChange={(event) => onRequirementKindChange(patternId, requirement.id, event.target.value as RequirementKind)}
            className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
          >
            <option value="include">Tienen que aparecer</option>
            <option value="exclude">No tienen que aparecer</option>
          </select>
        </label>

        <label className="grid w-full gap-1 min-[960px]:max-w-[72px]">
          <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">
            Cantidad
          </span>
          <input
            type="number"
            min={1}
            value={requirement.count}
            onChange={(event) => onRequirementCountChange(patternId, requirement.id, event.target.value)}
            className="app-field w-full px-2 py-[0.45rem] text-center text-[0.84rem]"
          />
        </label>

        <label className="grid w-full gap-1 min-[960px]:max-w-[124px]">
          <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Buscar en</span>
          <select
            value={requirement.source}
            onChange={(event) => onRequirementSourceChange(patternId, requirement.id, event.target.value as RequirementSource)}
            className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
          >
            <option value="group">Grupo</option>
            <option value="cards">Cartas</option>
          </select>
        </label>

        <label className="grid w-full gap-1">
          <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">{selectorLabel}</span>
          {requirement.source === 'group' ? (
            <select
              value={requirement.groupKey ?? ''}
              onChange={(event) =>
                onRequirementGroupChange(patternId, requirement.id, (event.target.value || null) as CardGroupKey | null)
              }
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="">Elegir grupo</option>
              {availableGroups.map((group) => (
                <option key={group.key} value={group.key}>
                  {group.label} · {formatInteger(group.copies)}x
                </option>
              ))}
            </select>
          ) : (
            <select
              value={nextCardId}
              onChange={(event) => {
                const { value } = event.target
                setNextCardId(value)

                if (!value) {
                  return
                }

                onAddRequirementCard(patternId, requirement.id, value)
                setNextCardId('')
              }}
              className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
            >
              <option value="">Elegir carta</option>
              {availableCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} · {formatInteger(card.copies)}x
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      {requirement.source === 'group' ? (
        !selectedGroup || selectedGroup.copies === 0 ? (
          <p className="surface-card-accent m-0 px-2 py-1.5 text-[0.78rem] text-[#f2d077]">
            Este grupo todavía está vacío. Volvé al paso 2 y marcá roles para llenarlo.
          </p>
        ) : null
      ) : selectedCards.length === 0 ? (
        <p className="surface-card m-0 px-2 py-1.5 text-[0.78rem] text-[#ff9e9e]">
          Todavía no elegiste cartas para esta condición.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selectedCards.map((card) => (
            <span
              key={card.id}
              className="app-chip inline-flex items-center gap-1.5 px-2 py-1 text-[0.76rem]"
            >
              {card.name}
              <button
                type="button"
                className="text-[0.72rem] text-[var(--text-soft)] transition-colors hover:text-white"
                onClick={() => onRemoveRequirementCard(patternId, requirement.id, card.id)}
              >
                Quitar
              </button>
            </span>
          ))}
        </div>
      )}

      {showsDistinctToggle ? (
        <div className="grid gap-2 min-[960px]:items-end min-[960px]:grid-cols-[auto]">
          <div className="grid gap-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Si robás copias repetidas...</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={[
                  'app-button px-2 py-1 text-[0.78rem]',
                  requirement.distinct ? '' : 'app-button-primary text-white',
                ].join(' ')}
                onClick={() => onRequirementDistinctChange(patternId, requirement.id, false)}
              >
                Contarlas por separado
              </button>
              <button
                type="button"
                className={[
                  'app-button px-2 py-1 text-[0.78rem]',
                  requirement.distinct ? 'app-button-primary text-white' : '',
                ].join(' ')}
                onClick={() => onRequirementDistinctChange(patternId, requirement.id, true)}
              >
                Contarlas como 1 nombre
              </button>
            </div>
          </div>

          <span className="app-soft text-[0.74rem] leading-[1.16]">
            {requirement.distinct
              ? 'Dos copias iguales cuentan como un solo nombre.'
              : 'Dos copias iguales cuentan como dos cartas.'}
          </span>
        </div>
      ) : null}


    </article>
  )
}
