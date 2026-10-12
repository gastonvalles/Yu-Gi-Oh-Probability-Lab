import { useLayoutEffect, useState, type RefObject } from 'react'

/** Ancho actual de un elemento (se mide antes de pintar y se actualiza al redimensionar). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current

    if (!element) {
      return
    }

    setWidth(element.clientWidth)

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}
