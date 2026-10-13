import { useId } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { overline } from '../ui/typography'
import { navItemDescription, type NavGroup, type NavItem, type NavTone } from './nav-model'

interface SidebarNavProps {
  groups: NavGroup[]
  /** El destino abierto (lleva `aria-current="page"`); null si ninguno del menú lo está (una herramienta que abre un panel). */
  activeKey: string | null
  onSelect: (key: string) => void
  /** Sólo íconos (el menú lateral contraído): el nombre queda para los lectores de pantalla y el tooltip. */
  collapsed?: boolean
  className?: string
}

const DOT: Record<NavTone, string | null> = { complete: 'bg-success', progress: 'bg-warning', pending: null }

const ITEM =
  'group relative flex w-full min-w-0 items-center gap-3 rounded-control px-3 py-2.5 text-left transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none'

/**
 * La lista de destinos del menú, agrupada: es lo que se ve en el menú lateral (escritorio) y en el cajón del celular, así que un cambio
 * acá cambia los dos. El destino abierto lleva fondo lavanda, ícono relleno y texto verde; el punto de color dice cómo viene ese paso.
 */
export function SidebarNav({ groups, activeKey, onSelect, collapsed = false, className }: SidebarNavProps) {
  const id = useId()

  return (
    <nav aria-label={t('shell.nav.main')} className={cx('grid content-start gap-1', className)}>
      {groups.map((group, index) => (
        <div key={group.key} role="group" aria-labelledby={`${id}-${group.key}`} className="grid gap-0.5">
          {collapsed ? (
            <span id={`${id}-${group.key}`} className="sr-only">
              {group.label}
            </span>
          ) : (
            <p id={`${id}-${group.key}`} className={cx(overline, 'm-0 flex items-center gap-3 px-3 pb-1 pt-4', index === 0 && 'pt-1')}>
              <span className="shrink-0">{group.label}</span>
              <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-border-subtle" />
            </p>
          )}
          {collapsed && index > 0 ? <hr aria-hidden="true" className="mx-3 my-1.5 border-0 border-t border-border-subtle" /> : null}
          <ul className="m-0 grid list-none gap-0.5 p-0">
            {group.items.map((item) => (
              <li key={item.key}>
                <NavButton item={item} active={item.key === activeKey} collapsed={collapsed} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function NavButton({ item, active, collapsed, onSelect }: { item: NavItem; active: boolean; collapsed: boolean; onSelect: (key: string) => void }) {
  const dot = item.tone ? DOT[item.tone] : null

  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={navItemDescription(item)}
      title={item.detail ? `${item.title}: ${item.detail}` : item.title}
      className={cx(ITEM, collapsed && 'justify-center px-0', active ? 'bg-lavender text-success' : 'text-muted hover:bg-tint/5 hover:text-foreground')}
      onClick={() => onSelect(item.key)}
    >
      <Icon
        name={item.icon}
        size={22}
        variant={active ? 'bold' : 'bulk'}
        className={cx('shrink-0 transition-colors duration-150 [--icon-cut:var(--lavender)]', active ? 'text-success drop-shadow-[0_0_8px_rgb(var(--success-rgb)/0.55)]' : 'text-primary-soft/60 group-hover:text-primary-soft')}
      />
      {collapsed ? null : (
        // El rótulo reserva el ancho de la negrita: al abrirse un destino ninguno se corre.
        <span className="grid min-w-0 flex-1 text-body">
          <span aria-hidden="true" className="invisible col-start-1 row-start-1 truncate font-semibold">
            {item.label}
          </span>
          <span className={cx('col-start-1 row-start-1 truncate', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
        </span>
      )}
      {dot ? <span aria-hidden="true" data-tone={item.tone} className={cx('size-2 shrink-0 rounded-full', dot, collapsed && 'absolute right-3 top-2.5 ring-2 ring-card-background')} /> : null}
    </button>
  )
}
