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
 * La barra de abajo del celular: un botón por grupo (Tu deck · Duelo · Herramientas · Descubrir). Tocar uno abre su hoja (`GroupSheet`) con las
 * opciones. Es índigo y el grupo del destino abierto va en ámbar, igual que el menú lateral. Mide 64 px (más el borde seguro del teléfono):
 * `AppShell` deja ese espacio libre abajo y se lo avisa a los botones flotantes (`TAB_BAR_PX` en `app/shell-layout.ts`).
 */
export function MobileTabBar({ groups, activeKey, openKey, onOpen, placement = 'fixed', className }: MobileTabBarProps) {
  return (
    <nav aria-label={t('shell.nav.main')} className={cx('flex border-t border-nav-raised bg-nav pb-[env(safe-area-inset-bottom,0px)]', placement === 'fixed' && 'fixed inset-x-0 bottom-0 z-40', className)}>
      {groups.map((group) => {
        const hasActive = group.items.some((item) => item.key === activeKey)
        const open = openKey === group.key

        return (
          <button
            key={group.key}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            data-active={hasActive ? 'true' : undefined}
            className={cx(
              'flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-micro font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus active:opacity-70 motion-reduce:transition-none',
              hasActive || open ? 'text-nav-active' : 'text-foreground',
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
