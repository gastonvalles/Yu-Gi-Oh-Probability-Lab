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
  /** false: la pantalla ocupa todo el alto (el builder) y adentro tiene sus propios scrolls; el pie va fijo abajo. */
  contentScrollable?: boolean
}

/**
 * El armazón de toda la app: en escritorio, el menú lateral a la izquierda y la pantalla con su pie a la derecha; en el celular, la barra
 * de arriba con la hamburguesa (que abre el cajón con el mismo menú) y la pantalla con su pie. Se arma una sola vez: las pantallas
 * sólo ponen su contenido adentro.
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
          {/* Si la pantalla scrollea, su contenido no se achica (el pie va después de él y no lo pisa); si ocupa el alto, se ajusta y scrollea por dentro,
              y el pie queda fijo abajo. El pie va siempre adentro: así tiene el mismo ancho (y la barra reservada) en todas las pantallas. */}
          <div className={cx('w-full min-w-0 flex-1 [&>*]:min-w-0', !contentScrollable && 'min-h-0')}>{children}</div>
          <AppFooter className={contentScrollable ? undefined : 'min-[1101px]:py-2'} />
        </div>
      </div>
      <NavDrawer isOpen={drawerOpen} onClose={closeDrawer} groups={groups} activeKey={activeKey} onSelect={onSelect} />
    </div>
  )
}
