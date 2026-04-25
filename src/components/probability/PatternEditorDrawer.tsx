import { useMemo } from 'react'

import type { PatternPreset, PatternPresetCategory } from '../../app/pattern-presets'
import { AUTO_BASE_PRESET_IDS } from '../../app/pattern-presets'
import { getPatternDefinitionKey } from '../../app/patterns'
import { formatInteger, formatPercent } from '../../app/utils'
import type { CardEntry, HandPattern } from '../../types'
import { Button } from '../ui/Button'
import { CloseButton } from '../ui/IconButton'
import type { PatternEditorActions } from './pattern-editor-actions'
import { RuleBuilder } from './rule-builder'

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
  onSwitchPattern?: (newPatternId: string) => void
  pattern: HandPattern | null
  patterns: HandPattern[]
  probability: number | null
}

const PRESET_CATEGORY_LABELS: Record<PatternPresetCategory, string> = {
  consistency: 'Consistencia',
  interaction: 'Interacción',
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
  onSwitchPattern,
  pattern,
  patterns,
  probability,
}: PatternEditorDrawerProps) {
  const isOpen = drawerMode !== null
  const activePatternIdByDefinitionKey = useMemo(
    () => new Map(patterns.map((entry) => [getPatternDefinitionKey(entry), entry.id])),
    [patterns],
  )

  if (!isOpen) {
    return null
  }

  const isQuickAdd = drawerMode === 'quick-add'
  const isWaitingForPendingPattern = drawerMode === 'custom-create' && isPendingCreation && !pattern
  const groupedPresets = groupPresetsForDrawer(availablePresets)
  const drawerTitle =
    drawerMode === 'quick-add'
      ? 'Agregar regla recomendada'
      : drawerMode === 'custom-create'
        ? 'Crear regla propia'
        : pattern?.name.trim() || 'Editar regla'
  const drawerSubtitle =
    drawerMode === 'quick-add'
      ? 'Activá o quitá reglas recomendadas desde la misma lista.'
      : drawerMode === 'custom-create'
        ? 'Empezá por nombre, tipo y una condición. El resto puede ajustarse después.'
        : 'Editá la regla sin perder de vista su impacto en el resultado.'

  return (
    <div className="fixed inset-0 z-150">
      <button
        type="button"
        aria-label="Cerrar editor"
        className="absolute inset-0 h-full w-full bg-[rgb(var(--background-rgb)/0.76)]"
        onClick={onClose}
      />

      <aside className="surface-panel absolute right-0 top-0 grid h-dvh w-full max-w-3xl grid-rows-[auto_minmax(0,1fr)] gap-0 border-l border-(--border-subtle) p-0 shadow-[-28px_0_54px_rgba(0,0,0,0.38)]">
        <div className="grid gap-2 border-b border-(--border-subtle) px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">
                {isQuickAdd ? 'Agregar regla' : 'Editor de regla'}
              </p>
              <h3 className="m-[0.18rem_0_0] text-[1.05rem] leading-none text-(--text-main)">{drawerTitle}</h3>
              <p className="app-muted m-[0.35rem_0_0] max-w-[48ch] text-[0.78rem] leading-[1.16]">
                {drawerSubtitle}
              </p>
            </div>

            <CloseButton size="sm" aria-label="Cerrar editor" onClick={onClose} />
          </div>

          {isQuickAdd ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.76rem] leading-[1.16] text-(--text-muted)">
                Empezá por una regla disponible y dejá lo avanzado para después.
              </span>
              <Button variant="secondary" size="sm" onClick={onCreateCustom}>
                Crear uno propio
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {currentImpactLabel ? (
                <span className="surface-card px-2 py-1 text-[0.72rem] text-(--text-main)">
                  <small className="app-muted mr-1 text-[0.65rem]">Impacto actual</small>
                  {currentImpactLabel}
                </span>
              ) : null}
              {feedbackLabel ? (
                <span className="surface-panel-soft px-2 py-1 text-[0.72rem] text-(--text-muted)">
                  <small className="app-muted mr-1 text-[0.65rem]">Último cambio</small>
                  {feedbackLabel}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          {isQuickAdd ? (
            <div className="grid gap-4">
              {groupedPresets.map(({ category, presets }, categoryIndex) => (
                <section
                  key={category}
                  className={[
                    'grid gap-2.5',
                    categoryIndex > 0 ? 'border-t border-(--border-subtle) pt-4' : '',
                  ].join(' ').trim()}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="grid gap-0.5">
                      <small className="app-muted text-[0.68rem] uppercase tracking-widest">
                        {PRESET_CATEGORY_LABELS[category]}
                      </small>
                      <strong className="text-[0.92rem] text-(--text-main)">Reglas del grupo</strong>
                    </div>
                    <span className="text-[0.72rem] uppercase tracking-widest text-(--text-soft)">
                      {formatCountLabel(presets.length, 'regla')}
                    </span>
                  </div>

                  <div className="grid gap-2">
                    {presets.map((preset) => {
                      const activePatternId = activePatternIdByDefinitionKey.get(getPatternDefinitionKey(preset.pattern)) ?? null
                      const isActive = activePatternId !== null
                      const isLocked = (AUTO_BASE_PRESET_IDS as readonly string[]).includes(preset.id)

                      return (
                        <article
                          key={preset.id}
                          className="surface-card grid gap-2 px-3 py-3 min-[860px]:grid-cols-[minmax(0,1fr)_auto] min-[860px]:items-start"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <strong className="block text-[0.88rem] text-(--text-main)">{preset.title}</strong>
                              <span className="text-[0.68rem] uppercase tracking-wide text-(--text-soft)">
                                {preset.kind === 'opening' ? 'Salida' : 'Problema'}
                              </span>
                              {isLocked ? (
                                <span className="text-[0.68rem] uppercase tracking-wide text-(--text-muted)">
                                  Siempre activo
                                </span>
                              ) : isActive ? (
                                <span className="text-[0.68rem] uppercase tracking-wide text-accent">
                                  Activo
                                </span>
                              ) : null}
                            </div>
                            <p className="app-muted m-[0.32rem_0_0] text-[0.76rem] leading-[1.2]">
                              {preset.description}
                            </p>
                          </div>

                          {isLocked ? null : (
                            <div className="flex items-start">
                              <Button
                                variant={isActive ? 'tertiary' : 'primary'}
                                size="sm"
                                onClick={() => {
                                  if (activePatternId) {
                                    actions.removePattern(activePatternId)
                                    return
                                  }

                                  onSelectPreset(preset)
                                }}
                              >
                                {isActive ? 'Quitar' : 'Agregar'}
                              </Button>
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : pattern ? (
            <RuleBuilder
              actions={actions}
              derivedMainCards={derivedMainCards}
              isPendingCreation={isPendingCreation}
              onRequestDelete={onRequestDelete}
              onSwitchPattern={onSwitchPattern}
              pattern={pattern}
              probability={probability}
            />
          ) : isWaitingForPendingPattern ? (
            <p className="surface-card m-0 px-3 py-3 text-[0.8rem] text-(--text-muted)">
              Preparando el editor de la nueva regla...
            </p>
          ) : (
            <p className="surface-card m-0 px-3 py-3 text-[0.8rem] text-(--text-muted)">
              No hay una regla seleccionada para editar.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

function groupPresetsForDrawer(
  availablePresets: PatternPreset[],
): Array<{
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

    if (presets.length === 0) {
      return []
    }

    return [{ category, presets }]
  })
}

function formatCountLabel(count: number, noun: string): string {
  return `${formatInteger(count)} ${noun}${count === 1 ? '' : 's'}`
}

export function formatDrawerImpactLabel(probability: number | null, kind: 'opening' | 'problem'): string | null {
  if (probability === null) {
    return null
  }

  if (probability <= 0) {
    return kind === 'opening'
      ? 'No esta sosteniendo manos limpias con el deck actual'
      : 'No esta apareciendo como problema con el deck actual'
  }

  return kind === 'opening'
    ? `Aparece en ${formatPercent(probability)} de manos`
    : `Introduce problema en ${formatPercent(probability)} de manos`
}
