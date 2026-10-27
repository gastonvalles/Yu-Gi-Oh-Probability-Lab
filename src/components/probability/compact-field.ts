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
 * Sin la fila de abajo (`bottomRow: false`, «Jugar solo automático» con el marcador arriba, 2026-10-27) la mano llega hasta el borde de abajo de la columna, sin scroll: 29,2 y 27 rem (medido a 360 × 740, 390 × 844,
 * 412 × 915 y 430 × 932); con menos de 700 px de alto (`short`), la casilla desde 36 px y la mano del rival al 72 %, que deja 24 px.
 *
 * Los números salen de medir el duelo a 390 × 844 con cuatro tamaños de casilla y de la fórmula de la perspectiva (`--field-perspective`: 900 px, 14°). El campo se centra: con la casilla más chica queda más angosto que la pantalla.
 */
export function compactDuelFieldStyle(tilted: boolean, { bottomRow = true, short = false }: CompactFieldOptions = {}): CSSProperties {
  // Sin la fila de abajo lo que no es campo baja de 30,9 a 29,2 rem (3D) y de 28,1 a 27 (de arriba); en una pantalla baja, además, la mano del rival al 72 % (24 px menos) y la casilla desde 36 px:
  // 28 y 25,8 rem (medido a 360 × 640 y 390 × 664; la perspectiva no es lineal y deja 4 px menos que la cuenta).
  const rest = bottomRow ? (tilted ? 30.9 : 28.1) : short ? (tilted ? 28 : 25.8) : tilted ? 29.2 : 27
  // La vista de arriba tiene siete filas (no cinco y media): sin la fila de abajo su casilla baja hasta 44 px (32 en una pantalla baja), o a 360 px de ancho la columna scrollearía.
  const floor = bottomRow ? CELL_FLOOR : short ? (tilted ? SHORT_CELL_FLOOR : '2rem') : tilted ? CELL_FLOOR : '2.75rem'
  const cell = `min(${CELL_BY_WIDTH}, max(${floor}, calc((100dvh - ${rest}rem) / ${tilted ? '5.2' : '7'})))`
  const lift = !bottomRow && short ? SHORT_RIVAL_SAVE_REM : 0

  return {
    '--cell-m': cell,
    width: 'calc(var(--cell-m) * 5 + 1rem)',
    maxWidth: '100%',
    marginInline: 'auto',
    marginTop: tilted ? (lift ? `calc(max(0px, calc(10.4rem - 1.8 * var(--cell-m))) - ${lift}rem)` : 'max(0px, calc(10.4rem - 1.8 * var(--cell-m)))') : THEIR_HAND.mobile.room + 20 - lift * 16,
  } as CSSProperties
}

/** Una pantalla baja (menos de 700 px de alto: un celular chico con la barra del navegador). */
export const SHORT_SCREEN_MEDIA_QUERY = '(max-height: 699.98px)'
/** En una pantalla baja sin fila de abajo: la casilla más chica (36 px) y lo que deja la mano del rival al 72 % (24 px). */
const SHORT_CELL_FLOOR = '2.25rem'
const SHORT_RIVAL_SAVE_REM = 1.5

export interface CompactFieldOptions {
  /** La fila de abajo con tus vidas (sin ella: «Jugar solo automático», con las vidas en el marcador de la barra). */
  bottomRow?: boolean
  /** Pantalla baja (`SHORT_SCREEN_MEDIA_QUERY`): sólo sin la fila de abajo. */
  short?: boolean
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
