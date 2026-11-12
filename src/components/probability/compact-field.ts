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
/** La mano del rival es la tuya espejada a 0,8 (Gastón, 2026-11-12); su caja suma 8 px a la carta (lo que suben las puntas del abanico) y queda a 6 px del campo. */
const RIVAL_SCALE = 0.8
const RIVAL_FAN = 8
const RIVAL_GAP = 6
/** Del borde de abajo del campo a la caja de tu mano: sin línea en el medio (los avisos flotan sobre tu mano). */
const HAND_GAP = 8
/** Una carta en defensa gira sobre su casilla y pisa hasta 11 px de cada vecina (no se achica para entrar). */
const DEFENSE_OVERLAP = 11

export interface PhoneDuelOptions {
  tilted: boolean
  /** Lo de arriba del campo que no es suyo: la barra de la pantalla (con las vidas del rival). */
  bar: number
  /** Lo de abajo de tu mano: el margen de la columna y la fila de abajo. */
  bottom: number
}

export interface PhoneDuelLayout {
  /** La casilla: el ancho (de la pantalla) y el alto de la fila (de una carta, o menos hasta cuadrada); la carta de adentro (ancho y alto) y cuánto baja desde el borde de la casilla. */
  cell: number
  row: number
  card: number
  cardHeight: number
  cardTop: number
  /** El campo: ancho, alto, la `y` de su caja y la que se ve (en 3D la perspectiva baja su borde de arriba `drop` px). */
  fieldWidth: number
  fieldHeight: number
  fieldBoxTop: number
  fieldTop: number
  drop: number
  /** La mano del rival: su carta, el ancho de su abanico, su caja y su `y`; cuelga del borde de arriba del campo a `rivalGap`. */
  rivalCard: number
  rivalWidth: number
  rivalRoom: number
  rivalGap: number
  rivalTop: number
  /** El borde de abajo del campo (la marca de 0 px `data-duel-line`, el techo de las hojas) y el hueco hasta tu mano. */
  lineTop: number
  gap: number
  handTop: number
  handHeight: number
  handCard: number
  bottomTop: number
}

/**
 * La geometría del duelo en el celular (Gastón, 2026-11-12: «evitar espacio vacío entre campo y mano, siempre intentar agrandar el campo»; «la mano del oponente siempre debe ser un espejo exacto de
 * nuestra mano, aunque un poco más pequeña»). Pura: sale sólo del ancho y el alto de la pantalla (y de lo que miden la barra y la fila de abajo), nunca de lo que se muestra, así **el campo y la mano no
 * se mueven nunca**. De abajo arriba: la fila de abajo, tu mano, 8 px, el campo de siete columnas, 6 px y la mano del rival; lo que sobra queda arriba, debajo de la barra.
 * - La casilla es la que entra a lo ancho: `(ancho − 2 orillas de 4 − 6 huecos de 3) / 6,3714` (57 px a 390, 52 a 360). La fila, de una carta (×1,4612); tu mano se lleva lo que queda (de 64 px
 *   hasta la que entra a lo ancho) y, si ni con 64 px entra, la fila baja hasta cuadrada (360 × 640). La carta de la casilla: 3 px menos que ella, sin pisar más de 11 px en defensa.
 * - La mano del rival, a 0,8 de la tuya: su carta y el ancho de su abanico.
 * - 3D: la perspectiva baja el borde de arriba del campo `drop` px (con el de abajo fijo); la caja crece eso hacia arriba, así lo que se ve queda donde de arriba (y la mano del rival, que cuelga
 *   de ese borde, también).
 */
export function phoneDuelLayout(width: number, height: number, { tilted, bar, bottom }: PhoneDuelOptions): PhoneDuelLayout {
  const cell = (width - 2 * PHONE_EDGE - 6 * PHONE_GAP) / FIELD_CELLS
  const fieldWidth = cell * FIELD_CELLS + 6 * PHONE_GAP
  const avail = height - bar - bottom
  // Todo lo que no es campo, con una carta de mano `hand`: las dos manos (la del rival a 0,8), sus cajas y los dos huecos.
  const hands = (hand: number) => hand * CARD_RATIO * (1 + RIVAL_SCALE) + HAND_ROOM + RIVAL_FAN + RIVAL_GAP + HAND_GAP
  const rows = (row: number) => row * 5 + 4 * PHONE_GAP
  const tallRow = cell * CARD_RATIO
  const fit = Math.min(HAND_CARD_MAX, (width - 2 * PHONE_EDGE) / HAND_FIT)
  const handCard = Math.max(HAND_CARD_MIN, Math.min(fit, (avail - rows(tallRow) - hands(0)) / (CARD_RATIO * (1 + RIVAL_SCALE))))
  const seen = rows(Math.max(cell, Math.min(tallRow, (avail - hands(handCard) - 4 * PHONE_GAP) / 5)))
  // En 3D la caja es más alta: la que, inclinada, se ve del alto de la de arriba (`h − h² tan θ / (p + h tan θ) = visto`), así el campo sigue llenando el alto entre las dos manos.
  const fieldHeight = tilted ? (seen * PERSPECTIVE) / (PERSPECTIVE - seen * Math.tan(TILT)) : seen
  const drop = fieldHeight - seen
  const row = (fieldHeight - 4 * PHONE_GAP) / 5
  const card = Math.min(cell - PHONE_GAP, (cell + 2 * DEFENSE_OVERLAP) / CARD_RATIO, row / CARD_RATIO)
  const handHeight = handCard * CARD_RATIO + HAND_ROOM
  const handTop = height - bottom - handHeight
  const lineTop = handTop - HAND_GAP
  const fieldTop = lineTop - seen
  const rivalCard = handCard * RIVAL_SCALE
  const rivalRoom = rivalCard * CARD_RATIO + RIVAL_FAN

  return {
    cell, row, card, cardHeight: card * CARD_RATIO, cardTop: (row - card * CARD_RATIO) / 2,
    fieldWidth, fieldHeight, fieldBoxTop: fieldTop - drop, fieldTop, drop,
    rivalCard, rivalWidth: (width - 2 * PHONE_EDGE) * RIVAL_SCALE, rivalRoom, rivalGap: RIVAL_GAP, rivalTop: fieldTop - RIVAL_GAP - rivalRoom,
    lineTop, gap: HAND_GAP, handTop, handHeight, handCard, bottomTop: handTop + handHeight,
  }
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
