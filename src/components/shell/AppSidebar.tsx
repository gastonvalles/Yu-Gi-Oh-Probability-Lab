import { SIDEBAR_PX } from '../../app/shell-layout'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { AppBrand } from './AppBrand'
import { mascotsNavItem, searchNavItem, type NavGroup } from './nav-model'
import { RAIL_SLOT } from './rail'
import { SidebarLegal } from './SidebarLegal'
import { NavButton, SidebarNav } from './SidebarNav'

interface AppSidebarProps {
  groups: NavGroup[]
  activeKey: string | null
  onSelect: (key: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Hay buscador de cartas en esta pantalla: la fila de «Buscar cartas» va arriba de los grupos. */
  searchAvailable?: boolean
  className?: string
}

/** Abajo del todo del menú (y del cajón del celular): el idioma. Las mascotas van arriba de esto, como una preferencia más (abren su modal). */
export function MenuTools({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-2', className)}>
      <LanguageSwitcher />
    </div>
  )
}

/**
 * El menú lateral de escritorio, en lugar de la barra de arriba, armado como el de YouTube: arriba, fija, la hamburguesa (que contrae y abre el menú, siempre a la vista) con la marca;
 * debajo, lo que scrollea (`scroll-yt`: la barra sólo aparece mientras el mouse está encima): los destinos agrupados (`SidebarNav`), las mascotas, el idioma y, al final, las redes y la
 * privacidad (`SidebarLegal`). Ocupa el alto que le da el padre. Abierto y contraído es la misma pieza con otro ancho (ver `rail.ts`): el ícono de cada fila (y el de la hamburguesa) no se mueve,
 * los rótulos se desvanecen y el menú los recorta, y el ancho se anima con una sola curva (`--sidebar-duration` y `--sidebar-ease`, las mismas con las que se corren la mascota y los botones flotantes).
 */
export function AppSidebar({ groups, activeKey, onSelect, collapsed, onToggleCollapsed, searchAvailable = false, className }: AppSidebarProps) {
  return (
    <aside
      data-collapsed={collapsed ? 'true' : 'false'}
      style={{ width: collapsed ? SIDEBAR_PX.collapsed : SIDEBAR_PX.expanded }}
      className={cx(
        'group/sidebar flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-nav-raised bg-nav transition-[width] duration-(--sidebar-duration) ease-(--sidebar-ease) motion-reduce:transition-none',
        className,
      )}
    >
      <div className="flex h-16 shrink-0 items-center px-3">
        {/* La hamburguesa vive en la columna de los íconos: está en el mismo lugar abierta y contraída, y siempre se ve. */}
        <span className={RAIL_SLOT}>
          <IconButton
            tone="flat"
            size="sm"
            aria-expanded={!collapsed}
            aria-label={collapsed ? t('shell.nav.expand') : t('shell.nav.collapse')}
            title={collapsed ? t('shell.nav.expand') : t('shell.nav.collapse')}
            onClick={onToggleCollapsed}
          >
            <Icon name="menu" size={22} />
          </IconButton>
        </span>
        {/* Contraída, la marca se desvanece (y no se puede enfocar); abierta, queda al lado de la hamburguesa. */}
        <AppBrand className="min-w-0 transition-[opacity,visibility] duration-150 group-data-[collapsed=true]/sidebar:invisible group-data-[collapsed=true]/sidebar:opacity-0 motion-reduce:transition-none" />
      </div>
      {/* Lo que scrollea. `scroll-yt` reserva a la derecha el lugar de la barra (12 px: lo que queda de los 76 px del menú contraído), así el ancho de las filas no cambia cuando la barra aparece. */}
      <div className="scroll-yt flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pl-3">
        {searchAvailable ? (
          <div className="shrink-0 pb-2">
            <NavButton item={searchNavItem()} active={false} onSelect={onSelect} />
          </div>
        ) : null}
        <SidebarNav groups={groups} activeKey={activeKey} onSelect={onSelect} className="shrink-0 pb-3" />
        {/* Las preferencias, bajo una sola línea: las mascotas (una fila como las de los destinos, que se queda en la columna de íconos al contraer) y el idioma. */}
        <div className="shrink-0 border-t border-nav-raised pb-3 pt-2">
          <NavButton item={mascotsNavItem()} active={false} onSelect={onSelect} />
          {/* Contraído, el idioma se desvanece y no se puede tocar ni enfocar; el renglón conserva su alto. */}
          <MenuTools className="pt-2 transition-[opacity,visibility] duration-150 group-data-[collapsed=true]/sidebar:invisible group-data-[collapsed=true]/sidebar:opacity-0 motion-reduce:transition-none" />
        </div>
        {/* Al final del todo (si el menú sobra de alto, pegado abajo; si no, al final del scroll). */}
        <SidebarLegal className="mt-auto" />
      </div>
    </aside>
  )
}
