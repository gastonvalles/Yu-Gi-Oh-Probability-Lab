import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { AppBrand } from './AppBrand'

interface MobileTopBarProps {
  /** El cajón está abierto (el botón lo anuncia). */
  menuOpen: boolean
  onMenu: () => void
  className?: string
}

/** La barra de arriba del celular: el botón de hamburguesa que abre el cajón del menú y la marca. En escritorio no existe (lo reemplaza el menú lateral). */
export function MobileTopBar({ menuOpen, onMenu, className }: MobileTopBarProps) {
  return (
    <header className={cx('sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-background/85 pl-[calc(env(safe-area-inset-left,0px)+0.75rem)] pr-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur', className)}>
      <IconButton aria-label={t('shell.nav.open')} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onMenu}>
        <Icon name="menu" size={22} />
      </IconButton>
      <AppBrand />
    </header>
  )
}
