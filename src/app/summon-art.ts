import { useSyncExternalStore } from 'react'

/**
 * «Imagen de la carta al invocar (beta)», de Opciones del duelo (el ⚙ del automático y «La mesa» del ⋯ de la mesa manual y del duelo por enlace): la imagen de un monstruo irrumpe en grande la
 * primera vez que se invoca en el duelo. Apagada de fábrica; se recuerda en el navegador. Lo vigila `summon-art.test.tsx`.
 */
export const SUMMON_ART_KEY = 'ygo-lab:summon-art'

function read(): boolean {
  try {
    return localStorage.getItem(SUMMON_ART_KEY) === 'on'
  } catch {
    return false
  }
}

let current = read()
const listeners = new Set<() => void>()

/** Para leerla fuera de un dibujo (el efecto de la mesa que lanza la irrupción). */
export const summonArtOn = () => current

export function setSummonArt(next: boolean): void {
  if (current === next) return
  current = next
  listeners.forEach((listener) => listener())

  try {
    if (next) localStorage.setItem(SUMMON_ART_KEY, 'on')
    else localStorage.removeItem(SUMMON_ART_KEY)
  } catch {
    // Sin almacenamiento (ventana privada, cuota): vale hasta recargar.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSummonArt(): boolean {
  return useSyncExternalStore(subscribe, () => current, () => false)
}
