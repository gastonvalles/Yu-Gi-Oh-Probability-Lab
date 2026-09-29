import { createPortal } from 'react-dom'

import { useEscapeKey } from '../../app/use-overlay'
import type { CardEntry, HandPattern } from '../../types'
import { Button } from '../ui/Button'
import { DraftImpactSummary } from './DraftImpactSummary'
import { CloseButton } from '../ui/IconButton'
import type { PatternEditorActions } from './pattern-editor-actions'
import type { DraftImpact } from './use-draft-impact'
import { RuleBuilder } from './rule-builder'

type DrawerMode = 'custom-create' | 'edit'

interface PatternEditorDrawerProps {
  actions: PatternEditorActions
  canSave: boolean
  impact: DraftImpact | null
  derivedMainCards: CardEntry[]
  drawerMode: DrawerMode | null
  isPendingCreation?: boolean
  onClose: () => void
  onRequestDelete: (patternId: string) => void
  onSave: () => void
  pattern: HandPattern | null
}

/**
 * Editor lateral de reglas propias. Edita un borrador: el Lab sólo recalcula al guardar.
 */
export function PatternEditorDrawer({
  actions,
  canSave,
  impact,
  derivedMainCards,
  drawerMode,
  isPendingCreation = false,
  onClose,
  onRequestDelete,
  onSave,
  pattern,
}: PatternEditorDrawerProps) {
  const isOpen = drawerMode !== null

  useEscapeKey(onClose, isOpen)

  if (!isOpen) {
    return null
  }

  const isCreating = drawerMode === 'custom-create'
  const title = pattern?.name.trim() || (isCreating ? 'Nueva regla' : 'Editar regla')

  const drawer = (
    <div className="pattern-editor-drawer-root fixed z-150">
      <button
        type="button"
        aria-label="Cerrar editor"
        className="pattern-editor-drawer-backdrop absolute inset-0 h-full w-full bg-[rgb(var(--background-rgb)/0.76)]"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-label={title}
        className="surface-panel pattern-editor-drawer-panel absolute right-0 top-0 grid w-full max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 border-l border-(--border-subtle) p-0 shadow-[-28px_0_54px_rgba(0,0,0,0.38)]"
      >
        <header className="grid gap-2 border-b border-(--border-subtle) px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="m-0 truncate text-[1.05rem] leading-tight text-(--text-main)">{title}</h3>
              <p className="app-kicker m-[0.2rem_0_0] text-[0.68rem] uppercase tracking-widest">Regla propia</p>
            </div>
            <CloseButton size="sm" aria-label="Cerrar editor" onClick={onClose} />
          </div>

          {pattern ? <DraftImpactSummary impact={impact} kind={pattern.kind} /> : null}
        </header>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          {pattern ? (
            <RuleBuilder
              actions={actions}
              derivedMainCards={derivedMainCards}
              isPendingCreation={isPendingCreation}
              pattern={pattern}
            />
          ) : (
            <p className="surface-card m-0 px-3 py-3 text-[0.8rem] text-(--text-muted)">Preparando el editor…</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-(--border-subtle) px-4 py-3">
          {pattern && !isPendingCreation ? (
            <Button
              variant="tertiary"
              size="sm"
              className="text-destructive hover:bg-[rgb(var(--danger-rgb)/0.1)]"
              onClick={() => onRequestDelete(pattern.id)}
            >
              Eliminar regla
            </Button>
          ) : (
            <span className="app-muted text-[0.74rem]">El análisis se actualiza al guardar.</span>
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" disabled={!canSave} onClick={onSave}>
              {isPendingCreation ? 'Crear regla' : 'Guardar cambios'}
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  )

  if (typeof document === 'undefined') {
    return drawer
  }

  return createPortal(drawer, document.body)
}
