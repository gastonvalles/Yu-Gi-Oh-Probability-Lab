import { useSyncExternalStore } from 'react'

/**
 * La paleta de la app: `carbon` (la de fábrica) o `indigo` (la de antes de `85dc26c0`). Se elige en el menú (`ui/PaletteSwitcher`), se recuerda en el navegador y se aplica con
 * `data-palette` en el elemento html (el bloque `:root[data-palette='indigo']` de `index.css` pisa los valores). Carbón no lleva atributo. `public/palette.js` hace lo mismo antes del
 * primer pintado (misma clave: ojo si la cambiás). No siguen a la paleta, a propósito, lo que se comparte o se instala: la imagen del deck, `theme-color` y el manifest.
 */
export const PALETTES = ['carbon', 'indigo'] as const
export type Palette = (typeof PALETTES)[number]

export const PALETTE_KEY = 'ygo-lab:palette'

function read(): Palette {
  try {
    return localStorage.getItem(PALETTE_KEY) === 'indigo' ? 'indigo' : 'carbon'
  } catch {
    return 'carbon'
  }
}

let current: Palette = read()
const listeners = new Set<() => void>()

/** Pone o saca el atributo del html. Se llama al arrancar (`main.tsx`) y en cada cambio. */
export function applyPalette(palette: Palette = current): void {
  if (palette === 'indigo') document.documentElement.setAttribute('data-palette', 'indigo')
  else document.documentElement.removeAttribute('data-palette')
}

export function setPalette(next: Palette): void {
  if (current === next) return

  current = next
  applyPalette(next)
  listeners.forEach((listener) => listener())

  try {
    localStorage.setItem(PALETTE_KEY, next)
  } catch {
    // Sin almacenamiento (ventana privada, cuota): la paleta vale hasta recargar.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePalette(): Palette {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => 'carbon',
  )
}
