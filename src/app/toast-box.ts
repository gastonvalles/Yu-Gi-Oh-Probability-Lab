import { useEffect, useSyncExternalStore, type RefObject } from 'react'

/** El recuadro de la pantalla (px) donde se apoyan los avisos, en lugar de abajo al centro. */
export interface ToastBox {
  left: number
  top: number
  width: number
  height: number
}

let box: ToastBox | null = null
const listeners = new Set<() => void>()

function setToastBox(next: ToastBox | null) {
  if (box === next || (box && next && box.left === next.left && box.top === next.top && box.width === next.width && box.height === next.height)) {
    return
  }

  box = next
  listeners.forEach((listener) => listener())
}

/** Lo que dejó puesto el duelo en escritorio ancho (su lateral izquierdo), o null: los avisos van abajo al centro, como siempre. */
export function useToastBox(): ToastBox | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    () => box,
    () => null,
  )
}

/** Mientras `enabled` y el elemento está en pantalla, los avisos de toda la app se apoyan adentro suyo (se vuelve a medir al cambiar el tamaño de la ventana o del elemento). */
export function useHostToasts(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const element = ref.current

    if (!enabled || !element) {
      return
    }

    const measure = () => {
      const rect = element.getBoundingClientRect()

      setToastBox({ left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) })
    }

    measure()
    window.addEventListener('resize', measure)

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)

    observer?.observe(element)

    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
      setToastBox(null)
    }
  }, [ref, enabled])
}
