import { createContext, useContext } from 'react'

/**
 * Los laterales del duelo (escritorio ancho): cuando la ventana sobra de ancho, lo que rodea al campo (vidas, relojes, el turno, los botones, los avisos y las acciones del rival)
 * se acomoda en dos columnas a sus costados en vez de arriba y abajo: no tapa el campo y el campo gana alto. La mesa mide su columna y se lo avisa a la barra por contexto.
 */
export const DuelRailsContext = createContext(false)

export const useDuelRails = (): boolean => useContext(DuelRailsContext)

const REM_PX = 16
/** Lo mínimo que mide cada lateral: entran los cinco íconos de la barra (de 40 px) en una fila. */
const RAIL_MIN_PX = 13 * REM_PX
/** El aire entre un lateral y el campo. */
const RAIL_GAP_PX = 16
/** Lo que mide el campo con las cartas en su tamaño: cinco columnas y dos laterales de 0,6857, más los seis espacios entre columnas. */
const FIELD_CELLS = 5 + 2 * 0.6857
const FIELD_GAPS_PX = 6 * 8
/** El aire de los costados de la columna de la mesa (`px-4`). */
const COLUMN_PAD_PX = 32
/** Lo que no es campo en la mesa con la barra de arriba y la de abajo (30,45 rem: la barra de arriba, las dos manos —que no tapan el campo— y la de abajo): de ahí sale el tamaño de la casilla sin laterales. */
const CLASSIC_CHROME_PX = 30.45 * REM_PX
const CELL_MIN_PX = 3.5 * REM_PX
const CELL_MAX_PX = 12 * REM_PX

/**
 * Lo que se reserva de ancho a los dos costados al agrandar la vista 3D con laterales: sólo el aire. Lo ancho del campo es su borde de abajo, que queda entre las vidas de abajo y las manos, y arriba, donde están
 * los laterales, la perspectiva lo angosta: no se tocan.
 */
export const RAILS_SIDE_RESERVE_PX = 2 * (RAIL_GAP_PX + 32)

/** Cuánto se puede agrandar a lo sumo la vista 3D (más que eso las cartas pasan a verse mal de grandes). */
export const FIELD_ZOOM_MAX = 1.6

/**
 * Cuánto agrandar la vista 3D del campo para que ocupe el lugar que tiene (Gastón, 2026-10-19: «no se aprovecha el alto, la profundidad ni el ancho general de la vista»): la inclinación le saca alto y
 * perspectiva le achica el fondo, así que el campo queda chico en una columna grande. `width` y `height` son lo que ocupa a tamaño natural (el borde de abajo, que no se mueve, y el de arriba ya achicado) y
 * `availWidth` y `availHeight` lo que tiene a disposición (el alto, hacia arriba desde el borde de abajo). Se agranda parejo, hasta donde entra a lo ancho y a lo alto, sin achicarlo nunca.
 */
export function fieldZoom({ width, height, availWidth, availHeight }: { width: number; height: number; availWidth: number; availHeight: number }): number {
  if (!(width > 0) || !(height > 0)) return 1

  return Math.min(FIELD_ZOOM_MAX, Math.max(1, Math.min(availWidth / width, availHeight / height)))
}

/** Cuánto mide la casilla del campo con la barra arriba y abajo, en una columna de ese alto (px). */
export function classicCell(height: number): number {
  return Math.min(CELL_MAX_PX, Math.max(CELL_MIN_PX, (height - CLASSIC_CHROME_PX) / 5))
}

/**
 * Si la columna de la mesa (px de ancho y de alto) tiene lugar para los dos laterales sin achicar el campo respecto de cómo se vería con la barra arriba y abajo:
 * en una ventana angosta (o con el menú y el chat abiertos) sigue la disposición de siempre.
 */
export function railsFit(width: number, height: number): boolean {
  return width > 0 && width >= COLUMN_PAD_PX + 2 * (RAIL_MIN_PX + RAIL_GAP_PX) + FIELD_GAPS_PX + FIELD_CELLS * classicCell(height)
}

/** Lo que importa de un rectángulo de la pantalla (un `DOMRect`). */
interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Dónde va (su `top`) la pregunta del medio de la mesa (`duel.prompt`) para no tapar lo que hay que tocar (`obstacles`: lo que brilla para responder, la tira de un visor), entre `min` y `max`.
 * Si no tapa nada, se queda; si tapa, sube lo justo (hacia el campo del rival, donde no hay nada tuyo que tocar) y, si arriba no entra, baja. Sin lugar en ninguno de los dos, null.
 */
export function promptTop(prompt: Box, obstacles: readonly Box[], min: number, max: number, gap = 8): number | null {
  const height = prompt.bottom - prompt.top
  const hits = (top: number) => obstacles.filter((box) => box.left < prompt.right && box.right > prompt.left && box.top < top + height && box.bottom > top)
  const slide = (up: boolean): number | null => {
    let top = prompt.top

    for (let step = 0; step <= obstacles.length; step += 1) {
      const hit = hits(top)

      if (hit.length === 0) return top >= min && top + height <= max ? top : null
      top = up ? Math.min(...hit.map((box) => box.top)) - gap - height : Math.max(...hit.map((box) => box.bottom)) + gap
    }

    return null
  }

  return slide(true) ?? slide(false)
}

/**
 * En el celular la pregunta termina arriba de tus monstruos (`floor`: el borde de arriba de su fila, con `gap`) y crece hacia el campo del rival: tu campo y la mano quedan a la vista. Si tapa algo que
 * brilla, sólo sube (`promptTop` con `floor` de tope); sin lugar entre `min` y tus monstruos, null (va por la ranura de siempre).
 */
export function promptAbove(prompt: Box, obstacles: readonly Box[], min: number, floor: number, gap = 8): number | null {
  const bottom = floor - gap

  return promptTop({ ...prompt, top: bottom - (prompt.bottom - prompt.top), bottom }, obstacles, min, bottom, gap)
}
