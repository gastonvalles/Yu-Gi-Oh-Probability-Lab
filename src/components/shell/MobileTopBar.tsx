import { createContext } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { AppBrand } from './AppBrand'

/**
 * El lugar de la barra de arriba (a la derecha del título) donde el encabezado de la pantalla (`StepHero`) deja sus botones chicos en el celular: la ayuda «i», el de la guía,
 * la calculadora del Lab. `null` sin barra o sin título en ella (la mesa, el escritorio, fuera de un `AppShell`): entonces el encabezado lleva su título a la vista.
 */
export const TopBarToolsContext = createContext<HTMLElement | null>(null)

interface MobileTopBarProps {
  /** El cajón está abierto (el botón lo anuncia). */
  menuOpen: boolean
  onMenu: () => void
  /** El nombre de la pantalla (lo que dice el menú: «Lab», «Replays»); sin él, la marca. */
  title?: string
  /** Recibe el lugar de los botones de la pantalla (`TopBarToolsContext`); sólo hay lugar con título. */
  toolsRef?: (element: HTMLElement | null) => void
  className?: string
}

/**
 * La barra de arriba del celular: el botón de hamburguesa que abre el cajón de ajustes y el nombre de la pantalla (o la marca, que vive en el cajón). El buscador de la app no va
 * acá sino en la barra de abajo, al alcance del pulgar (`MobileTabBar`). En escritorio no existe (lo reemplaza el menú lateral). El título se dice una sola vez: con él acá, el
 * encabezado de la pantalla lo guarda para el lector de pantalla (su `h1`) y pasa sus botones chicos a la derecha de esta barra.
 */
export function MobileTopBar({ menuOpen, onMenu, title, toolsRef, className }: MobileTopBarProps) {
  return (
    <header className={cx('sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-background pl-[calc(env(safe-area-inset-left,0px)+0.75rem)] pr-3 pt-[env(safe-area-inset-top,0px)]', className)}>
      <IconButton aria-label={t('shell.nav.open')} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onMenu}>
        <Icon name="menu" size={22} />
      </IconButton>
      {title ? (
        <>
          <span className="min-w-0 flex-1 truncate text-lead font-bold text-foreground">{title}</span>
          <div ref={toolsRef} className="flex shrink-0 items-center gap-1 empty:hidden" />
        </>
      ) : (
        <AppBrand />
      )}
    </header>
  )
}
