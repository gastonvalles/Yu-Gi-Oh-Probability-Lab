import { useLayoutEffect, useState } from 'react'

/** Lo que mide una casilla del campo: `layout` es su lado en px de diseño (no cambia con la inclinación 3D) y `visible` el alto que se ve de una casilla de magias y trampas propia (más chico en la vista 3D: el campo se achica hacia el fondo). */
export interface FieldCell {
  layout: number
  visible: number
}

const NO_CELL: FieldCell = { layout: 0, visible: 0 }

/**
 * Cuánto mide una casilla del campo. La mesa lo usa para superponer las manos con la zona de magias y trampas sin pasar de un porcentaje de ella (las del rival, sobre su zona, y la
 * propia, sobre la suya). Recibe el elemento (no una referencia: la grilla puede aparecer después de que la pantalla se arma) y se vuelve a medir cuando cambia `again` (la vista 3D
 * no cambia el tamaño del elemento, sólo cómo se ve). 0 hasta que se mide.
 */
export function useFieldCell(field: HTMLElement | null, again: unknown): FieldCell {
  const [cell, setCell] = useState<FieldCell>(NO_CELL)

  useLayoutEffect(() => {
    if (!field) {
      return
    }

    const measure = () => {
      const layout = Number.parseFloat(getComputedStyle(field).gridTemplateColumns.split(' ')[1] ?? '')
      const visible = field.querySelector<HTMLElement>('[data-drop^="st:"]')?.getBoundingClientRect().height ?? layout

      setCell((current) => {
        const next = { layout: Number.isFinite(layout) ? layout : 0, visible: Number.isFinite(visible) ? visible : 0 }

        return current.layout === next.layout && current.visible === next.visible ? current : next
      })
    }

    measure()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(measure)

    observer.observe(field)

    return () => observer.disconnect()
  }, [field, again])

  return cell
}
