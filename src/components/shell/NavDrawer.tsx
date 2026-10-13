import { useRef } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { CloseButton } from '../ui/IconButton'
import { AppBrand } from './AppBrand'
import { MenuTools } from './AppSidebar'
import type { NavGroup } from './nav-model'
import { SidebarNav } from './SidebarNav'

interface DrawerPanelProps {
  groups: NavGroup[]
  activeKey: string | null
  onSelect: (key: string) => void
  onClose: () => void
  className?: string
}

/** Lo de adentro del cajón del celular: la marca con su X, los destinos (los mismos del menú lateral) y abajo el idioma. */
export function DrawerPanel({ groups, activeKey, onSelect, onClose, className }: DrawerPanelProps) {
  return (
    <div className={cx('flex h-full min-h-0 flex-col border-r border-border-subtle bg-card-background shadow-overlay', className)}>
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 pl-5 pr-3 pt-[env(safe-area-inset-top,0px)]">
        <AppBrand />
        <CloseButton aria-label={t('shell.nav.close')} data-initial-focus="" onClick={onClose} />
      </div>
      <SidebarNav groups={groups} activeKey={activeKey} onSelect={onSelect} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" />
      <MenuTools className="shrink-0 border-t border-border-subtle p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]" />
    </div>
  )
}

interface NavDrawerProps extends Omit<DrawerPanelProps, 'className' | 'onSelect'> {
  isOpen: boolean
  onSelect: (key: string) => void
}

/** El cajón del celular: sale desde la izquierda sobre un velo; elegir un destino lo cierra, y también la X, el velo y Escape. */
export function NavDrawer({ isOpen, onClose, onSelect, groups, activeKey }: NavDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useFocusTrap(panelRef, isOpen)
  useEscapeKey(onClose, isOpen)
  useBodyScrollLock(isOpen)

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    // Sólo en celular y tableta: si la ventana se ensancha con el cajón abierto, el menú lateral toma su lugar.
    <div className="fixed inset-0 z-150 min-[1101px]:hidden">
      <div aria-hidden="true" className="absolute inset-0 animate-nav-scrim bg-background/70 backdrop-blur-[2px] motion-reduce:animate-none" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t('shell.nav.main')} tabIndex={-1} className="relative h-full w-[min(20rem,86vw)] animate-nav-drawer outline-none motion-reduce:animate-none">
        <DrawerPanel
          groups={groups}
          activeKey={activeKey}
          onClose={onClose}
          onSelect={(key) => {
            onSelect(key)
            onClose()
          }}
        />
      </div>
    </div>,
    document.body,
  )
}
