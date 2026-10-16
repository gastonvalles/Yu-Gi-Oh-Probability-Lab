import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { CloseButton } from '../ui/IconButton'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { SiteCredit, SocialLinks } from '../ui/SocialLinks'
import { AppBrand } from './AppBrand'
import { BackupActions } from './BackupActions'
import type { NavGroup } from './nav-model'
import { NAV_OVERLINE } from './rail'
import { SidebarNav } from './SidebarNav'

/** El menú de destinos dentro del cajón: sólo cuando la pantalla no lleva barra de abajo (la mesa a pantalla completa) y la hamburguesa es la única salida. */
interface DrawerNav {
  groups: NavGroup[]
  activeKey: string | null
  onSelect: (key: string) => void
}

interface DrawerPanelProps {
  onClose: () => void
  nav?: DrawerNav
  className?: string
}

/** Lo de adentro del cajón de ajustes: la marca con su X, (sin barra de abajo) los destinos, el idioma, la copia de seguridad y lo legal (autoría, redes y privacidad). */
export function DrawerPanel({ onClose, nav, className }: DrawerPanelProps) {
  const id = useId()

  return (
    <div className={cx('flex h-full min-h-0 flex-col border-r border-nav-raised bg-nav shadow-overlay', className)}>
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 pl-5 pr-3 pt-[env(safe-area-inset-top,0px)]">
        <AppBrand />
        <CloseButton aria-label={t('shell.nav.close')} data-initial-focus="" onClick={onClose} />
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3">
        {nav ? (
          <SidebarNav
            groups={nav.groups}
            activeKey={nav.activeKey}
            onSelect={(key) => {
              nav.onSelect(key)
              onClose()
            }}
            className="-mx-2"
          />
        ) : null}
        <section aria-labelledby={`${id}-language`} className="grid gap-2">
          <h2 id={`${id}-language`} className={cx(NAV_OVERLINE, 'm-0')}>
            {t('shell.settings.language')}
          </h2>
          <div className="flex">
            <LanguageSwitcher />
          </div>
        </section>
        <section aria-labelledby={`${id}-backup`} className="grid gap-2">
          <h2 id={`${id}-backup`} className={cx(NAV_OVERLINE, 'm-0')}>
            {t('deck.backup.title')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <BackupActions />
          </div>
        </section>
        <section aria-labelledby={`${id}-about`} className="grid gap-2 border-t border-nav-raised pt-4">
          <h2 id={`${id}-about`} className={cx(NAV_OVERLINE, 'm-0')}>
            {t('shell.settings.about')}
          </h2>
          <SocialLinks className="-ml-2" />
          <a href={t('shell.legal.page')} target="_blank" rel="noreferrer" className="w-fit rounded-control text-body text-muted underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:shadow-focus">
            {t('shell.legal.label')}
          </a>
          <SiteCredit withDisclaimer />
        </section>
      </div>
    </div>
  )
}

interface NavDrawerProps {
  isOpen: boolean
  onClose: () => void
  nav?: DrawerNav
}

/** El cajón de ajustes del celular: sale desde la izquierda sobre un velo; se cierra con la X, el velo y Escape. */
export function NavDrawer({ isOpen, onClose, nav }: NavDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  // En escritorio el cajón no existe: abierto y oculto atraparía el foco y bloquearía el scroll.
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const active = isOpen && !desktop

  useFocusTrap(panelRef, active)
  useEscapeKey(onClose, active)
  useBodyScrollLock(active)

  if (!active || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    // Sólo en celular y tableta: si la ventana se ensancha con el cajón abierto, el menú lateral toma su lugar.
    <div className="fixed inset-0 z-150 min-[1101px]:hidden">
      <div aria-hidden="true" className="absolute inset-0 animate-nav-scrim bg-background/70 backdrop-blur-[2px] motion-reduce:animate-none" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t('shell.settings.title')} tabIndex={-1} className="relative h-full w-[min(20rem,86vw)] animate-nav-drawer outline-none motion-reduce:animate-none">
        <DrawerPanel onClose={onClose} nav={nav} />
      </div>
    </div>,
    document.body,
  )
}
