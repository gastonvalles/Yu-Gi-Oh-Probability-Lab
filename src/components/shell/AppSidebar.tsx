import { SIDEBAR_PX } from '../../app/shell-layout'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { MascotPicker } from '../mascot/MascotPicker'
import { AppBrand } from './AppBrand'
import type { NavGroup } from './nav-model'
import { SidebarNav } from './SidebarNav'

interface AppSidebarProps {
  groups: NavGroup[]
  activeKey: string | null
  onSelect: (key: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  className?: string
}

/** Abajo del todo del menú (y del cajón del celular): el idioma y las mascotas. */
export function MenuTools({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-2', className)}>
      <LanguageSwitcher />
      <MascotPicker placement="above" />
    </div>
  )
}

/**
 * El menú lateral de escritorio, en lugar de la barra de arriba: la marca, los destinos agrupados (`SidebarNav`), el idioma y las mascotas,
 * y el botón para contraerlo a una columna de íconos. Ocupa el alto que le da el padre.
 */
export function AppSidebar({ groups, activeKey, onSelect, collapsed, onToggleCollapsed, className }: AppSidebarProps) {
  return (
    <aside
      data-collapsed={collapsed ? 'true' : 'false'}
      style={{ width: collapsed ? SIDEBAR_PX.collapsed : SIDEBAR_PX.expanded }}
      className={cx(
        'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-card-background/70 transition-[width] duration-200 motion-reduce:transition-none',
        className,
      )}
    >
      <div className={cx('flex h-16 shrink-0 items-center', collapsed ? 'justify-center' : 'px-5')}>
        <AppBrand collapsed={collapsed} />
      </div>
      <SidebarNav groups={groups} activeKey={activeKey} onSelect={onSelect} collapsed={collapsed} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]" />
      <div className="grid shrink-0 gap-2 border-t border-border-subtle p-3">
        {collapsed ? null : <MenuTools />}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('shell.nav.expand') : undefined}
          title={collapsed ? t('shell.nav.expand') : undefined}
          className={cx(
            'flex min-h-10 items-center gap-3 rounded-control bg-lavender px-3 text-body font-medium text-foreground transition-colors duration-150 hover:bg-lavender-hover focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
            collapsed && 'justify-center px-0',
          )}
          onClick={onToggleCollapsed}
        >
          <Icon name="chevrons-left" size={18} className={cx('shrink-0 transition-transform duration-200 motion-reduce:transition-none', collapsed && 'rotate-180')} />
          {collapsed ? null : <span className="truncate">{t('shell.nav.collapse')}</span>}
        </button>
      </div>
    </aside>
  )
}
