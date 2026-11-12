import { useSyncExternalStore } from 'react'

/**
 * Cómo salen las preguntas y los menús del duelo automático: `docked` (de fábrica) las apoya sobre tu mano como una hoja y `floating` las vuelve una ventana con barra para arrastrar y esquina
 * para estirar, también en el celular («Menús flotantes» de Opciones, en medio del duelo). Se recuerda en el navegador. Cada ventana guarda su lugar aparte en el celular y en escritorio (`autoWindowKey`).
 */
export type MatMenus = 'docked' | 'floating'

export const MAT_MENUS_KEY = 'ygo-lab:mat-menus'

function read(): MatMenus {
  try {
    return localStorage.getItem(MAT_MENUS_KEY) === 'floating' ? 'floating' : 'docked'
  } catch {
    return 'docked'
  }
}

let current: MatMenus = read()
const listeners = new Set<() => void>()

export function setMatMenus(next: MatMenus): void {
  if (current === next) return
  current = next
  listeners.forEach((listener) => listener())

  try {
    if (next === 'floating') localStorage.setItem(MAT_MENUS_KEY, next)
    else localStorage.removeItem(MAT_MENUS_KEY)
  } catch {
    // Sin almacenamiento (ventana privada, cuota): vale hasta recargar.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMatMenus(): MatMenus {
  return useSyncExternalStore(subscribe, () => current, () => 'docked')
}

