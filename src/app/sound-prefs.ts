import { useSyncExternalStore } from 'react'

/**
 * Si los sonidos del duelo están prendidos (las jugadas, las vidas, el chat, el reloj): vienen prendidos y se apagan desde «Más opciones» de la barra del duelo o desde el botón
 * «Sonidos» de la barra de la práctica (las mismas jugadas suenan en «Jugar solo»). Se recuerda en el navegador. No toca las alarmas de la calculadora de LP (esas las pide quien las programa).
 */
const KEY = 'ygo-lab:duel-sounds'

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

let on = read()
const listeners = new Set<() => void>()

export const soundsOn = (): boolean => on

export function setSoundsOn(next: boolean): void {
  if (on === next) {
    return
  }

  on = next

  try {
    localStorage.setItem(KEY, next ? 'on' : 'off')
  } catch {
    // Sin almacenamiento (ventana privada): vale hasta recargar.
  }

  listeners.forEach((listener) => listener())
}

export function useSoundsOn(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    () => on,
    () => true,
  )
}
