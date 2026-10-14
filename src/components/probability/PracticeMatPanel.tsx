import { memo, useEffect, useRef, useState } from 'react'

import type { SavedCombo } from '../../app/saved-combos'
import { formatDay, t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Segmented } from '../ui/Segmented'
import { ConfirmDialog } from './ConfirmDialog'
import { SaveComboDialog } from './MatDialogs'

type PanelTab = 'steps' | 'combos'

/** Una jugada de la lista: la frase que la cuenta, si es un cambio de fase (hace de separador) y las miniaturas de las cartas que mueve. */
export interface PanelStep {
  label: string
  divider: boolean
  cards: Array<{ name: string; art: string }>
}

interface PracticeMatPanelProps {
  steps: PanelStep[]
  /** Hasta qué jugada se ve (0 = mano inicial). */
  cursor: number
  onSeek: (step: number) => void
  combos: SavedCombo[]
  deckName: string
  onLoad: (combo: SavedCombo) => void
  onRename: (combo: SavedCombo, name: string) => void
  onDelete: (combo: SavedCombo) => void
  /** Sin la pestaña de combos guardados (en un duelo, donde no se guardan combos). */
  showCombos?: boolean
  className?: string
}


/** Panel lateral de la mesa: las jugadas de esta partida (se toca una para volver a ese paso) y los combos guardados. */
export const PracticeMatPanel = memo(function PracticeMatPanel({ steps, cursor, onSeek, combos, deckName, onLoad, onRename, onDelete, showCombos = true, className }: PracticeMatPanelProps) {
  const [tab, setTab] = useState<PanelTab>('steps')

  return (
    <div className={cx('flex min-h-0 flex-col gap-3', className)}>
      {showCombos ? (
        <Segmented
          value={tab}
          onChange={setTab}
          label={t('practice.panel.label')}
          size="sm"
          fullWidth
          options={[
            { value: 'steps', label: t('practice.panel.steps'), count: steps.length },
            { value: 'combos', label: t('practice.panel.combos'), count: combos.length },
          ]}
        />
      ) : null}

      {tab === 'steps' || !showCombos ? (
        steps.length === 0 ? (
          <EmptyState icon="hand" title={t('practice.panel.noPlays')}>
            {t('practice.panel.noPlaysHint')}
          </EmptyState>
        ) : (
          // La última jugada arriba, como un registro; la mano inicial al final.
          <ol className="m-0 grid list-none content-start gap-1 overflow-y-auto p-0" aria-label={t('practice.panel.plays')}>
            {steps
              .map((step, index) => (
                <li key={index}>
                  <StepButton active={cursor === index + 1} past={index + 1 < cursor} step={step} index={index + 1} onClick={() => onSeek(index + 1)} />
                </li>
              ))
              .reverse()}
            <li>
              <StepButton active={cursor === 0} step={{ label: t('practice.mat.startingHand'), divider: false, cards: [] }} index={0} onClick={() => onSeek(0)} />
            </li>
          </ol>
        )
      ) : (
        <SavedCombosList combos={combos} deckName={deckName} onLoad={onLoad} onRename={onRename} onDelete={onDelete} />
      )}
    </div>
  )
})

interface SavedCombosListProps {
  combos: SavedCombo[]
  /** Deck actual: sus combos van primero. */
  deckName: string
  onLoad: (combo: SavedCombo) => void
  onRename: (combo: SavedCombo, name: string) => void
  onDelete: (combo: SavedCombo) => void
}

/** Los combos guardados en este dispositivo: cargar uno lo reproduce en la mesa, el lápiz le cambia el nombre y borrar pide confirmación. */
function SavedCombosList({ combos, deckName, onLoad, onRename, onDelete }: SavedCombosListProps) {
  const [renaming, setRenaming] = useState<SavedCombo | null>(null)
  const [deleting, setDeleting] = useState<SavedCombo | null>(null)
  const ordered = [...combos].sort(
    (a, b) => Number(b.deckName === deckName) - Number(a.deckName === deckName) || a.deckName.localeCompare(b.deckName, 'es') || b.savedAt.localeCompare(a.savedAt),
  )

  if (ordered.length === 0) {
    return (
      <EmptyState icon="save" title={t('practice.panel.noCombos')}>
        {t('practice.panel.noCombosHint')}
      </EmptyState>
    )
  }

  return (
    <>
      <ul className="m-0 grid list-none content-start gap-2 overflow-y-auto p-0" aria-label={t('practice.panel.saved')}>
        {ordered.map((combo) => (
          <li key={combo.id} className="grid gap-2 rounded-card border border-border-subtle bg-card-background px-3 py-2">
            {/* El nombre y los datos arriba, con todo el ancho (con tres botones al lado el nombre quedaba en unas quince letras); las acciones, abajo. */}
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-body font-semibold text-foreground" title={combo.name}>
                {combo.name}
              </strong>
              <span className="truncate text-micro text-muted">
                {t('practice.panel.comboMeta', { deck: combo.deckName, plays: t('practice.panel.comboPlays', { count: combo.actions.length }), date: formatDay(combo.savedAt) })}
              </span>
            </div>
            <div className="flex items-center justify-end gap-1">
              <Button variant="secondary" size="sm" icon="play" aria-label={t('practice.panel.loadNamed', { name: combo.name })} onClick={() => onLoad(combo)}>
                {t('practice.panel.load')}
              </Button>
              <IconButton tone="ghost" size="sm" aria-label={t('practice.panel.renameNamed', { name: combo.name })} title={t('practice.panel.rename')} onClick={() => setRenaming(combo)}>
                <Icon name="pencil" />
              </IconButton>
              <IconButton tone="ghost" size="sm" aria-label={t('practice.panel.deleteNamed', { name: combo.name })} title={t('common.delete')} onClick={() => setDeleting(combo)}>
                <Icon name="trash" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      {/* Una instancia por combo: el campo arranca con el nombre del combo que se toca. */}
      <SaveComboDialog
        key={renaming?.id ?? 'closed'}
        rename
        isOpen={renaming !== null}
        defaultName={renaming?.name ?? ''}
        onSave={(name) => {
          if (renaming) {
            onRename(renaming, name)
          }

          setRenaming(null)
        }}
        onClose={() => setRenaming(null)}
      />

      <ConfirmDialog
        isOpen={deleting !== null}
        title={deleting ? t('practice.panel.deleteTitle', { name: deleting.name }) : ''}
        description={t('practice.panel.deleteBody')}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
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

function StepButton({ active, past = false, step, index, onClick }: { active: boolean; past?: boolean; step: PanelStep; index: number; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null)

  // El paso actual se mantiene a la vista mientras un combo se reproduce solo.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  return (
    <button
      ref={ref}
      type="button"
      aria-current={active ? 'step' : undefined}
      data-divider={step.divider ? 'true' : 'false'}
      className={cx(
        'grid w-full grid-cols-[1.5rem_2.5rem_minmax(0,1fr)] items-center gap-2 rounded-control px-2 py-1.5 text-left text-body transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus',
        // El cambio de fase separa las jugadas de cada fase: es la frase de siempre, en versalitas y de otro color.
        'data-[divider=true]:text-micro data-[divider=true]:font-bold data-[divider=true]:uppercase data-[divider=true]:tracking-wide',
        active ? 'bg-primary text-primary-foreground shadow-brand' : past ? 'text-foreground hover:bg-tint/10 data-[divider=true]:text-accent' : 'text-muted hover:bg-tint/10 data-[divider=true]:text-accent/80',
      )}
      onClick={onClick}
    >
      <span className="text-micro font-semibold tabular-nums opacity-70">{index}</span>
      {/* Las cartas de la jugada (hasta tres, una sobre otra). La columna mide siempre lo mismo, con o sin cartas: el texto queda alineado. */}
      <span className="relative h-9" aria-hidden="true">
        {step.cards.map((card, position) => (
          <span key={position} className="absolute top-0 h-9 w-6 overflow-hidden rounded-[3px] bg-input shadow-[0_0_0_1px_rgb(0_0_0/0.4)]" style={{ left: `${position * 0.5}rem`, zIndex: position }}>
            <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
          </span>
        ))}
      </span>
      <span>{step.label}</span>
    </button>
  )
}
