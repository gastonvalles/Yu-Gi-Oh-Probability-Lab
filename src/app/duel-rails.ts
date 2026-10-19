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
/** Lo que no es campo en la mesa con la barra de arriba y la de abajo (24,75 rem): de ahí sale el tamaño de la casilla sin laterales. */
const CLASSIC_CHROME_PX = 24.75 * REM_PX
const CELL_MIN_PX = 3.5 * REM_PX
const CELL_MAX_PX = 9.5 * REM_PX

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
