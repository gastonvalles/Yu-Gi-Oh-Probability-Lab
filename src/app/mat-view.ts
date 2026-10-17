import { useSyncExternalStore } from 'react'

/**
 * Cómo se ve el campo de la mesa: `3d` lo inclina hacia atrás con una perspectiva suave (lo lejano se achica y lo cercano queda grande, al alcance del pulgar) y
 * `top` lo deja plano, visto de arriba, para jugar con precisión. Vale para la práctica y para el duelo y se recuerda en el navegador.
 */
export type MatView = 'top' | '3d'

export const MAT_VIEW_KEY = 'ygo-lab:mat-view'

function read(): MatView {
  try {
    return localStorage.getItem(MAT_VIEW_KEY) === 'top' ? 'top' : '3d'
  } catch {
    return '3d'
  }
}

let current: MatView = read()
const listeners = new Set<() => void>()

export function setMatView(next: MatView): void {
  if (current === next) {
    return
  }

  current = next
  listeners.forEach((listener) => listener())

  try {
    localStorage.setItem(MAT_VIEW_KEY, next)
  } catch {
    // Sin almacenamiento (ventana privada, cuota): la vista vale hasta recargar.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMatView(): MatView {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => '3d',
  )
}
