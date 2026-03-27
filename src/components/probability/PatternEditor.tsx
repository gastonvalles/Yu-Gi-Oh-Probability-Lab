import { useEffect, useMemo, useState } from 'react'

import type { PatternPreset, PatternPresetCategory } from '../../app/pattern-presets'
import {
  getPatternDefinitionKey,
  normalizeHandPatternCategory,
} from '../../app/patterns'
import { countUnclassifiedCards, isClassificationStepComplete } from '../../app/role-step'
import { formatInteger } from '../../app/utils'
import type { CardEntry, HandPattern, HandPatternCategory } from '../../types'
import { Button } from '../ui/Button'
import { PatternCard } from './PatternCard'
import type { PatternEditorActions } from './pattern-editor-actions'

export type PatternEditorMode = 'simple' | 'advanced'

interface PatternEditorProps {
  patterns: HandPattern[]
  derivedMainCards: CardEntry[]
  actions: PatternEditorActions
  editorMode: PatternEditorMode
  onEditorModeChange: (mode: PatternEditorMode) => void
  availablePresets: PatternPreset[]
  selectedSimplePresetIds: string[]
  onToggleSimplePreset: (presetId: string) => void
  onOpenAdvancedEditor: () => void
  activePatternCount: number
}

const PRESET_CATEGORY_LABELS: Record<PatternPresetCategory, string> = {
  consistency: 'Consistencia',
  interaction: 'Interacción',
  problems: 'Problemas',
  advanced: 'Avanzados',
}

export function PatternEditor({
  patterns,
  derivedMainCards,
  actions,
  editorMode,
  onEditorModeChange,
  availablePresets,
  selectedSimplePresetIds,
  onToggleSimplePreset,
  onOpenAdvancedEditor,
  activePatternCount,
}: PatternEditorProps) {
  const [activeCategory, setActiveCategory] = useState<HandPatternCategory>('opening')
  const [openPatternId, setOpenPatternId] = useState<string | null>(null)
  const [pendingPatternIds, setPendingPatternIds] = useState<Set<string>>(() => new Set())
  const isOpeningView = activeCategory === 'opening'
  const mainDeckCount = useMemo(
    () => derivedMainCards.reduce((total, card) => total + card.copies, 0),
    [derivedMainCards],
  )
  const unclassifiedCardCount = useMemo(
    () => countUnclassifiedCards(derivedMainCards),
    [derivedMainCards],
  )
  const hasCompletedClassification = useMemo(
    () => isClassificationStepComplete(derivedMainCards),
    [derivedMainCards],
  )
  const openingCount = useMemo(
    () => patterns.filter((pattern) => normalizeHandPatternCategory(pattern.kind) === 'opening').length,
    [patterns],
  )
  const problemCount = useMemo(
    () => patterns.filter((pattern) => normalizeHandPatternCategory(pattern.kind) === 'problem').length,
    [patterns],
  )
  const visiblePatterns = useMemo(
    () => patterns.filter((pattern) => normalizeHandPatternCategory(pattern.kind) === activeCategory),
    [activeCategory, patterns],
  )
  const reviewPendingPatternCount = useMemo(
    () => patterns.filter((pattern) => pattern.needsReview).length,
    [patterns],
  )
  const presetGroups = useMemo(() => {
    const groups = new Map<PatternPresetCategory, PatternPreset[]>()

    for (const preset of availablePresets) {
      const currentEntries = groups.get(preset.category) ?? []
      groups.set(preset.category, [...currentEntries, preset])
    }

    return groups
  }, [availablePresets])
  const existingPatternKeys = useMemo(
    () => new Set(patterns.map((pattern) => getPatternDefinitionKey(pattern))),
    [patterns],
  )
  const selectedSimpleCount = selectedSimplePresetIds.filter((presetId) =>
    availablePresets.some((preset) => preset.id === presetId),
  ).length
  const sectionEmptyMessage =
    mainDeckCount === 0
      ? 'Primero cargá cartas en el Main Deck. Después vas a poder definir aperturas y problemas acá.'
      : !hasCompletedClassification
        ? `Terminá la categorización del paso 2. Te faltan ${formatInteger(unclassifiedCardCount)} carta${unclassifiedCardCount === 1 ? '' : 's'} sin cerrar o pendientes de revisión; después aparecen los chequeos sugeridos.`
        : isOpeningView
          ? 'Todavía no cargaste aperturas. Agregá una para marcar qué mano sí querés ver al robar.'
          : 'Todavía no cargaste problemas. Agregá uno para marcar qué mano no querés ver al robar.'
  const helperMessage =
    mainDeckCount === 0
      ? 'Empezá en el paso 1 armando el deck. El editor se activa de verdad cuando ya hay Main Deck.'
      : !hasCompletedClassification
        ? 'Cuando todas las cartas del Main Deck tengan origen, al menos un rol y no queden pendientes de revisión, aparecen presets y chequeos útiles automáticamente.'
        : reviewPendingPatternCount > 0
          ? `Tenés ${formatInteger(reviewPendingPatternCount)} patrón${reviewPendingPatternCount === 1 ? '' : 'es'} heredado${reviewPendingPatternCount === 1 ? '' : 's'} que necesitan revisión manual.`
          : editorMode === 'simple'
            ? 'Elegí qué querés medir y medí al instante.'
            : 'Editá reglas propias y abrí el detalle solo cuando haga falta.'

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

  const handleAddPreset = (preset: PatternPreset) => {
    actions.appendPattern(preset.pattern)
    setOpenPatternId(preset.pattern.id)
    setActiveCategory(preset.kind)
  }

  return (
    <div className="grid min-h-0 content-start gap-3">
      <div className="grid gap-2.5">
        <div className="flex items-start justify-between gap-2.5 max-[760px]:flex-col max-[760px]:items-stretch">
          <div>
            <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Editor</p>
            <h3 className="m-0 text-[1rem] leading-none">Chequeos del Probability Lab</h3>
            <p className="app-muted m-[0.35rem_0_0] max-w-[48ch] text-[0.78rem] leading-[1.18]">
              {helperMessage}
            </p>
          </div>

          <div className="app-tab-strip">
            <button
              type="button"
              className={['app-tab text-[0.8rem]', editorMode === 'simple' ? 'app-tab-active' : ''].join(' ')}
              onClick={() => onEditorModeChange('simple')}
            >
              Modo simple
            </button>
            <button
              type="button"
              className={['app-tab text-[0.8rem]', editorMode === 'advanced' ? 'app-tab-active' : ''].join(' ')}
              onClick={() => onEditorModeChange('advanced')}
            >
              Modo avanzado
            </button>
          </div>
        </div>

        <div className="surface-card px-2.5 py-2">
          <p className="app-soft m-0 text-[0.74rem] leading-[1.16]">
            {editorMode === 'simple'
              ? selectedSimpleCount > 0
                ? `Tenés ${formatInteger(selectedSimpleCount)} preset${selectedSimpleCount === 1 ? '' : 's'} simple${selectedSimpleCount === 1 ? '' : 's'} activo${selectedSimpleCount === 1 ? '' : 's'}.`
                : 'No hay presets simples activos. Podés encenderlos acá o seguir con reglas ya activas.'
              : visiblePatterns.length === 0
                ? mainDeckCount === 0
                  ? 'Todavía no hay base cargada.'
                  : !hasCompletedClassification
                    ? 'Todavía faltan clasificaciones por cerrar.'
                    : 'Todavía no cargaste ninguna regla en esta vista.'
                : `${formatInteger(visiblePatterns.length)} ${isOpeningView ? 'apertura' : 'problema'}${visiblePatterns.length === 1 ? '' : 's'} cargada${visiblePatterns.length === 1 ? '' : 's'} en esta pestaña.`}
          </p>
          <p className="app-muted m-[0.4rem_0_0] text-[0.72rem] leading-[1.16]">
            {editorMode === 'simple'
              ? `El cálculo, el KPI y la práctica leen siempre el mismo conjunto de ${formatInteger(activePatternCount)} pattern${activePatternCount === 1 ? '' : 's'} activo${activePatternCount === 1 ? '' : 's'}.`
              : `Editor avanzado: ${formatInteger(patterns.length)} pattern${patterns.length === 1 ? '' : 's'} total${patterns.length === 1 ? '' : 'es'} entre aperturas y problemas.`}
          </p>
        </div>
      </div>

      {editorMode === 'simple' ? (
        <SimplePatternEditor
          availablePresets={availablePresets}
          selectedSimplePresetIds={selectedSimplePresetIds}
          onToggleSimplePreset={onToggleSimplePreset}
          onOpenAdvancedEditor={onOpenAdvancedEditor}
          activePatternCount={activePatternCount}
        />
      ) : (
        <div className="grid min-h-0 gap-3">
          <div className="surface-panel-soft grid gap-2 p-2.5">
            <div className="flex items-start justify-between gap-2 max-[760px]:flex-col max-[760px]:items-stretch">
              <div className="grid gap-0.5">
                <span className="app-muted text-[0.68rem] uppercase tracking-widest">Presets matcher-based</span>
                <span className="app-soft text-[0.74rem] leading-[1.14]">
                  Elegí uno y después afiná el detalle.
                </span>
              </div>
              <div className="app-tab-strip">
                <button
                  type="button"
                  className={['app-tab text-[0.8rem]', activeCategory === 'opening' ? 'app-tab-active' : ''].join(' ')}
                  onClick={() => setActiveCategory('opening')}
                >
                  Aperturas {formatInteger(openingCount)}
                </button>
                <button
                  type="button"
                  className={['app-tab text-[0.8rem]', activeCategory === 'problem' ? 'app-tab-active' : ''].join(' ')}
                  onClick={() => setActiveCategory('problem')}
                >
                  Problemas {formatInteger(problemCount)}
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              {(['consistency', 'interaction', 'problems', 'advanced'] as const).map((category) => {
                const categoryPresets = (presetGroups.get(category) ?? []).filter((preset) => preset.kind === activeCategory)

                if (categoryPresets.length === 0) {
                  return null
                }

                return (
                  <div key={category} className="grid gap-1.5">
                    <small className="app-muted text-[0.68rem] uppercase tracking-widest">
                      {PRESET_CATEGORY_LABELS[category]}
                    </small>
                    <div className="grid gap-1.5">
                      {categoryPresets.map((preset) => {
                        const alreadyAdded = existingPatternKeys.has(getPatternDefinitionKey(preset.pattern))

                        return (
                          <article
                            key={preset.id}
                            className="surface-card grid gap-1.5 px-2.5 py-2 min-[860px]:grid-cols-[minmax(0,1fr)_auto]"
                          >
                            <div className="min-w-0">
                              <strong className="block text-[0.82rem] text-(--text-main)">{preset.title}</strong>
                              <p className="app-muted m-[0.26rem_0_0] truncate text-[0.74rem] leading-[1.15]">
                                {preset.description}
                              </p>
                            </div>
                            <Button
                              variant={alreadyAdded ? 'secondary' : 'primary'}
                              size="sm"
                              disabled={alreadyAdded}
                              onClick={() => handleAddPreset(preset)}
                            >
                              {alreadyAdded ? 'Ya agregado' : 'Agregar preset'}
                            </Button>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid gap-0.5">
              <strong className="text-[0.9rem] text-(--text-main)">
                {isOpeningView ? 'Aperturas que querés ver' : 'Problemas que querés evitar'}
              </strong>
              <span className="app-muted text-[0.72rem] leading-[1.12]">
                Tocá una card para editar el detalle.
              </span>
            </div>
            <Button variant="primary" size="sm" onClick={handleAddPattern}>
              {activeCategory === 'opening' ? 'Agregar apertura' : 'Agregar problema'}
            </Button>
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
                    actions={actions}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SimplePatternEditor({
  availablePresets,
  selectedSimplePresetIds,
  onToggleSimplePreset,
  onOpenAdvancedEditor,
  activePatternCount,
}: {
  availablePresets: PatternPreset[]
  selectedSimplePresetIds: string[]
  onToggleSimplePreset: (presetId: string) => void
  onOpenAdvancedEditor: () => void
  activePatternCount: number
}) {
  const simplePresets = availablePresets.filter((preset) => Boolean(preset.simpleLabel))

  return (
    <div className="grid gap-3">
      <div className="surface-panel-soft grid gap-2.5 p-2.5">
        <div className="grid gap-0.5">
          <span className="app-muted text-[0.68rem] uppercase tracking-widest">Qué querés medir</span>
          <h4 className="m-0 text-[0.94rem] leading-none text-(--text-main)">Chequeos rápidos</h4>
          <p className="app-muted m-[0.35rem_0_0] max-w-[52ch] text-[0.76rem] leading-[1.15]">
            Marcá lo que te importa y medí al instante.
          </p>
        </div>

        <div className="grid gap-2">
          {simplePresets.map((preset) => {
            const isSelected = selectedSimplePresetIds.includes(preset.id)

            return (
              <label
                key={preset.id}
                className={[
                  'surface-card grid cursor-pointer gap-1.5 px-2.5 py-2',
                  isSelected ? 'ring-1 ring-[rgb(var(--primary-rgb)/0.34)]' : '',
                ].join(' ')}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSimplePreset(preset.id)}
                    className="mt-[0.12rem] h-4 w-4 accent-[var(--primary)]"
                  />
                  <div className="min-w-0">
                    <strong className="block text-[0.84rem] text-(--text-main)">
                      {preset.simpleLabel}
                    </strong>
                    <p className="app-muted m-[0.24rem_0_0] truncate text-[0.74rem] leading-[1.15]">
                      {preset.description}
                    </p>
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        <div className="surface-card flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
          <div className="grid gap-0.5">
            <strong className="text-[0.8rem] text-(--text-main)">
              {formatInteger(activePatternCount)} pattern{activePatternCount === 1 ? '' : 's'} activo{activePatternCount === 1 ? '' : 's'}
            </strong>
            <span className="app-muted text-[0.72rem] leading-[1.12]">
              Estos presets editan el mismo conjunto activo que usa el editor avanzado.
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={onOpenAdvancedEditor}>
            Abrir editor avanzado
          </Button>
        </div>
      </div>
    </div>
  )
}
