import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { CloseButton } from '../ui/IconButton'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { SiteCredit, SocialLinks } from '../ui/SocialLinks'
import { AppBrand } from './AppBrand'
import { BackupActions } from './BackupActions'
import { mascotsNavItem, type NavGroup } from './nav-model'
import { NAV_OVERLINE } from './rail'
import { NavButton, SidebarNav } from './SidebarNav'
import { textLink } from '../ui/typography'

/** El menú de destinos dentro del cajón: los mismos cuatro grupos de la barra de abajo y del menú lateral. En la mesa a pantalla completa (sin barra) es la única salida. */
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

/**
 * Lo de adentro del cajón del menú: la marca con su X, los destinos, las mascotas, el idioma (Español | English, de 44 px), «Tus datos» (guardar y restaurar la copia de
 * seguridad) y, abajo, lo legal: las redes, la privacidad y la autoría con el aviso de sitio no oficial.
 */
export function DrawerPanel({ onClose, nav, className }: DrawerPanelProps) {
  const id = useId()

  return (
    <div className={cx('flex h-full min-h-0 flex-col border-r border-nav-raised bg-nav shadow-overlay', className)}>
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 pl-5 pr-3 pt-[env(safe-area-inset-top,0px)]">
        <AppBrand />
        <CloseButton aria-label={t('shell.nav.close')} data-initial-focus="" onClick={onClose} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3">
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
        {nav ? (
          <section aria-labelledby={`${id}-personalize`} className="grid gap-2">
            <h2 id={`${id}-personalize`} className={cx(NAV_OVERLINE, 'm-0')}>
              {t('shell.settings.personalize')}
            </h2>
            <div className="-mx-2">
              <NavButton
                item={mascotsNavItem()}
                active={false}
                onSelect={(key) => {
                  nav.onSelect(key)
                  onClose()
                }}
              />
            </div>
          </section>
        ) : null}
        <section aria-labelledby={`${id}-language`} className="grid gap-2">
          <h2 id={`${id}-language`} className={cx(NAV_OVERLINE, 'm-0')}>
            {t('shell.settings.language')}
          </h2>
          <LanguageSwitcher variant="segmented" />
        </section>
        <section aria-labelledby={`${id}-backup`} className="grid gap-2">
          <h2 id={`${id}-backup`} className={cx(NAV_OVERLINE, 'm-0')}>
            {t('shell.settings.data')}
          </h2>
          <div className="grid">
            <BackupActions variant="list" />
          </div>
        </section>
        {/* Lo legal va abajo del todo (el resto lo empuja con `mt-auto`). */}
        <div className="mt-auto grid gap-2">
          <SocialLinks size="lg" className="-ml-2" />
          <a href={t('shell.legal.page')} target="_blank" rel="noreferrer" className={cx('inline-flex min-h-11 w-fit items-center rounded-control text-body', textLink)}>
            {t('shell.legal.label')}
          </a>
          <SiteCredit withDisclaimer />
        </div>
      </div>
    </div>
  )
}

interface NavDrawerProps {
  isOpen: boolean
  onClose: () => void
  nav?: DrawerNav
}

/** El cajón del menú del celular (los destinos y los ajustes): sale desde la izquierda sobre un velo; se cierra con la X, el velo y Escape. */
export function NavDrawer({ isOpen, onClose, nav }: NavDrawerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // En escritorio el cajón no existe: abierto y oculto atraparía el foco y bloquearía el scroll.
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const active = isOpen && !desktop

  useFocusTrap(panelRef, active)
  useEscapeKey(onClose, active)
  useBodyScrollLock(active)

  // Al cerrarse vuelve a la izquierda y el velo se funde (`usePresence`).
  return usePresence(active, active && typeof document !== 'undefined' ? createPortal(
    // Sólo en celular y tableta: si la ventana se ensancha con el cajón abierto, el menú lateral toma su lugar.
    <div ref={rootRef} className="fixed inset-0 z-150 min-[1101px]:hidden">
      <div aria-hidden="true" className="absolute inset-0 animate-nav-scrim bg-background/70 motion-reduce:animate-none" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t('shell.settings.title')} tabIndex={-1} className="relative h-full w-[min(20rem,78vw)] animate-nav-drawer outline-none motion-reduce:animate-none">
        <DrawerPanel onClose={onClose} nav={nav} />
      </div>
    </div>,
    document.body,
  ) : null, () => [rootRef.current])
}
