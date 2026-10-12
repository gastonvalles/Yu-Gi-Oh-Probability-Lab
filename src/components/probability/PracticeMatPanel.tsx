import { useState } from 'react'

import type { SavedCombo } from '../../app/saved-combos'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Segmented } from '../ui/Segmented'
import { ConfirmDialog } from './ConfirmDialog'

type PanelTab = 'steps' | 'combos'

interface PracticeMatPanelProps {
  steps: string[]
  /** Hasta qué jugada se ve (0 = mano inicial). */
  cursor: number
  onSeek: (step: number) => void
  combos: SavedCombo[]
  deckName: string
  onLoad: (combo: SavedCombo) => void
  onDelete: (combo: SavedCombo) => void
  className?: string
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Panel lateral de la mesa: las jugadas de esta partida (se toca una para volver a ese paso) y los combos guardados. */
export function PracticeMatPanel({ steps, cursor, onSeek, combos, deckName, onLoad, onDelete, className }: PracticeMatPanelProps) {
  const [tab, setTab] = useState<PanelTab>('steps')

  return (
    <div className={cx('flex min-h-0 flex-col gap-3', className)}>
      <Segmented
        value={tab}
        onChange={setTab}
        label="Panel de la mesa"
        size="sm"
        fullWidth
        options={[
          { value: 'steps', label: 'Pasos', count: steps.length },
          { value: 'combos', label: 'Combos', count: combos.length },
        ]}
      />

      {tab === 'steps' ? (
        steps.length === 0 ? (
          <EmptyState icon="hand" title="Todavía no hay jugadas">
            Arrastrá una carta a una zona o tocala para ver qué podés hacer. Cada jugada queda anotada acá.
          </EmptyState>
        ) : (
          <ol className="m-0 grid list-none content-start gap-1 overflow-y-auto p-0" aria-label="Jugadas">
            <li>
              <StepButton active={cursor === 0} label="Mano inicial" index={0} onClick={() => onSeek(0)} />
            </li>
            {steps.map((label, index) => (
              <li key={index}>
                <StepButton active={cursor === index + 1} past={index + 1 < cursor} label={label} index={index + 1} onClick={() => onSeek(index + 1)} />
              </li>
            ))}
          </ol>
        )
      ) : (
        <SavedCombosList combos={combos} deckName={deckName} onLoad={onLoad} onDelete={onDelete} />
      )}
    </div>
  )
}

interface SavedCombosListProps {
  combos: SavedCombo[]
  /** Deck actual: sus combos van primero. */
  deckName: string
  onLoad: (combo: SavedCombo) => void
  onDelete: (combo: SavedCombo) => void
}

/** Los combos guardados en este dispositivo: cargar uno lo reproduce en la mesa; borrar pide confirmación. */
function SavedCombosList({ combos, deckName, onLoad, onDelete }: SavedCombosListProps) {
  const [deleting, setDeleting] = useState<SavedCombo | null>(null)
  const ordered = [...combos].sort(
    (a, b) => Number(b.deckName === deckName) - Number(a.deckName === deckName) || a.deckName.localeCompare(b.deckName, 'es') || b.savedAt.localeCompare(a.savedAt),
  )

  if (ordered.length === 0) {
    return (
      <EmptyState icon="save" title="No hay combos guardados">
        Jugá una línea en la mesa y tocá “Guardar combo”: después la reproducís paso a paso desde acá.
      </EmptyState>
    )
  }

  return (
    <>
      <ul className="m-0 grid list-none content-start gap-2 overflow-y-auto p-0" aria-label="Combos guardados">
        {ordered.map((combo) => (
          <li key={combo.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-card border border-border-subtle bg-card-background px-3 py-2">
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-body font-semibold text-foreground">{combo.name}</strong>
              <span className="truncate text-micro text-muted">
                {combo.deckName} · {combo.actions.length} {combo.actions.length === 1 ? 'jugada' : 'jugadas'} · {formatDate(combo.savedAt)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" icon="play" aria-label={`Cargar ${combo.name}`} onClick={() => onLoad(combo)}>
                Cargar
              </Button>
              <IconButton tone="ghost" size="sm" aria-label={`Borrar ${combo.name}`} title="Borrar" onClick={() => setDeleting(combo)}>
                <Icon name="trash" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        isOpen={deleting !== null}
        title={deleting ? `¿Borrar “${deleting.name}”?` : ''}
        description="El combo se borra de este dispositivo. No se puede deshacer."
        confirmLabel="Borrar"
        confirmColor="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            onDelete(deleting)
          }

          setDeleting(null)
        }}
      />
    </>
  )
}

function StepButton({ active, past = false, label, index, onClick }: { active: boolean; past?: boolean; label: string; index: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={active ? 'step' : undefined}
      className={cx(
        'grid w-full grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-2 rounded-control px-2 py-1.5 text-left text-body transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus',
        active ? 'bg-primary text-primary-foreground shadow-brand' : past ? 'text-foreground hover:bg-tint/10' : 'text-muted hover:bg-tint/10',
      )}
      onClick={onClick}
    >
      <span className="text-micro font-semibold tabular-nums opacity-70">{index}</span>
      <span>{label}</span>
    </button>
  )
}
