import { useRef } from 'react'
import { createPortal } from 'react-dom'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { usePresence } from '../../app/use-presence'
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

/** El estado a la derecha de un paso del deck: «Listo · 40» en verde, «23 sin confirmar», «Estás acá». Siempre texto blanco (el verde es el oscuro de los rellenos: el blanco sobre el claro no se lee). */
function Pill({ label, ok = false }: { label: string; ok?: boolean }) {
  return <span className={cx('ml-auto inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-micro font-semibold text-white', ok ? 'bg-success-solid' : 'bg-nav-raised')}>{label}</span>
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
 * Una entrada de primer nivel en grande (Solo | Online, como el SOLO/ONLINE de Master Duel): el ícono en un círculo violeta, el nombre y su línea. La abierta, con el borde ámbar.
 * Dos por fila: van juntas, arriba de las filas de la hoja (`sheetCards`).
 */
function SheetCard({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: (key: string) => void }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={navItemDescription(item)}
      className={cx(
        'grid min-h-28 min-w-0 content-start justify-items-start gap-2 rounded-card border bg-nav-raised/40 p-3 text-left transition-colors duration-150 hover:bg-nav-raised/70 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
        active ? 'border-nav-active' : 'border-nav-raised',
      )}
      onClick={() => onSelect(item.key)}
    >
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-primary text-white">
        <Icon name={item.icon} size={16} />
      </span>
      <span aria-hidden="true" className="grid min-w-0 gap-0.5">
        <span className={cx('text-lead font-bold leading-tight', active ? 'text-nav-active' : 'text-foreground')}>{item.label}</span>
        {item.blurb ? <span className="text-micro text-muted">{item.blurb}</span> : null}
      </span>
    </button>
  )
}

/**
 * La hoja que sube desde la barra de abajo del celular al tocar un grupo, **como la prolongación de la barra** (Gastón, 2026-10-19: «no continúan la barra sino que se separa y la oscurece con una sombra»):
 * el mismo índigo y sin la línea que las separaba, sin velo ni sombra (lo de arriba se ve igual; tocarlo cierra la hoja). La barra queda a la vista y a mano: tocar otro grupo
 * cambia de hoja y tocar el mismo la cierra. La hoja mide lo que mide su contenido (cada grupo es un submenú con sus propias filas) y, si no entra, se desplaza. Los pasos del deck llevan su ícono y su estado a la derecha; el duelo, las herramientas y
 * Descubrir, el nombre con una línea que explica y, en Jugar, Solo y Online en dos tarjetas grandes arriba (`SheetCard`) y el aviso de una sala en pausa para volver a ella. Elegir una abre su pantalla y cierra la hoja
 * (también el velo y Escape). El destino abierto va en ámbar, como en el menú lateral.
 */
export function GroupSheet({ group, activeKey, onSelect, onClose }: GroupSheetProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // En escritorio la hoja no existe (está el menú lateral): abierta y oculta bloquearía el scroll sin que se vea nada.
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const isOpen = group !== null && !desktop

  useEscapeKey(onClose, isOpen)
  useBodyScrollLock(isOpen)

  const status = group?.sheet === 'status'
  const rows = (group?.sheetItems ?? group?.items ?? []).filter((item) => !item.hidden)
  const notice = group?.sheetNotice
  const cards = group?.sheetCards ?? []

  // Al cerrarse baja por detrás de la barra, por donde subió (`usePresence`).
  return usePresence(isOpen, group && !desktop && typeof document !== 'undefined' ? createPortal(
    // Sólo en celular y tableta: si la ventana se ensancha con la hoja abierta, el menú lateral toma su lugar. La hoja sigue por **debajo** de la barra de abajo (que con la hoja abierta se pone arriba de ella): así no hay un borde
    // que pegar —en un teléfono real, con píxeles fraccionarios, un borde contra otro dejaba una línea fina por donde se veía la pantalla de atrás—.
    // Al cerrarse la barra vuelve en el acto a su lugar de siempre (z-40): mientras la hoja sale (`data-leaving`) se pone debajo de ella, así baja por detrás de la barra.
    <div ref={rootRef} className="fixed inset-0 z-150 data-leaving:z-39 min-[1101px]:hidden">
      <div aria-hidden="true" className="absolute inset-0" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={group.label}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 grid max-h-full animate-sheet-up gap-1 overflow-y-auto overscroll-contain rounded-t-panel border-t border-nav-raised bg-nav px-4 pb-[calc(4rem+env(safe-area-inset-bottom,0px)+0.875rem)] pt-2.5 outline-none motion-reduce:animate-none"
      >
        <span aria-hidden="true" className="mx-auto mb-1.5 block h-1 w-9 rounded-full bg-nav-raised" />
        {notice ? (
          <div className="mb-1.5 flex items-center gap-2.5 rounded-card bg-nav-raised px-3 py-2.5" role="status">
            <span className="grid min-w-0 flex-1 text-body leading-tight">
              <strong className="font-semibold text-foreground">{notice.title}</strong>
              <span className="text-muted">{notice.text}</span>
            </span>
            <Button variant="primary" size="md" className="shrink-0" onClick={() => onSelect(notice.actionKey)}>
              {notice.actionLabel}
            </Button>
          </div>
        ) : (
          <span className={cx(NAV_OVERLINE, 'px-1 pb-1.5')}>{group.label}</span>
        )}
        {cards.length > 0 ? (
          <div className="mb-1.5 grid grid-cols-2 gap-2">
            {cards.map((item) => (
              <SheetCard key={item.key} item={item} active={item.key === activeKey} onSelect={onSelect} />
            ))}
          </div>
        ) : null}
        <ul className="stagger m-0 grid list-none p-0 [--stagger-step:40ms]">
          {rows.map((item, index) => (
            <li key={item.key} className={cx('min-w-0', index > 0 && 'border-t border-nav-raised/60')}>
              <SheetRow item={item} status={status} active={item.key === activeKey} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  ) : null, () => [rootRef.current])
}
