import { SIDEBAR_PX } from '../../app/shell-layout'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { MascotPicker } from '../mascot/MascotPicker'
import { AppBrand } from './AppBrand'
import type { NavGroup } from './nav-model'
import { RAIL_LABEL, RAIL_ROW, RAIL_SLOT } from './rail'
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
 * y el botón para contraerlo a una columna de íconos. Ocupa el alto que le da el padre. Abierto y contraído es la misma pieza con otro ancho
 * (ver `rail.ts`): el ícono de cada fila no se mueve, los rótulos se desvanecen y el menú los recorta, y el ancho se anima con una sola curva
 * (`--sidebar-duration` y `--sidebar-ease`, las mismas con las que se corren la mascota y los botones flotantes).
 */
export function AppSidebar({ groups, activeKey, onSelect, collapsed, onToggleCollapsed, className }: AppSidebarProps) {
  return (
    <aside
      data-collapsed={collapsed ? 'true' : 'false'}
      style={{ width: collapsed ? SIDEBAR_PX.collapsed : SIDEBAR_PX.expanded }}
      className={cx(
        'group/sidebar flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-card-background/70 transition-[width] duration-(--sidebar-duration) ease-(--sidebar-ease) motion-reduce:transition-none',
        className,
      )}
    >
      <div className="flex h-16 shrink-0 items-center px-5">
        <AppBrand />
      </div>
      <SidebarNav groups={groups} activeKey={activeKey} onSelect={onSelect} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 [scrollbar-width:thin]" />
      <div className="shrink-0 px-3 pb-3">
        {/* Contraído, el idioma y las mascotas se desvanecen y no se pueden tocar ni enfocar; el renglón conserva su alto para que la flecha de abajo no se mueva. */}
        <MenuTools className="border-t border-border-subtle pb-2 pt-3 transition-[opacity,visibility] duration-150 group-data-[collapsed=true]/sidebar:invisible group-data-[collapsed=true]/sidebar:opacity-0 motion-reduce:transition-none" />
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('shell.nav.expand') : t('shell.nav.collapse')}
          title={collapsed ? t('shell.nav.expand') : undefined}
          className={cx(
            'group/toggle flex w-full items-center rounded-control text-left text-body font-medium text-white transition-opacity duration-150 hover:[&_svg]:text-success hover:[&_svg]:drop-shadow-[0_0_6px_rgb(var(--success-rgb)/0.7)] focus-visible:outline-none focus-visible:shadow-focus active:opacity-70 motion-reduce:transition-none',
            RAIL_ROW,
          )}
          onClick={onToggleCollapsed}
        >
          <span className={RAIL_SLOT}>
            <Icon name="chevrons-left" size={20} className="transition-[rotate,filter,color] duration-(--sidebar-duration) ease-(--sidebar-ease) group-data-[collapsed=true]/sidebar:rotate-180 motion-reduce:transition-none" />
          </span>
          <span aria-hidden="true" className={cx('w-36 shrink-0 truncate', RAIL_LABEL)}>
            {t('shell.nav.collapse')}
          </span>
        </button>
      </div>
    </aside>
  )
}
