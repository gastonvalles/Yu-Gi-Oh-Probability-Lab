import { createPortal } from 'react-dom'

import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
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
  /** Texto del botón de guardar si no es el de crear una regla nueva. */
  saveLabel?: string
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
  saveLabel,
  onClose,
  onRequestDelete,
  onSave,
  pattern,
}: PatternEditorDrawerProps) {
  const isOpen = drawerMode !== null

  useEscapeKey(onClose, isOpen)
  useBodyScrollLock(isOpen)

  if (!isOpen) {
    return null
  }

  const isCreating = drawerMode === 'custom-create'
  const title = pattern?.name.trim() || (isCreating ? 'Nueva regla' : 'Editar regla')

  const drawer = (
    <div className="fixed inset-0 isolate z-150 min-[1101px]:bottom-0 min-[1101px]:top-(--deck-mode-topbar-height) min-[1101px]:h-auto">
      <button
        type="button"
        aria-label="Cerrar editor"
        className="absolute inset-0 h-full w-full bg-background/80"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-label={title}
        className="absolute right-0 top-0 grid h-full max-h-full w-full max-w-[min(48rem,100vw)] animate-drawer-enter min-[1101px]:w-[clamp(34rem,42vw,48rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-l border-border-subtle bg-card-background p-0 shadow-overlay motion-reduce:animate-none"
      >
        <header className="grid gap-3 border-b border-border-subtle px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="m-0 min-w-0 truncate text-lead font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
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
            <p className="m-0 px-1 py-3 text-body text-muted">Preparando el editor…</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-3">
          {pattern && !isPendingCreation ? (
            // En el celular queda solo el ícono: así Cancelar y Guardar entran siempre en la fila.
            <Button variant="tertiary" color="danger" size="sm" icon="trash" aria-label="Eliminar regla" className="px-3 min-[520px]:px-4" onClick={() => onRequestDelete(pattern.id)}>
              <span className="max-[519px]:sr-only">Eliminar regla</span>
            </Button>
          ) : (
            <span className="text-muted hidden text-micro min-[520px]:block">El análisis se actualiza al guardar.</span>
          )}
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 min-[520px]:flex min-[520px]:flex-none">
            <Button variant="secondary" size="sm" fullWidth className="min-w-0 px-3 min-[520px]:w-auto min-[520px]:px-4" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" fullWidth disabled={!canSave} className="min-w-0 px-3 text-center min-[520px]:w-auto min-[520px]:px-4" onClick={onSave}>
              {saveLabel ?? (isPendingCreation ? 'Crear regla' : 'Guardar cambios')}
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
