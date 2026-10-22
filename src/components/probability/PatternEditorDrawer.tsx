import { useRef } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import type { CardEntry, HandPattern } from '../../types'
import { Heading } from '../ui/Heading'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
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
  /** Pie del editor al crear: qué falta para poder guardar, o qué pasa al guardar. */
  hint?: string
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
  hint = t('builder.drawer.hint'),
  onClose,
  onRequestDelete,
  onSave,
  pattern,
}: PatternEditorDrawerProps) {
  const isOpen = drawerMode !== null
  const rootRef = useRef<HTMLDivElement>(null)
  const asideRef = useRef<HTMLElement>(null)

  useEscapeKey(onClose, isOpen)
  useBodyScrollLock(isOpen)
  useFocusTrap(asideRef, isOpen)

  const isCreating = drawerMode === 'custom-create'
  const title = pattern?.name.trim() || t(isCreating ? 'builder.drawer.titleNew' : 'builder.drawer.titleEdit')

  const drawer = (
    <div ref={rootRef} className="fixed inset-0 isolate z-150">
      <button
        type="button"
        aria-label={t('builder.drawer.close')}
        className="absolute inset-0 h-full w-full animate-nav-scrim bg-background/80 motion-reduce:animate-none"
        onClick={onClose}
      />

      <aside
        ref={asideRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute right-0 top-0 grid h-full max-h-full w-full max-w-[min(48rem,100vw)] animate-drawer-enter outline-none min-[1101px]:w-[clamp(34rem,42vw,48rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-l border-border-subtle bg-card-background p-0 shadow-overlay motion-reduce:animate-none"
      >
        <header className="grid gap-3 border-b border-border-subtle px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <Heading level="section" as="h3" className="min-w-0 truncate">
              {title}
            </Heading>
            <CloseButton size="sm" aria-label={t('builder.drawer.close')} onClick={onClose} />
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
            <p className="m-0 px-1 py-3 text-body text-muted">{t('builder.drawer.preparing')}</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-3">
          {pattern && !isPendingCreation ? (
            // En el celular queda solo el ícono: así Cancelar y Guardar entran siempre en la fila.
            <Button variant="tertiary" color="danger" size="sm" icon="trash" aria-label={t('builder.drawer.delete')} className="px-3 min-[520px]:px-4" onClick={() => onRequestDelete(pattern.id)}>
              <span className="max-[520px]:sr-only">{t('builder.drawer.delete')}</span>
            </Button>
          ) : (
            <span className={cx('hidden text-micro min-[520px]:block', canSave ? 'text-muted' : 'text-warning-soft')}>{hint}</span>
          )}
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 min-[520px]:flex min-[520px]:flex-none">
            <Button variant="tertiary" size="sm" fullWidth className="min-w-0 px-3 min-[520px]:w-auto min-[520px]:px-4" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" size="sm" fullWidth disabled={!canSave} className="min-w-0 px-3 text-center min-[520px]:w-auto min-[520px]:px-4" onClick={onSave}>
              {saveLabel ?? t(isPendingCreation ? 'builder.drawer.create' : 'builder.drawer.saveChanges')}
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  )

  // Al cerrarse sale por donde entró (`usePresence`): el panel se corre a la derecha y se funde, y el velo también.
  return usePresence(isOpen, isOpen ? (typeof document === 'undefined' ? drawer : createPortal(drawer, document.body)) : null, () => [rootRef.current])
}
