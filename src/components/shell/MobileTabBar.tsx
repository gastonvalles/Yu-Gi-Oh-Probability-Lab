import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import type { NavGroup } from './nav-model'

interface MobileTabBarProps {
  groups: NavGroup[]
  /** El destino abierto: el grupo que lo contiene se marca en ámbar. */
  activeKey: string | null
  /** El grupo cuya hoja está abierta (el botón lo anuncia). */
  openKey: string | null
  onOpen: (groupKey: string) => void
  /** 'fixed': pegada al borde de abajo de la pantalla (la de la app); 'inline': en el flujo (el catálogo la muestra dentro de una caja). */
  placement?: 'fixed' | 'inline'
  className?: string
}

/**
 * La barra de abajo del celular: un botón por grupo (Tu deck · Jugar · Descubrir · Cartas). Tocar uno abre su hoja (`GroupSheet`) con las
 * opciones, que se prolonga desde la barra (el mismo índigo; con la hoja abierta, la línea de arriba de la barra se apaga y la barra pasa por encima de la hoja, que sigue por debajo de ella: no hay un borde contra otro que las separe). Es índigo y el grupo del destino abierto va en ámbar, igual que el menú lateral. Mide 64 px (más el borde seguro del teléfono):
 * `AppShell` deja ese espacio libre abajo y se lo avisa a los botones flotantes (`TAB_BAR_PX` en `app/shell-layout.ts`).
 */
export function MobileTabBar({ groups, activeKey, openKey, onOpen, placement = 'fixed', className }: MobileTabBarProps) {
  return (
    <nav aria-label={t('shell.nav.main')} className={cx('flex border-t bg-nav pb-[env(safe-area-inset-bottom,0px)]', openKey === null ? 'border-nav-raised' : 'border-transparent', placement === 'fixed' && cx('fixed inset-x-0 bottom-0', openKey === null ? 'z-40' : 'z-160'), className)}>
      {groups.map((group) => {
        const open = openKey === group.key
        // Con una hoja abierta el ámbar es del grupo de esa hoja; sin hoja, del grupo de la pantalla en que estás.
        const hasActive = openKey === null ? group.items.some((item) => item.key === activeKey) : open

        return (
          <button
            key={group.key}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-current={group.items.some((item) => item.key === activeKey) ? 'true' : undefined}
            data-active={hasActive ? 'true' : undefined}
            className={cx(
              'flex h-[calc(4rem-1px)] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-micro font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus active:opacity-70 motion-reduce:transition-none',
              hasActive ? 'text-nav-active' : 'text-foreground',
            )}
            onClick={() => onOpen(group.key)}
          >
            <Icon name={group.icon} size={22} variant={hasActive ? 'bold' : 'bulk'} className="[--icon-cut:var(--nav)]" />
            <span className="max-w-full truncate px-1">{group.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
