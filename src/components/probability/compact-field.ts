import type { CSSProperties } from 'react'
import { THEIR_HAND } from '../duel/their-hand'

/** El celular en vertical: menos de 640 px de ancho (el corte `sm` de Tailwind), donde la geometría del duelo es fija (`phoneDuelLayout`). El campo tiene siete columnas en todos los anchos. */
export const COMPACT_FIELD_MEDIA_QUERY = '(max-width: 639.98px)'

/** La orilla de la columna (`max-sm:px-1`) y el hueco entre casillas (`max-sm:gap-0.75`) en el celular. */
const PHONE_EDGE = 4
const PHONE_GAP = 3
/** Cinco casillas y las dos columnas de los costados (0,6857 de una casilla cada una). */
const FIELD_CELLS = 6.3714
/** La vista 3D del celular (`index.css`: 14°, perspectiva de 900 px, estirada 1 / cos). */
const TILT = (14 * Math.PI) / 180
const PERSPECTIVE = 900
/** Tu mano (`PracticeHand`): las cartas se enciman al 55 % (cinco entran en 3,2 cartas), su caja suma 30 px a la carta y la carta es 1 : 1,4612. */
const HAND_FIT = 3.2
const HAND_ROOM = 30
const CARD_RATIO = 1.4612
const HAND_CARD_MAX = 140
const HAND_CARD_MIN = 64
/** La línea (`data-duel-line`): entre 56 y 96 px. */
const LINE_MIN = 56
const LINE_MAX = 96

export interface PhoneDuelOptions {
  tilted: boolean
  /** Lo de arriba del campo que no es suyo: la barra de la pantalla (con el marcador). */
  bar: number
  /** El lugar de la mano del rival arriba del campo (su caja y su aire). */
  rival: number
  /** Lo de abajo de tu mano: el margen de la columna y, si la hay, la fila de abajo. */
  bottom: number
}

export interface PhoneDuelLayout {
  /** La casilla (px) y el campo: ancho, alto, la `y` de su caja y la que se ve (en 3D la perspectiva baja su borde de arriba `drop` px). */
  cell: number
  fieldWidth: number
  fieldHeight: number
  fieldBoxTop: number
  fieldTop: number
  drop: number
  rivalTop: number
  lineTop: number
  lineHeight: number
  /** El aire entre la línea y tu mano (lo que sobra va ahí: nunca arriba del campo). */
  air: number
  handTop: number
  handHeight: number
  handCard: number
  bottomTop: number
}

/**
 * La geometría del duelo en el celular (Gastón, 2026-11-10: «en mobile tenemos espacio para usar el campo default, el de desktop»; «el cartel con la info de la carta empujaría el campo y no debería»).
 * Pura: sale sólo del ancho y el alto de la pantalla (y de lo que miden la barra y la fila de abajo), nunca de lo que se muestra, así **el campo y la mano no se mueven nunca** (una carta tocada, un cartel,
 * la cadena, un aviso o las vidas apoyan encima). De arriba abajo: la barra, la mano del rival, el campo de siete columnas, la línea (alto fijo), el aire que sobre, tu mano y la fila de abajo.
 * - La casilla es la que entra a lo ancho: `(ancho − 2 orillas de 4 − 6 huecos de 3) / 6,3714` (57 px a 390, 52 a 360); el campo mide 5 casillas y 4 huecos de alto.
 * - Tu mano, la más grande que entra a lo ancho (hasta 140 px); si no queda lugar para la línea mínima, se achica (hasta 64 px; abajo de eso la columna scrollea).
 * - 3D: la perspectiva baja el borde de arriba del campo `h² tan θ / (p + h tan θ)` (23 px a 390); la mano del rival cuelga de ese borde, así que ese hueco se le quita a su lugar y lo gana la línea.
 */
export function phoneDuelLayout(width: number, height: number, { tilted, bar, rival, bottom }: PhoneDuelOptions): PhoneDuelLayout {
  const cell = (width - 2 * PHONE_EDGE - 6 * PHONE_GAP) / FIELD_CELLS
  const fieldWidth = cell * FIELD_CELLS + 6 * PHONE_GAP
  const fieldHeight = cell * 5 + 4 * PHONE_GAP
  const drop = tilted ? (fieldHeight * fieldHeight * Math.tan(TILT)) / (PERSPECTIVE + fieldHeight * Math.tan(TILT)) : 0
  const fieldTop = bar + rival
  const fieldBoxTop = fieldTop - drop
  const fieldBottom = fieldBoxTop + fieldHeight
  const fit = Math.min(HAND_CARD_MAX, (width - 2 * PHONE_EDGE) / HAND_FIT)
  const free = height - bottom - (fit * CARD_RATIO + HAND_ROOM) - fieldBottom
  const handCard = free >= LINE_MIN ? fit : Math.max(HAND_CARD_MIN, (height - bottom - LINE_MIN - fieldBottom - HAND_ROOM) / CARD_RATIO)
  const handHeight = handCard * CARD_RATIO + HAND_ROOM
  const lineHeight = Math.max(LINE_MIN, Math.min(LINE_MAX, free))
  const handTop = Math.max(fieldBottom + lineHeight, height - bottom - handHeight)

  return { cell, fieldWidth, fieldHeight, fieldBoxTop, fieldTop, drop, rivalTop: bar, lineTop: fieldBottom, lineHeight, air: handTop - fieldBottom - lineHeight, handTop, handHeight, handCard, bottomTop: handTop + handHeight }
}

/**
 * El campo del duelo de 640 a 1100 px (tablet, laptop chica, ventana angosta): siete columnas, como en escritorio, pero sin `--cell`, así que la casilla salía del ancho (169 px a 1100 × 760) y el campo
 * terminaba en y = 1097, con tu mano fuera de la pantalla. Ahora la casilla es la más grande que cabe a lo ancho **y** deja el campo y tu mano enteros en el alto (nunca menos de 56 px: ahí la columna scrollea).
 * Lo que no es campo, medido a 640, 900 y 1100 px: la barra de arriba (144 px) y el aire hasta el grupo (8), tu mano (153 y 8 de aire), el margen del grupo (48), la barra de abajo (44) y sus 16 px: 421 px.
 * - Vista 3D (26°, perspectiva de 900 px): la inclinación deja arriba del campo una franja vacía de unos `2 × casilla - 50 px` (exacto de 60 a 120 px de casilla, 20 px de menos a 160); se le quita al
 *   lugar de la mano del rival (`marginTop`, puede ser negativo: esa franja no se ve ni se toca), así el campo se ve a 102 px del grupo como en la vista de arriba. Total: 589 px + 3 casillas (37 rem, con aire).
 * - Vista de arriba: el lugar de la mano del rival queda como estaba; total 539 px + 5 casillas (34 rem).
 * Sin la fila de abajo (`bottomRow: false`, «Jugar solo automático» con el marcador arriba, 2026-10-27) se van el margen del grupo, la barra y sus 16 px (108 px) y el marcador suma 2: 30,5 y 27,5 rem
 * (medido a 768 × 1024, 900 × 700, 1024 × 768, 1100 × 760 y 1100 × 900, sin scroll); con el marcador de 44 px (`tallScore`, el duelo por enlace), 4 px más.
 * El `%` del ancho y del `marginTop` es el ancho de la columna (sin la barra de scroll).
 */
export function mediumDuelFieldStyle(tilted: boolean, bottomRow = true, tallScore = false): CSSProperties {
  const rest = (bottomRow ? (tilted ? 37 : 34) : tilted ? 30.5 : 27.5) + (!bottomRow && tallScore ? 0.25 : 0)
  // De arriba son cinco filas: sin la fila de abajo la casilla baja hasta 52 px, o a 900 × 700 la columna scrollearía 11 px.
  const floor = !bottomRow && !tilted ? '3.25rem' : '3.5rem'
  const cell = `min(calc((100% - 1.5rem) / 6.3714), max(${floor}, calc((100dvh - ${rest}rem) / ${tilted ? 3 : 5})))`

  return {
    '--cell-m': cell,
    width: 'calc(var(--cell-m) * 6.3714 + 1.5rem)',
    marginInline: 'auto',
    marginTop: tilted ? 'calc(9.5rem - 2 * var(--cell-m))' : THEIR_HAND.mobile.room,
  } as CSSProperties
}
