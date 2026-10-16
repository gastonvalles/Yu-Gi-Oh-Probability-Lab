import { useId } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { navItemDescription, type NavGroup, type NavItem } from './nav-model'
import { NAV_OVERLINE, RAIL_LABEL, RAIL_LABEL_WIDTH, RAIL_ROW, RAIL_SLOT } from './rail'

interface SidebarNavProps {
  groups: NavGroup[]
  /** El destino abierto (lleva `aria-current="page"`); null si ninguno del menú lo está (una herramienta que abre un panel). */
  activeKey: string | null
  onSelect: (key: string) => void
  className?: string
}

const ITEM = cx(
  'group/item relative flex w-full min-w-0 items-center rounded-control text-left transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
  RAIL_ROW,
)

/**
 * La lista de destinos del menú, agrupada: es lo que se ve en el menú lateral (escritorio) y en el cajón del celular, así que un cambio
 * acá cambia los dos. Los íconos son blancos, como los de todo botón sin texto, y se ponen ámbar al pasar el mouse; el destino abierto lleva fondo índigo claro, ícono relleno y texto ámbar (el ámbar es de la navegación). Cómo viene cada paso (listo, a medio hacer) va en el tooltip y en
 * el nombre accesible, no en un punto de color: un punto suelto en el borde de un ícono se lee como una notificación.
 * Contraído (el menú lateral lo marca con `data-collapsed`), la misma lista se queda con los íconos: nada se vuelve a armar, los rótulos
 * sólo se desvanecen y el menú los recorta (ver `rail.ts`), así el cambio de ancho se anima sin que nada salte.
 */
export function SidebarNav({ groups, activeKey, onSelect, className }: SidebarNavProps) {
  const id = useId()

  return (
    <nav aria-label={t('shell.nav.main')} className={cx('grid grid-cols-[minmax(0,1fr)] content-start gap-1', className)}>
      {groups.map((group, index) => (
        <div key={group.key} role="group" aria-labelledby={`${id}-${group.key}`} className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {/* El renglón del nombre del grupo mide lo mismo con el menú abierto o contraído (contraído, sólo queda la línea). */}
          <p id={`${id}-${group.key}`} className={cx(NAV_OVERLINE, 'm-0 flex items-end px-3 pb-1', index === 0 ? 'h-6' : 'h-9')}>
            <span className="flex h-4 w-full items-center">
              <span className="min-w-0 max-w-40 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-(--sidebar-duration) ease-(--sidebar-ease) group-data-[collapsed=true]/sidebar:max-w-0 group-data-[collapsed=true]/sidebar:opacity-0 motion-reduce:transition-none">
                <span className="block pr-3">{group.label}</span>
              </span>
              <span
                aria-hidden="true"
                className={cx('h-px min-w-3 flex-1 bg-nav-raised transition-opacity duration-150 motion-reduce:transition-none', index === 0 && 'group-data-[collapsed=true]/sidebar:opacity-0')}
              />
            </span>
          </p>
          {/* `minmax(0, 1fr)`: la columna no crece por lo que mide un rótulo (si no, contraído cada fila seguiría midiendo lo mismo que abierta). */}
          <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-0.5 p-0">
            {group.items.map((item) => (
              <li key={item.key} className="min-w-0">
                <NavButton item={item} active={item.key === activeKey} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function NavButton({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: (key: string) => void }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={navItemDescription(item)}
      title={item.detail ? `${item.title}: ${item.detail}` : item.title}
      className={cx(ITEM, active ? 'bg-nav-raised text-nav-active' : 'text-foreground hover:bg-nav-raised/60')}
      onClick={() => onSelect(item.key)}
    >
      <span className={RAIL_SLOT}>
        <Icon
          name={item.icon}
          size={22}
          variant={active ? 'bold' : 'bulk'}
          className={cx(
            'transition-colors duration-150 [--icon-cut:var(--nav-raised)]',
            active ? 'text-nav-active' : 'text-white group-hover/item:text-nav-active',
          )}
        />
      </span>
      {/* El rótulo reserva el ancho de la negrita: al abrirse un destino ninguno se corre. */}
      <span aria-hidden="true" className={cx('grid min-w-0 flex-1 text-body', RAIL_LABEL_WIDTH, RAIL_LABEL)}>
        <span aria-hidden="true" className="invisible col-start-1 row-start-1 truncate font-semibold">
          {item.label}
        </span>
        <span className={cx('col-start-1 row-start-1 truncate', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
      </span>
    </button>
  )
}
