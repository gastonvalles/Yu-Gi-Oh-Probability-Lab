import type { CSSProperties } from 'react'
import { THEIR_HAND } from '../duel/their-hand'

/** El celular en vertical: menos de 640 px de ancho (el corte `sm` de Tailwind), donde el campo del duelo tiene cinco columnas (`DUEL_AREAS_COMPACT`). */
export const COMPACT_FIELD_MEDIA_QUERY = '(max-width: 639.98px)'

/** La casilla más grande que cabe a lo ancho: la pantalla menos las orillas de la columna (12 px) y los cuatro huecos del campo (16 px), en cinco. */
const CELL_BY_WIDTH = 'calc((100vw - 1.75rem) / 5)'

/** La casilla más chica que se permite (48 px, casi lo de antes de las cinco columnas): abajo de esto la columna scrollea hasta la mano. */
const CELL_FLOOR = '3rem'

/**
 * El campo del duelo en un celular en vertical, a la medida del alto de la pantalla (Gastón, 2026-10-20, ya con las cinco columnas: «no se ven las cartas de nuestra mano, el campo quedó muy abajo»; «subí el cartel, las manos y el campo un poco»; «evita el espacio muerto»).
 * Son siete filas (tres del rival, la del medio y tres tuyas): el campo mide `7 casillas + 24 px`, y arriba y abajo de él hay lo que no se achica (la barra de arriba, la mano del rival y tu mano). La línea de jugadas no ocupa lugar: flota sobre la mano del rival (ver `DuelBar`).
 * La casilla es la más grande que cabe a lo ancho **y** deja tu mano entera arriba de la barra de abajo (que queda donde está): 67 px a 844 px de alto, los 72 px del ancho desde unos 870 px y nunca menos de 48 px (ahí la columna scrollea).
 *
 * - Vista 3D: la perspectiva achica lo lejano hacia el borde de abajo (el origen de la inclinación), así que el campo se ve más abajo de donde lo deja el diseño, y la mano del rival, que cuelga de su borde de arriba, casi 100 px más abajo.
 *   Ese hueco se le quita al lugar que se le reserva (`marginTop`: lo que la perspectiva la corre, `166 px - 1,8 × casilla`, medido), así queda pegada a la barra de arriba (la línea de jugadas le tapa unos 22 px del borde) y no hay una franja vacía. Tu mano queda a `304 px + 5,2 × casilla` del borde de arriba.
 * - Vista de arriba: sin inclinación no hay hueco que quitar; la mano del rival conserva su lugar (20 px más abajo que sin la línea de jugadas, que le tapa el borde de arriba) y la tuya queda a `260 px + 7 × casilla`.
 * Para que tu mano se vea entera hay que dejar 190 px del alto (la barra de abajo, 64 px, y la carta, 126): 30,9 rem = 190 + 304 px y 28,1 rem = 190 + 260 px.
 *
 * Los números salen de medir el duelo a 390 × 844 con cuatro tamaños de casilla y de la fórmula de la perspectiva (`--field-perspective`: 900 px, 14°). El campo se centra: con la casilla más chica queda más angosto que la pantalla.
 */
export function compactDuelFieldStyle(tilted: boolean): CSSProperties {
  const cell = `min(${CELL_BY_WIDTH}, max(${CELL_FLOOR}, calc((100dvh - ${tilted ? '30.9rem' : '28.1rem'}) / ${tilted ? '5.2' : '7'})))`

  return {
    '--cell-m': cell,
    width: 'calc(var(--cell-m) * 5 + 1rem)',
    maxWidth: '100%',
    marginInline: 'auto',
    marginTop: tilted ? 'max(0px, calc(10.4rem - 1.8 * var(--cell-m)))' : THEIR_HAND.mobile.room + 20,
  } as CSSProperties
}

/**
 * El campo del duelo de 640 a 1100 px (tablet, laptop chica, ventana angosta): siete columnas, como en escritorio, pero sin `--cell`, así que la casilla salía del ancho (169 px a 1100 × 760) y el campo
 * terminaba en y = 1097, con tu mano fuera de la pantalla. Ahora la casilla es la más grande que cabe a lo ancho **y** deja el campo y tu mano enteros en el alto (nunca menos de 56 px: ahí la columna scrollea).
 * Lo que no es campo, medido a 640, 900 y 1100 px: la barra de arriba (144 px) y el aire hasta el grupo (8), tu mano (153 y 8 de aire), el margen del grupo (48), la barra de abajo (44) y sus 16 px: 421 px.
 * - Vista 3D (26°, perspectiva de 900 px): la inclinación deja arriba del campo una franja vacía de unos `2 × casilla - 50 px` (exacto de 60 a 120 px de casilla, 20 px de menos a 160); se le quita al
 *   lugar de la mano del rival (`marginTop`, puede ser negativo: esa franja no se ve ni se toca), así el campo se ve a 102 px del grupo como en la vista de arriba. Total: 589 px + 3 casillas (37 rem, con aire).
 * - Vista de arriba: el lugar de la mano del rival queda como estaba; total 539 px + 5 casillas (34 rem).
 * El `%` del ancho y del `marginTop` es el ancho de la columna (sin la barra de scroll).
 */
export function mediumDuelFieldStyle(tilted: boolean): CSSProperties {
  const cell = `min(calc((100% - 1.5rem) / 6.3714), max(3.5rem, calc((100dvh - ${tilted ? '37rem' : '34rem'}) / ${tilted ? 3 : 5})))`

  return {
    '--cell-m': cell,
    width: 'calc(var(--cell-m) * 6.3714 + 1.5rem)',
    marginInline: 'auto',
    marginTop: tilted ? 'calc(9.5rem - 2 * var(--cell-m))' : THEIR_HAND.mobile.room,
  } as CSSProperties
}
