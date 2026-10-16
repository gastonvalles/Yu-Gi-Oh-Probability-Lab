import { useRef } from 'react'
import { createPortal } from 'react-dom'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CloseButton } from '../ui/IconButton'
import { navItemDescription, type NavGroup } from './nav-model'

interface GroupSheetProps {
  /** El grupo abierto; null: la hoja está cerrada. */
  group: NavGroup | null
  activeKey: string | null
  onSelect: (key: string) => void
  onClose: () => void
}

/**
 * La hoja que sube desde la barra de abajo del celular al tocar un grupo: las opciones del grupo, cada una con su ícono y una línea de ayuda.
 * Elegir una abre su pantalla y cierra la hoja (también la X, el velo y Escape). El destino abierto va en ámbar, como en el menú lateral.
 */
export function GroupSheet({ group, activeKey, onSelect, onClose }: GroupSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  // En escritorio la hoja no existe (está el menú lateral): abierta y oculta atraparía el foco y bloquearía el scroll sin que se vea nada.
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const isOpen = group !== null && !desktop

  useFocusTrap(panelRef, isOpen)
  useEscapeKey(onClose, isOpen)
  useBodyScrollLock(isOpen)

  if (!group || desktop || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    // Sólo en celular y tableta: si la ventana se ensancha con la hoja abierta, el menú lateral toma su lugar.
    <div className="fixed inset-0 z-150 min-[1101px]:hidden">
      <div aria-hidden="true" className="absolute inset-0 animate-nav-scrim bg-background/70 backdrop-blur-[2px] motion-reduce:animate-none" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={group.label}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 animate-sheet-up rounded-t-panel border-t border-nav-raised bg-nav pb-[env(safe-area-inset-bottom,0px)] shadow-overlay outline-none motion-reduce:animate-none"
      >
        <span aria-hidden="true" className="mx-auto mt-2.5 block h-1 w-9 rounded-full bg-nav-raised" />
        <div className="flex items-center justify-between pl-5 pr-2 pt-1">
          <h2 className="m-0 text-lead font-bold text-foreground">{group.label}</h2>
          <CloseButton aria-label={t('shell.sheet.close')} data-initial-focus="" onClick={onClose} />
        </div>
        <ul className="m-0 grid list-none gap-1 p-3 pb-4">
          {group.items.map((item) => {
            const active = item.key === activeKey

            return (
              <li key={item.key} className="min-w-0">
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  aria-label={navItemDescription(item)}
                  className={cx(
                    'flex min-h-14 w-full min-w-0 items-center gap-3 rounded-control px-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
                    active ? 'bg-nav-raised text-nav-active' : 'text-foreground hover:bg-nav-raised/60',
                  )}
                  onClick={() => onSelect(item.key)}
                >
                  <Icon name={item.icon} size={22} variant={active ? 'bold' : 'bulk'} className="shrink-0 [--icon-cut:var(--nav-raised)]" />
                  <span aria-hidden="true" className="grid min-w-0 flex-1">
                    <span className={cx('truncate text-body', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
                    {item.detail ? <span className={cx('truncate text-micro', active ? 'text-foreground' : 'text-muted')}>{item.detail}</span> : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
