import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode, type RefObject } from 'react'

import { NO_SHELL_INSETS, readSidebarCollapsed, setShellInsets, shellInsetsFor, writeSidebarCollapsed } from '../../app/shell-layout'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { AppFooter } from './AppFooter'
import { AppSidebar } from './AppSidebar'
import { GroupSheet } from './GroupSheet'
import { MobileTabBar } from './MobileTabBar'
import { MobileTopBar } from './MobileTopBar'
import type { NavGroup } from './nav-model'
import { NavDrawer } from './NavDrawer'
import { ShellMenuContext, type ShellMenu } from './ShellMenu'

interface AppShellProps {
  groups: NavGroup[]
  activeKey: string | null
  onSelect: (key: string) => void
  children: ReactNode
  /** El contenedor que scrollea en escritorio (para volver arriba al cambiar de pantalla). */
  contentScrollRef?: RefObject<HTMLDivElement | null>
  /** false: la pantalla ocupa todo el alto (el builder) y adentro tiene sus propios scrolls; true: scrollea el recuadro de la pantalla. El pie va fijo abajo en los dos. */
  contentScrollable?: boolean
  /** Avisa al abrirse la hoja de un grupo en el celular: quien arma el menú puede releer lo que cambió desde la última vez (una sala que se dejó en pausa, las builds guardadas). */
  onSheetOpen?: (groupKey: string) => void
  /** Vista completa (la práctica): sin pie y, en el celular, del alto exacto de la ventana (nada de scroll de página); la pantalla se reparte ese alto. */
  immersive?: boolean
  /** Hay buscador de cartas en esta pantalla (todas menos el builder, que ya tiene el suyo, la práctica y la sala o la mesa de un duelo; el lobby sí): aparece en el menú lateral, la barra de arriba y el cajón del celular, y abre `onSelect('search')`. */
  searchAvailable?: boolean
}

/**
 * El armazón de toda la app: en escritorio, el menú lateral a la izquierda y, a la derecha, la pantalla y el pie fijo abajo (en todas, la
 * pantalla ocupa el mismo alto y es ella la que scrollea); en el celular, la barra de arriba con la hamburguesa (que abre el cajón de ajustes:
 * idioma, copia de seguridad y legales), la barra de abajo con los cuatro grupos (cada uno abre una hoja con sus opciones) y la pantalla con su pie
 * al final, en el scroll de la página. Se arma una sola vez: las pantallas sólo ponen su contenido adentro.
 */
export function AppShell({ groups, activeKey, onSelect, children, contentScrollRef, contentScrollable = false, immersive = false, onSheetOpen, searchAvailable = false }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null)
  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      writeSidebarCollapsed(!current)
      return !current
    })
  }, [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  // Una pantalla a pantalla completa puede traer su propia hamburguesa (`ShellMenuButton`): entonces la barra de arriba sobra y el alto es para la mesa.
  const [menuClaims, setMenuClaims] = useState(0)
  const claimMenu = useCallback(() => {
    setMenuClaims((count) => count + 1)

    return () => setMenuClaims((count) => count - 1)
  }, [])
  // Sin la barra de arriba (la mesa trae su hamburguesa), el contenido respeta solo la zona segura de arriba: la barra lo hacía con su `pt`.
  const ownMenu = immersive && menuClaims > 0
  const menu = useMemo<ShellMenu>(() => ({ open: openDrawer, isOpen: drawerOpen, claim: claimMenu }), [openDrawer, drawerOpen, claimMenu])
  const closeGroup = useCallback(() => setOpenGroupKey(null), [])
  const openSearch = useCallback(() => onSelect('search'), [onSelect])
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // La barra de arriba del celular dice en qué pantalla estás (como en el lienzo); sin pantalla conocida, la marca.
  // (El inicio del duelo es «Nueva sala» en el menú lateral, pero la pantalla es la del grupo: «Duelo».)
  const activeGroup = groups.find((group) => group.items.some((item) => item.key === activeKey))
  const screenTitle = activeKey === 'duel' ? activeGroup?.label : activeGroup?.items.find((item) => item.key === activeKey)?.label

  // Otra pantalla (también con el botón Atrás): la hoja y el cajón que estaban abiertos se cierran.
  useEffect(() => {
    setOpenGroupKey(null)
    setDrawerOpen(false)
  }, [activeKey])

  // Los botones flotantes (y las mascotas, mientras nadie las mueva) dejan libres el menú lateral (con su ancho de ahora) y el pie. En el celular no hay menú fijo.
  // Va en un layout effect para que el cambio (contraer el menú, girar la pantalla) se vea en el mismo cuadro; el valor del primer cuadro ya lo trae el módulo.
  useLayoutEffect(() => {
    setShellInsets(shellInsetsFor(collapsed, isDesktop, !immersive))

    return () => setShellInsets(NO_SHELL_INSETS)
  }, [collapsed, isDesktop, immersive])

  return (
    <div className={cx('min-h-dvh w-full min-w-0 overflow-x-clip min-[1101px]:grid min-[1101px]:h-dvh min-[1101px]:grid-cols-[auto_minmax(0,1fr)] min-[1101px]:overflow-hidden', immersive ? 'max-[1100px]:h-dvh max-[1100px]:overflow-hidden' : 'max-[1100px]:pb-[calc(4rem+env(safe-area-inset-bottom,0px))]')}>
      {/* Es un botón y no un enlace: las rutas viajan en el hash, y un `href="#contenido"` cambiaría de pantalla. */}
      <button
        type="button"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:z-300 focus-visible:rounded-control focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-body focus-visible:font-semibold focus-visible:text-primary-foreground focus-visible:shadow-focus focus-visible:outline-none"
        onClick={() => document.getElementById('contenido')?.focus()}
      >
        {t('shell.skipToContent')}
      </button>
      <AppSidebar groups={groups} activeKey={activeKey} onSelect={onSelect} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} searchAvailable={searchAvailable} className="max-[1100px]:hidden" />
      <div className={cx('flex min-w-0 flex-col min-[1101px]:min-h-0', immersive ? 'min-h-dvh max-[1100px]:h-dvh' : 'min-h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))] min-[1101px]:min-h-0', ownMenu && 'max-[1100px]:pt-[env(safe-area-inset-top,0px)]')}>
        {ownMenu ? null : <MobileTopBar menuOpen={drawerOpen} onMenu={openDrawer} title={screenTitle} onSearch={searchAvailable ? openSearch : undefined} className="min-[1101px]:hidden" />}
        <div
          ref={contentScrollRef}
          className={cx(
            // `scrollbar-gutter`: la barra de scroll queda reservada en todas las pantallas (también en el builder, que no la usa), así el ancho
            // del contenido no cambia entre una pantalla larga y una corta y nada se corre de lugar al cambiar. Fina en todos.
            // `relative`: lo posicionado adentro (los `sr-only`) queda dentro de este recuadro; si no, se estira el alto del documento.
            'relative flex min-h-0 w-full min-w-0 flex-1 flex-col min-[1101px]:[scrollbar-gutter:stable] min-[1101px]:[scrollbar-width:thin]',
            contentScrollable ? 'min-[1101px]:overflow-y-auto' : 'min-[1101px]:overflow-hidden',
            immersive && 'max-[1100px]:overflow-hidden',
          )}
        >
          {/* En escritorio este envoltorio mide siempre lo que el recuadro (`min-h-0`: no crece con el contenido), así una pantalla puede ocupar justo ese alto con `h-full`
              y repartirlo entre columnas que scrollean por dentro; una pantalla más larga lo desborda y es el recuadro el que scrollea. En el celular crece con el contenido. */}
          <div id="contenido" tabIndex={-1} className={cx('w-full min-w-0 flex-1 outline-none min-[1101px]:min-h-0 [&>*]:min-w-0', !contentScrollable && 'min-h-0')}>
            <ShellMenuContext.Provider value={menu}>{children}</ShellMenuContext.Provider>
          </div>
        </div>
        {/* El pie queda afuera del recuadro que scrollea: en escritorio está siempre a la vista, abajo, con el mismo alto en todas las pantallas. */}
        {immersive ? null : <AppFooter className="min-[1101px]:py-2" />}
      </div>
      {/* La mesa a pantalla completa (práctica y duelo) trae sus propios controles abajo: sin barra. */}
      {immersive ? null : <MobileTabBar groups={groups} activeKey={activeKey} openKey={openGroupKey} onOpen={(key) => {
          if (openGroupKey !== key) onSheetOpen?.(key)
          setOpenGroupKey((current) => (current === key ? null : key))
        }} className="min-[1101px]:hidden" />}
      <GroupSheet
        group={groups.find((group) => group.key === openGroupKey) ?? null}
        activeKey={activeKey}
        onClose={closeGroup}
        onSelect={(key) => {
          onSelect(key)
          closeGroup()
        }}
      />
      {/* La hamburguesa abre el menú entero: los destinos (también con la barra de abajo a la vista, que a veces el navegador tapa) y, abajo, los ajustes. */}
      <NavDrawer isOpen={drawerOpen} onClose={closeDrawer} nav={{ groups, activeKey, onSelect, searchAvailable }} />
    </div>
  )
}
