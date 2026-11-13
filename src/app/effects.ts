import { useSyncExternalStore } from 'react'

/**
 * «Efectos» (☰, `EffectsSwitcher` de `ui/PaletteSwitcher`): `full` (de fábrica) o `lite`, el interruptor de calidad del documento «Impacto Ligero» para un celular flojo: menos destellos a la vez, sin
 * sacudida ni mezcla aditiva y la misma respuesta al toque. Se recuerda en el navegador y se aplica con `data-effects='lite'` en el html (la variante `fx-lite:` de `index.css`).
 * Completos no lleva atributo. Movimiento reducido manda sobre esto: sin rebote ni sacudida, con fundidos (`motion-reduce:`). Como `app/palette.ts`.
 */
export const EFFECTS = ['full', 'lite'] as const
export type Effects = (typeof EFFECTS)[number]

export const EFFECTS_KEY = 'ygo-lab:effects'

function read(): Effects {
  try {
    return localStorage.getItem(EFFECTS_KEY) === 'lite' ? 'lite' : 'full'
  } catch {
    return 'full'
  }
}

let current: Effects = read()
const listeners = new Set<() => void>()

/** Pone o saca el atributo del html. Se llama al arrancar (`main.tsx`, antes de pintar la app) y en cada cambio. */
export function applyEffects(effects: Effects = current): void {
  if (effects === 'lite') document.documentElement.setAttribute('data-effects', 'lite')
  else document.documentElement.removeAttribute('data-effects')
}

export function setEffects(next: Effects): void {
  if (current === next) return

  current = next
  applyEffects(next)
  listeners.forEach((listener) => listener())

  try {
    localStorage.setItem(EFFECTS_KEY, next)
  } catch {
    // Sin almacenamiento: vale hasta recargar.
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useEffects = (): Effects => useSyncExternalStore(subscribe, () => current, () => 'full')
