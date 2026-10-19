import { useSyncExternalStore } from 'react'

/**
 * El modo «ventana grande» del duelo: el duelo ocupa toda la pantalla (sin el menú lateral) y, donde el navegador lo permite, el navegador mismo pasa a pantalla completa
 * (la API de pantalla completa; con F11 también se puede, y el botón sólo esconde el menú). Es de la mesa: se apaga al salir de ella, y Escape (que el navegador usa para salir de la
 * pantalla completa) lo apaga también.
 *
 * Vive fuera de React (como la mascota): lo escribe el botón de la mesa y lo lee el armazón, que está más arriba en el árbol.
 */
let active = false
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())

function set(next: boolean) {
  if (active === next) {
    return
  }

  active = next
  notify()
}

const canFullscreen = () => typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false

/** Si el navegador deja pasar a pantalla completa (si no, el botón sólo esconde el menú lateral). */
export const fullscreenSupported = canFullscreen

if (typeof document !== 'undefined') {
  // Escape (o salir por otro lado) apaga el modo: el estado sigue a lo que el navegador hace.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      set(false)
    }
  })
}

/** Prende el modo (y la pantalla completa del navegador si se puede) o lo apaga. Un rechazo del navegador (sin gesto del usuario) deja el modo prendido: el menú se esconde igual. */
export function setDuelFullscreen(on: boolean): void {
  set(on)

  if (typeof document === 'undefined') {
    return
  }

  if (on && canFullscreen() && !document.fullscreenElement) {
    void document.documentElement.requestFullscreen().catch(() => undefined)
  } else if (!on && document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined)
  }
}

export const toggleDuelFullscreen = () => setDuelFullscreen(!active)

export function useDuelFullscreen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    () => active,
    () => false,
  )
}
