import { useCallback, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'

import { NO_SHELL_INSETS, readSidebarCollapsed, setShellInsets, shellInsetsFor, writeSidebarCollapsed } from '../../app/shell-layout'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { cx } from '../ui/cx'
import { AppFooter } from './AppFooter'
import { AppSidebar } from './AppSidebar'
import { MobileTopBar } from './MobileTopBar'
import type { NavGroup } from './nav-model'
import { NavDrawer } from './NavDrawer'

interface AppShellProps {
  groups: NavGroup[]
  activeKey: string | null
  onSelect: (key: string) => void
  children: ReactNode
  /** El contenedor que scrollea en escritorio (para volver arriba al cambiar de pantalla). */
  contentScrollRef?: RefObject<HTMLDivElement | null>
  /** false: la pantalla ocupa todo el alto (el builder) y adentro tiene sus propios scrolls; true: scrollea el recuadro de la pantalla. El pie va fijo abajo en los dos. */
  contentScrollable?: boolean
}

/**
 * El armazón de toda la app: en escritorio, el menú lateral a la izquierda y, a la derecha, la pantalla y el pie fijo abajo (en todas, la
 * pantalla ocupa el mismo alto y es ella la que scrollea); en el celular, la barra de arriba con la hamburguesa (que abre el cajón con el
 * mismo menú) y la pantalla con su pie al final, en el scroll de la página. Se arma una sola vez: las pantallas sólo ponen su contenido adentro.
 */
export function AppShell({ groups, activeKey, onSelect, children, contentScrollRef, contentScrollable = false }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      writeSidebarCollapsed(!current)
      return !current
    })
  }, [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)

  // Los botones flotantes (y las mascotas, mientras nadie las mueva) dejan libres el menú lateral (con su ancho de ahora) y el pie. En el celular no hay menú fijo.
  // Va en un layout effect para que el cambio (contraer el menú, girar la pantalla) se vea en el mismo cuadro; el valor del primer cuadro ya lo trae el módulo.
  useLayoutEffect(() => {
    setShellInsets(shellInsetsFor(collapsed, isDesktop))

    return () => setShellInsets(NO_SHELL_INSETS)
  }, [collapsed, isDesktop])

  return (
    <div className="min-h-dvh w-full min-w-0 overflow-x-clip min-[1101px]:grid min-[1101px]:h-dvh min-[1101px]:grid-cols-[auto_minmax(0,1fr)] min-[1101px]:overflow-hidden">
      <AppSidebar groups={groups} activeKey={activeKey} onSelect={onSelect} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} className="max-[1100px]:hidden" />
      <div className="flex min-h-dvh min-w-0 flex-col min-[1101px]:min-h-0">
        <MobileTopBar menuOpen={drawerOpen} onMenu={() => setDrawerOpen(true)} className="min-[1101px]:hidden" />
        <div
          ref={contentScrollRef}
          className={cx(
            // `scrollbar-gutter`: la barra de scroll queda reservada en todas las pantallas (también en el builder, que no la usa), así el ancho
            // del contenido no cambia entre una pantalla larga y una corta y nada se corre de lugar al cambiar. Fina en todos.
            // `relative`: lo posicionado adentro (los `sr-only`) queda dentro de este recuadro; si no, se estira el alto del documento.
            'relative flex min-h-0 w-full min-w-0 flex-1 flex-col min-[1101px]:[scrollbar-gutter:stable] min-[1101px]:[scrollbar-width:thin]',
            contentScrollable ? 'min-[1101px]:overflow-y-auto' : 'min-[1101px]:overflow-hidden',
          )}
        >
          {/* En escritorio este envoltorio mide siempre lo que el recuadro (`min-h-0`: no crece con el contenido), así una pantalla puede ocupar justo ese alto con `h-full`
              y repartirlo entre columnas que scrollean por dentro; una pantalla más larga lo desborda y es el recuadro el que scrollea. En el celular crece con el contenido. */}
          <div className={cx('w-full min-w-0 flex-1 min-[1101px]:min-h-0 [&>*]:min-w-0', !contentScrollable && 'min-h-0')}>{children}</div>
        </div>
        {/* El pie queda afuera del recuadro que scrollea: en escritorio está siempre a la vista, abajo, con el mismo alto en todas las pantallas. */}
        <AppFooter className="min-[1101px]:py-2" />
      </div>
      <NavDrawer isOpen={drawerOpen} onClose={closeDrawer} groups={groups} activeKey={activeKey} onSelect={onSelect} />
    </div>
  )
}
