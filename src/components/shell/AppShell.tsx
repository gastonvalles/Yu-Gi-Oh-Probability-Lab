import { useCallback, useState, type ReactNode, type RefObject } from 'react'

import { cx } from '../ui/cx'
import { AppFooter } from './AppFooter'
import { AppSidebar } from './AppSidebar'
import { MobileTopBar } from './MobileTopBar'
import type { NavGroup } from './nav-model'
import { NavDrawer } from './NavDrawer'

const SIDEBAR_KEY = 'ygo-lab:sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  } catch {
    // Sin almacenamiento: el menú se queda como esté hasta recargar.
  }
}

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
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      writeCollapsed(!current)
      return !current
    })
  }, [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

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
            'flex min-h-0 w-full min-w-0 flex-1 flex-col min-[1101px]:[scrollbar-gutter:stable] min-[1101px]:[scrollbar-width:thin]',
            contentScrollable ? 'min-[1101px]:overflow-y-auto' : 'min-[1101px]:overflow-hidden',
          )}
        >
          <div className="min-h-0 w-full min-w-0 flex-1 [&>*]:min-w-0">{children}</div>
          {contentScrollable ? <AppFooter /> : null}
        </div>
        {contentScrollable ? null : <AppFooter className="min-[1101px]:py-2" />}
      </div>
      <NavDrawer isOpen={drawerOpen} onClose={closeDrawer} groups={groups} activeKey={activeKey} onSelect={onSelect} />
    </div>
  )
}
