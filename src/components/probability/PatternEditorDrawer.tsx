import { useMemo } from 'react'

import type { PatternPreset, PatternPresetCategory } from '../../app/pattern-presets'
import { getPatternDefinitionKey } from '../../app/patterns'
import { formatPercent } from '../../app/utils'
import type { CardEntry, HandPattern } from '../../types'
import { Button } from '../ui/Button'
import type { PatternEditorActions } from './pattern-editor-actions'
import { PatternEditorForm } from './PatternEditorForm'

type DrawerMode = 'custom-create' | 'edit' | 'quick-add'

interface PatternEditorDrawerProps {
  actions: PatternEditorActions
  availablePresets: PatternPreset[]
  currentImpactLabel: string | null
  derivedMainCards: CardEntry[]
  drawerMode: DrawerMode | null
  feedbackLabel: string | null
  isPendingCreation?: boolean
  onClose: () => void
  onCreateCustom: () => void
  onRequestDelete: (patternId: string) => void
  onSelectPreset: (preset: PatternPreset) => void
  pattern: HandPattern | null
  patterns: HandPattern[]
}

const PRESET_CATEGORY_LABELS: Record<PatternPresetCategory, string> = {
  consistency: 'Consistencia',
  interaction: 'Interaccion',
  problems: 'Problemas',
  advanced: 'Ideas extra',
}

export function PatternEditorDrawer({
  actions,
  availablePresets,
  currentImpactLabel,
  derivedMainCards,
  drawerMode,
  feedbackLabel,
  isPendingCreation = false,
  onClose,
  onCreateCustom,
  onRequestDelete,
  onSelectPreset,
  pattern,
  patterns,
}: PatternEditorDrawerProps) {
  const isOpen = drawerMode !== null
  const activePatternKeys = useMemo(
    () => new Set(patterns.map((entry) => getPatternDefinitionKey(entry))),
    [patterns],
  )

  if (!isOpen) {
    return null
  }

  const isQuickAdd = drawerMode === 'quick-add'
  const groupedPresets = groupPresetsForDrawer(availablePresets)
  const drawerTitle =
    drawerMode === 'quick-add'
      ? 'Agregar chequeo recomendado'
      : drawerMode === 'custom-create'
        ? 'Crear chequeo propio'
        : pattern?.name.trim() || 'Editar chequeo'
  const drawerSubtitle =
    drawerMode === 'quick-add'
      ? 'Elegi un chequeo listo para sumar al analisis.'
      : drawerMode === 'custom-create'
        ? 'Defini el chequeo y mira el impacto mientras editas.'
        : 'Ajusta la regla sin perder de vista el resultado principal.'

  return (
    <div className="fixed inset-0 z-[150]">
      <button
        type="button"
        aria-label="Cerrar editor"
        className="absolute inset-0 h-full w-full bg-[rgb(var(--background-rgb)/0.68)]"
        onClick={onClose}
      />

      <aside className="surface-panel absolute right-0 top-0 grid h-[100dvh] w-full max-w-[72rem] grid-rows-[auto_minmax(0,1fr)] gap-0 border-l border-(--border-subtle) p-0 shadow-[-28px_0_54px_rgba(0,0,0,0.38)]">
        <div className="grid gap-2 border-b border-(--border-subtle) px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">
                {isQuickAdd ? 'Agregar chequeo' : 'Editor de chequeo'}
              </p>
              <h3 className="m-[0.18rem_0_0] text-[1.05rem] leading-none text-(--text-main)">{drawerTitle}</h3>
              <p className="app-muted m-[0.35rem_0_0] max-w-[48ch] text-[0.78rem] leading-[1.16]">
                {drawerSubtitle}
              </p>
            </div>

            <button
              type="button"
              className="app-icon-button text-[1rem] leading-none"
              aria-label="Cerrar editor"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          {!isQuickAdd ? (
            <div className="flex flex-wrap items-center gap-2">
              {currentImpactLabel ? (
                <span className="surface-card px-2 py-1 text-[0.72rem] text-(--text-main)">
                  {currentImpactLabel}
                </span>
              ) : null}
              {feedbackLabel ? (
                <span className="surface-panel-soft px-2 py-1 text-[0.72rem] text-(--text-muted)">
                  {feedbackLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          {isQuickAdd ? (
            <div className="grid gap-4">
              <section className="surface-card grid gap-2.5 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <small className="app-muted text-[0.68rem] uppercase tracking-widest">Chequeos recomendados</small>
                    <strong className="text-[0.92rem] text-(--text-main)">Suma una regla lista para medir</strong>
                  </div>
                  <Button variant="secondary" size="sm" onClick={onCreateCustom}>
                    Crear uno propio
                  </Button>
                </div>

                {groupedPresets.map(({ category, presets }) => (
                  <div key={category} className="grid gap-1.5">
                    <small className="app-muted text-[0.68rem] uppercase tracking-widest">
                      {PRESET_CATEGORY_LABELS[category]}
                    </small>
                    <div className="grid gap-1.5">
                      {presets.map((preset) => {
                        const isAlreadyActive = activePatternKeys.has(getPatternDefinitionKey(preset.pattern))

                        return (
                          <article
                            key={preset.id}
                            className="surface-panel-soft grid gap-2 px-3 py-3 min-[860px]:grid-cols-[minmax(0,1fr)_auto]"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <strong className="block text-[0.84rem] text-(--text-main)">{preset.title}</strong>
                                {preset.recommended ? (
                                  <span className="surface-card px-1.5 py-0.5 text-[0.65rem] text-(--text-muted)">
                                    Recomendado
                                  </span>
                                ) : null}
                              </div>
                              <p className="app-muted m-[0.28rem_0_0] text-[0.75rem] leading-[1.14]">
                                {preset.description}
                              </p>
                              <p className="app-soft m-[0.34rem_0_0] text-[0.72rem] leading-[1.14]">
                                {preset.kind === 'opening'
                                  ? `Cuando aparece, suma jugabilidad.`
                                  : 'Cuando aparece, introduce riesgo en el resultado.'}
                              </p>
                            </div>

                            <div className="flex items-start">
                              <Button
                                variant={isAlreadyActive ? 'secondary' : 'primary'}
                                size="sm"
                                disabled={isAlreadyActive}
                                onClick={() => onSelectPreset(preset)}
                              >
                                {isAlreadyActive ? 'Ya activo' : 'Agregar'}
                              </Button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          ) : pattern ? (
            <PatternEditorForm
              actions={actions}
              derivedMainCards={derivedMainCards}
              isPendingCreation={isPendingCreation}
              onRequestDelete={onRequestDelete}
              pattern={pattern}
            />
          ) : (
            <p className="surface-card m-0 px-3 py-3 text-[0.8rem] text-(--text-muted)">
              No hay un chequeo seleccionado para editar.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

function groupPresetsForDrawer(availablePresets: PatternPreset[]): Array<{
  category: PatternPresetCategory
  presets: PatternPreset[]
}> {
  const categoryOrder: PatternPresetCategory[] = ['consistency', 'interaction', 'problems', 'advanced']

  return categoryOrder.flatMap((category) => {
    const presets = availablePresets
      .filter((preset) => preset.category === category)
      .sort((left, right) => {
        if (left.recommended !== right.recommended) {
          return left.recommended ? -1 : 1
        }

        return left.title.localeCompare(right.title)
      })

    return presets.length > 0 ? [{ category, presets }] : []
  })
}

export function formatDrawerImpactLabel(probability: number | null, kind: 'opening' | 'problem'): string | null {
  if (probability === null) {
    return null
  }

  if (probability <= 0) {
    return kind === 'opening'
      ? 'No esta sosteniendo manos limpias con el deck actual'
      : 'No esta apareciendo como riesgo con el deck actual'
  }

  return kind === 'opening'
    ? `Aparece en ${formatPercent(probability)} de manos`
    : `Introduce riesgo en ${formatPercent(probability)} de manos`
}
