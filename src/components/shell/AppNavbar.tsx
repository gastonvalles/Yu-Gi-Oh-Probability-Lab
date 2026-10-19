import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { AppBrand } from './AppBrand'

interface AppNavbarProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Abre el buscador de la app. */
  onSearch: () => void
  /** Abre el panel de las mascotas. */
  onMascots: () => void
  className?: string
}

/**
 * La barra de arriba de escritorio, como la de YouTube: a la izquierda la hamburguesa (contrae y abre el menú lateral; se ilumina en ámbar) con la marca, en el centro el buscador de la app (una lupa y lo que
 * se puede buscar: pantallas, herramientas y cartas; también se abre con `/` y Ctrl/Cmd+K) y a la derecha las preferencias: las mascotas y el idioma, que ya no están en el menú lateral. Es del color del
 * menú lateral, así los dos forman un solo marco. No está en las pantallas a pantalla completa (la práctica y la mesa de un duelo): ahí manda la mesa.
 */
export function AppNavbar({ collapsed, onToggleCollapsed, onSearch, onMascots, className }: AppNavbarProps) {
  return (
    <header data-testid="app-navbar" className={cx('grid h-14 shrink-0 grid-cols-[1fr_minmax(0,36rem)_1fr] items-center gap-4 border-b border-nav-raised bg-nav pl-3 pr-4', className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <IconButton
          tone="flat"
          size="sm"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('shell.nav.expand') : t('shell.nav.collapse')}
          title={collapsed ? t('shell.nav.expand') : t('shell.nav.collapse')}
          // El ámbar es de la navegación: se ilumina así, como el destino abierto del menú.
          className="hover:text-nav-active! focus-visible:text-nav-active!"
          onClick={onToggleCollapsed}
        >
          <Icon name="menu" size={22} />
        </IconButton>
        <AppBrand className="min-w-0" />
      </div>

      {/* Parece un campo y es un botón: abre el buscador (que tiene el campo de verdad, con el foco ya puesto). */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t('shell.find.open')}
        className="group/find flex h-10 min-w-0 cursor-pointer items-center gap-3 rounded-full border border-nav-raised bg-background/40 pl-4 pr-2 text-left transition-colors duration-150 hover:border-nav-active focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
        onClick={onSearch}
      >
        <Icon name="search" size={18} className="shrink-0 text-muted transition-colors duration-150 group-hover/find:text-nav-active" />
        <span className="min-w-0 flex-1 truncate text-body text-muted">{t('shell.find.placeholder')}</span>
        <kbd aria-hidden="true" className="grid h-6 min-w-6 shrink-0 place-items-center rounded-tag border border-nav-raised px-1.5 font-sans text-micro font-semibold text-muted">
          /
        </kbd>
      </button>

      <div className="flex items-center justify-end gap-3">
        <IconButton tone="flat" size="sm" aria-label={t('shell.mascot.title')} title={t('shell.mascot.title')} className="hover:text-nav-active! focus-visible:text-nav-active!" onClick={onMascots}>
          <Icon name="paw" size={22} />
        </IconButton>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
