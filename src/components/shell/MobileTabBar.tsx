import type { ReactNode } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { PLAY_GROUP_KEY, type NavGroup } from './nav-model'

interface MobileTabBarProps {
  groups: NavGroup[]
  /** El destino abierto: el grupo que lo contiene se marca en ámbar. */
  activeKey: string | null
  /** El grupo cuya hoja está abierta (el botón lo anuncia). */
  openKey: string | null
  onOpen: (groupKey: string) => void
  /** Abre el buscador de la app (pantallas, herramientas y cartas): el último lugar de la barra. Sin él, la barra lleva sólo los grupos. */
  onSearch?: () => void
  /** El buscador de la app está abierto (el botón lo anuncia). */
  searchOpen?: boolean
  /** 'fixed': pegada al borde de abajo de la pantalla (la de la app); 'inline': en el flujo (el catálogo la muestra dentro de una caja). */
  placement?: 'fixed' | 'inline'
  className?: string
}

const TAB = 'relative flex h-[calc(4rem-1px)] min-w-0 flex-1 flex-col items-center text-micro font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus active:opacity-70 motion-reduce:transition-none'

/** La rayita ámbar arriba del lugar abierto: lo marca también por la forma, no sólo por el color del texto. */
const Indicator = () => <span aria-hidden="true" className="absolute top-0 h-0.75 w-8 rounded-b-full bg-nav-active" />

/**
 * La barra de abajo del celular, en cinco lugares: Tu deck · Descubrir · **Jugar** · Cartas · Buscar. Jugar va en el centro, en un círculo violeta con el ícono blanco que asoma
 * por arriba de la barra (separado por un aro del color del lienzo: no es una sombra); el buscador de la app es el último lugar, al alcance del pulgar (en la barra de arriba
 * quedan la hamburguesa y el nombre de la pantalla). Tocar un grupo abre su hoja (`GroupSheet`), que se prolonga desde la barra (el mismo índigo; con la hoja abierta, la línea de
 * arriba de la barra se apaga y la barra pasa por encima de la hoja). El círculo hace lo mismo que los demás: Jugar tiene varios destinos (entrenar, jugar online, la calculadora,
 * exportar), así que abre su hoja.
 *
 * - **Props:** `groups`, `activeKey`, `openKey`/`onOpen` (la hoja), `onSearch`/`searchOpen` (el buscador), `placement`.
 * - **Estados:** reposo · abierto (el grupo de la pantalla, o el de la hoja abierta: texto e ícono lleno en ámbar con la rayita arriba; el círculo, con un aro ámbar) · hoja abierta
 *   (sin línea arriba) · foco (`shadow-focus`) · presionado (se apaga un poco; sin movimiento, así que nada cambia con `prefers-reduced-motion`).
 * - **Accesibilidad:** `nav` «Navegación principal»; cada lugar es un botón con su nombre (el círculo se llama «Jugar»; la lupa, «Buscar en la app»), `aria-expanded` de su hoja y
 *   `aria-current` el de la pantalla abierta; 64 px de alto y un quinto del ancho cada uno.
 * - **Hacer:** dejar libre lo que ocupa (4 rem más lo que asoma el círculo, `TAB_BAR_PX`). **No hacer:** mostrarla en escritorio (≥ 1101 px va el menú lateral) ni en la mesa a
 *   pantalla completa, ni ponerle una sombra al círculo.
 * - **Usos:** `AppShell` (todas las pantallas del celular menos la mesa), el catálogo (`placement="inline"`), las pruebas del armazón.
 */
export function MobileTabBar({ groups, activeKey, openKey, onOpen, onSearch, searchOpen = false, placement = 'fixed', className }: MobileTabBarProps) {
  const play = groups.find((group) => group.key === PLAY_GROUP_KEY)
  const slots: ReactNode[] = groups
    .filter((group) => group !== play)
    .map((group) => {
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
          className={cx(TAB, 'justify-center gap-1', hasActive ? 'text-nav-active' : 'text-foreground')}
          onClick={() => onOpen(group.key)}
        >
          {hasActive ? <Indicator /> : null}
          <Icon name={group.icon} size={22} variant={hasActive ? 'bold' : 'bulk'} className="[--icon-cut:var(--nav)]" />
          <span className="max-w-full truncate px-1">{group.label}</span>
        </button>
      )
    })

  if (onSearch) {
    slots.push(
      <button key="search" type="button" aria-label={t('shell.find.open')} aria-haspopup="dialog" aria-expanded={searchOpen} className={cx(TAB, 'justify-center gap-1', searchOpen ? 'text-nav-active' : 'text-foreground')} onClick={onSearch}>
        {searchOpen ? <Indicator /> : null}
        <Icon name="search" size={22} strokeWidth={searchOpen ? 2.1 : 1.75} />
        <span className="max-w-full truncate px-1">{t('shell.nav.searchShort')}</span>
      </button>,
    )
  }

  if (play) {
    const open = openKey === play.key
    const current = play.items.some((item) => item.key === activeKey)
    const hasActive = openKey === null ? current : open

    // En el medio: con cuatro lugares más, quedan dos de cada lado.
    slots.splice(
      Math.ceil(slots.length / 2),
      0,
      <button
        key={play.key}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={current ? 'true' : undefined}
        data-active={hasActive ? 'true' : undefined}
        data-center="true"
        className={cx(TAB, 'justify-end pb-1', hasActive ? 'text-nav-active' : 'text-foreground')}
        onClick={() => onOpen(play.key)}
      >
        {/* Asoma 12 px por arriba de la barra (`TAB_BAR_PX` lo cuenta). El aro del color del lienzo lo despega de la barra sin sombra; abierto, por fuera, otro ámbar. */}
        <span aria-hidden="true" className={cx('absolute -top-3 left-1/2 grid size-13 -translate-x-1/2 place-items-center rounded-full bg-primary text-white ring-3 ring-background', hasActive && 'outline-2 outline-offset-3 outline-nav-active')}>
          <Icon name={play.icon} size={26} strokeWidth={2} />
        </span>
        <span className="max-w-full truncate px-1">{play.label}</span>
      </button>,
    )
  }

  return (
    <nav aria-label={t('shell.nav.main')} className={cx('flex border-t bg-nav pb-[env(safe-area-inset-bottom,0px)]', openKey === null ? 'border-nav-raised' : 'border-transparent', placement === 'fixed' && cx('fixed inset-x-0 bottom-0', openKey === null ? 'z-40' : 'z-160'), className)}>
      {slots}
    </nav>
  )
}
