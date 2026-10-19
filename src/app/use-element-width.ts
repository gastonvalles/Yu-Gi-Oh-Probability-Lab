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

/** Ancho actual de un elemento (se mide antes de pintar y se actualiza al redimensionar). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  return useElementSize(ref).width
}
