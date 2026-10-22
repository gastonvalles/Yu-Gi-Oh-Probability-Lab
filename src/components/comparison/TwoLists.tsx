import { useId, useState, type ReactNode } from 'react'

import type { DeckChanges } from '../../app/change-pairs'
import type { DeckCardInstance, DeckZone } from '../../app/model'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { overline } from '../ui/typography'
import { BuildDeckView } from './BuildDeckView'
import { zoneMarks, type SourceOption } from './build-sources'
import type { Side } from './comparison-rows'
import { SideBadge } from './SideBadge'

const ZONES = [
  { zone: 'main', label: 'meta.compare.zoneMain' },
  { zone: 'extra', label: 'meta.compare.zoneExtra' },
  { zone: 'side', label: 'meta.compare.zoneSide' },
] as const satisfies ReadonlyArray<{ zone: DeckZone; label: string }>

interface ZoneListsProps {
  zone: DeckZone
  label: (typeof ZONES)[number]['label']
  a: SourceOption
  b: SourceOption
  changes: DeckChanges
  onCardClick: (side: Side, card: DeckCardInstance) => void
}

/** Una zona de las dos listas, A a la izquierda y B a la derecha. Si es igual en las dos va plegada en su encabezado («igual en las dos»), a un toque. */
function ZoneLists({ zone, label, a, b, changes, onCardClick }: ZoneListsProps) {
  const info = changes.zones[zone]
  const [open, setOpen] = useState(!info.unchanged)
  const panelId = useId()
  const marks = zoneMarks(changes, zone)
  const size = info.sizeA === info.sizeB ? formatInteger(info.sizeA) : `${formatInteger(info.sizeA)} / ${formatInteger(info.sizeB)}`
  const title = (
    <>
      <span className={overline}>{t('meta.compare.lists.zone', { zone: t(label), size })}</span>
      <span className="text-micro text-muted">
        {info.unchanged ? t('meta.compare.lists.same') : t('meta.compare.lists.moves', { out: formatInteger(info.outCopies), in: formatInteger(info.inCopies) })}
      </span>
    </>
  )

  return (
    <section className="grid gap-2" aria-label={t(label)}>
      {info.unchanged ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-control border-0 bg-surface-raised px-3 text-left transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
        >
          {title}
          <Icon name="chevron-down" size={16} className={cx('ml-auto shrink-0 text-soft transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
        </button>
      ) : (
        <h3 className="m-0 flex items-baseline gap-2">{title}</h3>
      )}
      {open ? (
        <div id={panelId} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
          <div className="@container min-w-0">
            <BuildDeckView side="A" zone={zone} cards={a.zones[zone]} marks={marks.A} onCardClick={(card) => onCardClick('A', card)} />
          </div>
          <span aria-hidden="true" className="mt-1 grid size-7 place-items-center rounded-full bg-primary text-micro font-bold text-primary-foreground">
            VS
          </span>
          <div className="@container min-w-0">
            <BuildDeckView side="B" zone={zone} cards={b.zones[zone]} marks={marks.B} onCardClick={(card) => onCardClick('B', card)} />
          </div>
        </div>
      ) : null}
    </section>
  )
}

interface TwoListsProps {
  isOpen: boolean
  onClose: () => void
  a: SourceOption
  b: SourceOption
  changes: DeckChanges
  onCardClick: (side: Side, card: DeckCardInstance) => void
  /** Abajo, el número con la acción («▲6 de cada 100 con B · Cargar B en el builder»). */
  footer?: ReactNode
}

/** «Ver las dos listas»: las zonas a la par (A | VS | B), lo que cambia con aro y cantidad y lo igual plegado. A pantalla completa (menos el margen) en el celular y en escritorio: se ven las dos listas enteras de una. */
export function TwoLists({ isOpen, onClose, a, b, changes, onCardClick, footer }: TwoListsProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" title={t('meta.compare.lists.title')} footer={footer}>
      <div className="grid gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)] items-center gap-2">
          {([['A', a], ['B', b]] as const).map(([side, option], index) => (
            <span key={side} className={cx('flex min-w-0 items-center gap-2', index === 1 && 'col-start-3')}>
              <SideBadge side={side} size="sm" />
              <strong className="truncate text-body font-semibold text-foreground">
                <span className="sr-only">{t('meta.compare.build', { side })}: </span>
                {option.name}
              </strong>
            </span>
          ))}
        </div>
        {ZONES.filter(({ zone }) => zone === 'main' || a.zones[zone].length > 0 || b.zones[zone].length > 0).map(({ zone, label }) => (
          <ZoneLists key={zone} zone={zone} label={label} a={a} b={b} changes={changes} onCardClick={onCardClick} />
        ))}
        <p className="m-0 text-micro text-soft">{t('meta.compare.lists.note')}</p>
      </div>
    </Modal>
  )
}
