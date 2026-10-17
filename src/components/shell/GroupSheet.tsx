import { useRef } from 'react'
import { createPortal } from 'react-dom'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { navItemDescription, type NavGroup, type NavItem } from './nav-model'
import { NAV_OVERLINE } from './rail'

interface GroupSheetProps {
  /** El grupo abierto; null: la hoja está cerrada. */
  group: NavGroup | null
  activeKey: string | null
  onSelect: (key: string) => void
  onClose: () => void
}

/** El estado a la derecha de un paso del deck: «Listo · 40» en verde, «23 sin confirmar», «Estás acá». */
function Pill({ label, ok = false }: { label: string; ok?: boolean }) {
  return <span className={cx('ml-auto inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-micro font-semibold', ok ? 'bg-success text-background' : 'bg-surface-raised text-muted')}>{label}</span>
}

function SheetRow({ item, status, active, onSelect }: { item: NavItem; status: boolean; active: boolean; onSelect: (key: string) => void }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={navItemDescription(item)}
      className={cx(
        'flex w-full min-w-0 items-center gap-3 px-1 text-left transition-colors duration-150 hover:text-nav-active focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
        status ? 'h-14' : 'min-h-15 py-1.5',
        active ? 'text-nav-active' : 'text-foreground',
      )}
      onClick={() => onSelect(item.key)}
    >
      {/* Los pasos del deck llevan su ícono y su estado; las demás hojas, el nombre con una línea que explica. */}
      {status ? <Icon name={item.icon} size={22} className="shrink-0" /> : null}
      <span aria-hidden="true" className="grid min-w-0 flex-1">
        <span className={cx('truncate text-body', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
        {!status && item.blurb ? <span className="text-micro font-normal text-muted">{item.blurb}</span> : null}
      </span>
      {status ? active ? <Pill label={t('shell.sheet.here')} /> : item.pill ? <Pill label={item.pill.label} ok={item.pill.ok} /> : null : null}
    </button>
  )
}

/**
 * La hoja que sube desde la barra de abajo del celular al tocar un grupo, como en el lienzo: se apoya sobre la barra (que queda a la vista y a mano: tocar otro grupo
 * cambia de hoja y tocar el mismo la cierra) y el velo cubre sólo lo de arriba. Los pasos del deck llevan su ícono y su estado a la derecha; el duelo, las herramientas y
 * Descubrir, el nombre con una línea que explica y, en el duelo, el aviso de una sala en pausa para volver a ella. Elegir una abre su pantalla y cierra la hoja
 * (también el velo y Escape). El destino abierto va en ámbar, como en el menú lateral.
 */
export function GroupSheet({ group, activeKey, onSelect, onClose }: GroupSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  // En escritorio la hoja no existe (está el menú lateral): abierta y oculta bloquearía el scroll sin que se vea nada.
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const isOpen = group !== null && !desktop

  useEscapeKey(onClose, isOpen)
  useBodyScrollLock(isOpen)

  if (!group || desktop || typeof document === 'undefined') {
    return null
  }

  const status = group.sheet === 'status'
  const rows = group.sheetItems ?? group.items
  const notice = group.sheetNotice

  return createPortal(
    // Sólo en celular y tableta: si la ventana se ensancha con la hoja abierta, el menú lateral toma su lugar. Termina arriba de la barra de abajo (4 rem), que no se tapa.
    <div className="fixed inset-x-0 top-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-150 min-[1101px]:hidden">
      <div aria-hidden="true" className="absolute inset-0 animate-nav-scrim bg-background/55 motion-reduce:animate-none" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={group.label}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 grid animate-sheet-up gap-1 rounded-t-panel border-t border-border bg-card-background px-4 pb-3.5 pt-2.5 shadow-overlay outline-none motion-reduce:animate-none"
      >
        <span aria-hidden="true" className="mx-auto mb-1.5 block h-1 w-9 rounded-full bg-border" />
        {notice ? (
          <div className="mb-1.5 flex items-center gap-2.5 rounded-card bg-surface-hover px-3 py-2.5" role="status">
            <span className="grid min-w-0 flex-1 text-body leading-tight">
              <strong className="font-semibold text-foreground">{notice.title}</strong>
              <span className="text-muted">{notice.text}</span>
            </span>
            <Button variant="primary" size="md" className="shrink-0" onClick={() => onSelect(notice.actionKey)}>
              {notice.actionLabel}
            </Button>
          </div>
        ) : !notice && group.key !== 'duel' ? (
          <span className={cx(NAV_OVERLINE, 'px-1 pb-1.5')}>{group.label}</span>
        ) : null}
        <ul className="m-0 grid list-none p-0">
          {rows.map((item, index) => (
            <li key={item.key} className={cx('min-w-0', index > 0 && 'border-t border-border-subtle')}>
              <SheetRow item={item} status={status} active={item.key === activeKey} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
