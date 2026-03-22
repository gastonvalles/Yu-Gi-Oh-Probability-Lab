import { useEffect, useMemo, useState } from 'react'

import { normalizeHandPatternCategory } from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { DerivedDeckGroup } from '../../app/deck-groups'
import type { CardEntry, HandPattern, HandPatternCategory } from '../../types'
import { Button } from '../ui/Button'
import { PatternCard } from './PatternCard'
import type { PatternEditorActions } from './pattern-editor-actions'

interface PatternEditorProps {
  patterns: HandPattern[]
  derivedMainCards: CardEntry[]
  derivedGroups: DerivedDeckGroup[]
  actions: PatternEditorActions
}

export function PatternEditor({
  patterns,
  derivedMainCards,
  derivedGroups,
  actions,
}: PatternEditorProps) {
  const [activeCategory, setActiveCategory] = useState<HandPatternCategory>('good')
  const [openPatternId, setOpenPatternId] = useState<string | null>(null)
  const [pendingPatternIds, setPendingPatternIds] = useState<Set<string>>(() => new Set())
  const isOpeningView = activeCategory === 'good'
  const mainDeckCount = useMemo(
    () => derivedMainCards.reduce((total, card) => total + card.copies, 0),
    [derivedMainCards],
  )
  const classifiedCardCount = useMemo(
    () => derivedMainCards.filter((card) => card.roles.length > 0).length,
    [derivedMainCards],
  )
  const unclassifiedCardCount = Math.max(0, derivedMainCards.length - classifiedCardCount)
  const hasCompletedRoleStep =
    derivedMainCards.length > 0 && classifiedCardCount === derivedMainCards.length
  const openingCount = useMemo(
    () => patterns.filter((pattern) => normalizeHandPatternCategory(pattern.category) === 'good').length,
    [patterns],
  )
  const problemCount = useMemo(
    () => patterns.filter((pattern) => normalizeHandPatternCategory(pattern.category) === 'bad').length,
    [patterns],
  )
  const visiblePatterns = useMemo(
    () => patterns.filter((pattern) => normalizeHandPatternCategory(pattern.category) === activeCategory),
    [activeCategory, patterns],
  )
  const sectionEmptyMessage =
    mainDeckCount === 0
      ? 'Primero cargá cartas en el Main Deck. Después vas a poder definir aperturas y problemas acá.'
      : !hasCompletedRoleStep
        ? `Terminá de marcar roles en el paso 2. Te faltan ${formatInteger(unclassifiedCardCount)} carta${unclassifiedCardCount === 1 ? '' : 's'} sin rol y ahí aparecen los chequeos sugeridos.`
        : isOpeningView
          ? 'Todavía no cargaste aperturas. Agregá una para marcar qué mano sí querés ver al robar.'
          : 'Todavía no cargaste problemas. Agregá uno para marcar qué mano no querés ver al robar.'
  const helperMessage =
    mainDeckCount === 0
      ? 'Empezá en el paso 1 armando el deck. El editor se activa de verdad cuando ya hay Main Deck.'
      : !hasCompletedRoleStep
        ? 'Cuando todas las cartas del Main Deck tengan rol, aparecen aperturas y problemas sugeridos automáticamente.'
        : 'Para cartas condicionales, armá varias condiciones en una misma apertura.'

  const handleCategoryChange = (category: HandPatternCategory) => {
    setActiveCategory(category)
    setOpenPatternId(null)
  }

  useEffect(() => {
    setPendingPatternIds((current) => {
      const next = new Set<string>()

      for (const patternId of current) {
        const pattern = patterns.find((entry) => entry.id === patternId)

        if (pattern && pattern.name.trim().length === 0) {
          next.add(patternId)
        }
      }

      return next
    })
  }, [patterns])

  useEffect(() => {
    if (openPatternId && !patterns.some((pattern) => pattern.id === openPatternId)) {
      setOpenPatternId(null)
    }
  }, [openPatternId, patterns])

  const handlePatternToggle = (patternId: string) => {
    setOpenPatternId((current) => (current === patternId ? null : patternId))
  }

  const handleAddPattern = () => {
    const patternId = actions.addPattern(activeCategory)

    setPendingPatternIds((current) => new Set(current).add(patternId))
    setOpenPatternId(patternId)
  }

  const handleCancelPendingPattern = (patternId: string) => {
    setPendingPatternIds((current) => {
      const next = new Set(current)
      next.delete(patternId)
      return next
    })
    setOpenPatternId((current) => (current === patternId ? null : current))
    actions.removePattern(patternId)
  }

  return (
    <div className="grid min-h-0 content-start gap-2">
      <div className="mb-2.5 grid gap-2.5">
        <div className="flex items-start justify-between gap-2.5 max-[760px]:flex-col max-[760px]:items-stretch">
          <div>
            <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Editor</p>
            <h3 className="m-0 text-[0.98rem] leading-none">
              {isOpeningView ? 'Aperturas que querés ver' : 'Problemas que querés evitar'}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-[760px]:justify-start">
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
            <Button variant="primary" size="sm" onClick={handleAddPattern}>
              {activeCategory === 'good' ? 'Agregar apertura' : 'Agregar problema'}
            </Button>
          </div>
        </div>

        <div className="surface-card px-2.5 py-2">
          <p className="app-soft m-0 text-[0.74rem] leading-[1.16]">
            Editá solo lo que querés medir en esta vista.
            {' '}
            {visiblePatterns.length === 0
              ? mainDeckCount === 0
                ? 'Todavía no hay base cargada.'
                : !hasCompletedRoleStep
                  ? 'Todavía faltan roles por marcar.'
                  : 'Todavía no cargaste ninguna.'
              : `${formatInteger(visiblePatterns.length)} ${isOpeningView ? 'apertura' : 'problema'}${visiblePatterns.length === 1 ? '' : 's'} cargada${visiblePatterns.length === 1 ? '' : 's'}.`}
          </p>
          <p className="app-muted m-[0.4rem_0_0] text-[0.72rem] leading-[1.16]">
            {helperMessage}
          </p>
        </div>
      </div>

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
                isOpen={openPatternId === pattern.id}
                isPendingCreation={pendingPatternIds.has(pattern.id)}
                onToggleOpen={handlePatternToggle}
                onCancelPendingPattern={handleCancelPendingPattern}
                derivedMainCards={derivedMainCards}
                derivedGroups={derivedGroups}
                actions={actions}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
