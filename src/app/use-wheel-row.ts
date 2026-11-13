import { useEffect, type RefObject } from 'react'

/** Cuánto mueve un renglón de la rueda (`deltaMode` 1, Firefox) y una página (2). */
const LINE = 16

/**
 * El paso de la rueda vertical en una fila que sólo se desliza de costado (con el mouse en escritorio): `scrollLeft` que le toca, o null si no es para ella (no se desliza, ya está en ese
 * borde: la rueda sigue con lo de afuera, el cuerpo del menú que la contiene con `overscroll-contain`; o el gesto ya es de costado: Mayús+rueda o la rueda horizontal de un trackpad).
 */
export function wheelRowStep(row: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth' | 'clientHeight'>, event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'shiftKey'>): number | null {
  const max = row.scrollWidth - row.clientWidth

  if (max <= 0 || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return null
  const delta = event.deltaY * (event.deltaMode === 1 ? LINE : event.deltaMode === 2 ? row.clientHeight : 1)
  const next = Math.min(max, Math.max(0, row.scrollLeft + delta))

  return next === row.scrollLeft ? null : next
}

/**
 * La rueda vertical mueve de costado la fila de `ref` (la bandeja de cartas, las impresiones de una carta) mientras se pueda mover, sin mover lo de atrás. Nativo y no pasivo (el
 * `onWheel` de React lo es): hace falta `preventDefault`. Con el dedo no hay rueda: el celular no cambia.
 */
export function useWheelRow(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const row = ref.current

    if (!row || !enabled) return
    const onWheel = (event: WheelEvent) => {
      const next = wheelRowStep(row, event)

      if (next === null) return
      event.preventDefault()
      row.scrollLeft = next
    }

    row.addEventListener('wheel', onWheel, { passive: false })

    return () => row.removeEventListener('wheel', onWheel)
  }, [ref, enabled])
}
