import { useLayoutEffect, useState, type RefObject } from 'react'

/** Ancho y alto actuales de un elemento (se miden antes de pintar y se actualizan al redimensionar). */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current

    if (!element) {
      return
    }

    const measure = () => setSize((current) => (current.width === element.clientWidth && current.height === element.clientHeight ? current : { width: element.clientWidth, height: element.clientHeight }))

    measure()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}

/**
 * Si un elemento cumple una condición de tamaño (`fits(ancho, alto)`, una función estable): como `useElementSize`, pero vuelve a dibujar sólo cuando cambia la respuesta, no con cada píxel
 * (arrastrar el borde de un panel de la mesa le cambia el ancho a la columna en cada cuadro, y la mesa es enorme).
 */
export function useElementFits(ref: RefObject<HTMLElement | null>, fits: (width: number, height: number) => boolean): boolean {
  const [fit, setFit] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current

    if (!element) {
      return
    }

    const measure = () => setFit(fits(element.clientWidth, element.clientHeight))

    measure()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, fits])

  return fit
}

/** Ancho actual de un elemento (se mide antes de pintar y se actualiza al redimensionar). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  return useElementSize(ref).width
}
