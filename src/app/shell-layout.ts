import { useSyncExternalStore } from 'react'

/** El menú lateral abierto es de 15 rem (240 px); contraído, una columna de íconos de 4.75 rem (76 px). */
export const SIDEBAR_PX = { expanded: 240, collapsed: 76 } as const

/** Desde este ancho de ventana hay menú lateral fijo; más angosta, barra de arriba con cajón (es el mismo corte de `DESKTOP_DECK_BUILDER_MEDIA_QUERY`). */
const DESKTOP_MIN_PX = 1101
/** Sin haber elegido todavía, en una ventana más angosta que esto el menú arranca contraído: las pantallas no quedan apretadas. */
const COMPACT_BELOW_PX = 1400
/** La barra de abajo del celular (`MobileTabBar`: 4 rem, sin contar el borde seguro del teléfono). */
export const TAB_BAR_PX = 64
/** Lo que ocupa el pie abajo en escritorio (su alto, con un respiro). */
const FOOTER_RESERVE_PX = 64
const SIDEBAR_KEY = 'ygo-lab:sidebar-collapsed'

export function readSidebarCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_KEY)

    if (stored !== null) return stored === '1'
  } catch {
    // Sin almacenamiento: decide el ancho de la ventana.
  }

  return window.innerWidth < COMPACT_BELOW_PX
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  } catch {
    // Sin almacenamiento: el menú se queda como esté hasta recargar.
  }
}

/** Lo que el armazón deja ocupado en la pantalla (px): el menú lateral a la izquierda y el pie abajo. */
interface ShellInsets {
  left: number
  bottom: number
}

export const NO_SHELL_INSETS: ShellInsets = { left: 0, bottom: 0 }

/** En el celular no hay menú fijo ni pie fijo: sólo queda reservada la barra de abajo (que la mesa a pantalla completa esconde). */
export function shellInsetsFor(collapsed: boolean, desktop: boolean, tabBar = true): ShellInsets {
  if (desktop) return { left: collapsed ? SIDEBAR_PX.collapsed : SIDEBAR_PX.expanded, bottom: FOOTER_RESERVE_PX }

  return tabBar ? { left: 0, bottom: TAB_BAR_PX } : NO_SHELL_INSETS
}

// Arranca ya con lo que va a ocupar al dibujarse (no hay que esperar a que el armazón avise): así los botones flotantes y la mascota
// nacen en su lugar y no saltan en el primer cuadro.
let insets = typeof window === 'undefined' ? NO_SHELL_INSETS : shellInsetsFor(readSidebarCollapsed(), window.innerWidth >= DESKTOP_MIN_PX)
const listeners = new Set<() => void>()

/** El armazón avisa cuánto ocupa: los botones flotantes se llevan sólo por el espacio que queda libre, y las mascotas arrancan ahí (después se las puede dejar en cualquier lugar). */
export function setShellInsets(next: ShellInsets): void {
  if (next.left === insets.left && next.bottom === insets.bottom) {
    return
  }

  insets = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useShellInsets(): ShellInsets {
  return useSyncExternalStore(
    subscribe,
    () => insets,
    () => NO_SHELL_INSETS,
  )
}
