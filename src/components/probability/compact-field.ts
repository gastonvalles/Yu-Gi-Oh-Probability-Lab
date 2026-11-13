import type { CSSProperties } from 'react'

/** El celular en vertical: menos de 640 px de ancho (el corte `sm` de Tailwind). El campo tiene siete columnas en todos los anchos. */
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
export const HAND_ROOM = 30
const CARD_RATIO = 1.4612
const HAND_CARD_MAX = 140
const HAND_CARD_MIN = 64
/** La mano del rival es la tuya espejada a 0,8 (Gastón, 2026-11-12); su caja suma 8 px a la carta (lo que suben las puntas del abanico) y queda a 6 px del campo. */
const RIVAL_SCALE = 0.8
const RIVAL_FAN = 8
const RIVAL_GAP = 6
/** Del borde de abajo del campo a la caja de tu mano: sin línea en el medio (los avisos flotan sobre tu mano). */
const HAND_GAP = 8
/** Dentro de la caja de tu mano, cuánto bajan las cartas desde su borde de arriba (`PracticeHand`; el replay de un duelo pone su mano de abajo en el mismo lugar). */
export const HAND_TOP_ROOM = 8

/**
 * Lo que mide la pantalla del duelo del celular arriba y abajo del campo y las manos: la barra (la fila de los íconos con las vidas del rival, 50 px, y el hueco de la columna, 8) y tu fila (tu chapa y
 * la botonera, 60 px, con el margen de la columna, 8). La mesa y el replay de un duelo los usan para `phoneDuelLayout`, así los dos tienen el campo y las manos en el mismo lugar.
 */
export const PHONE_DUEL_BAR = 58
export const PHONE_DUEL_BOTTOM = 68
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
 * La caja del campo del duelo del celular (lleva `data-phone`): su ancho y su alto, las filas con forma de carta y la carta de adentro, por variables (las lee `CELL` de la mesa). La misma en la mesa
 * (`PracticeMat`) y en el replay de un duelo (`DuelTable`).
 */
export function phoneFieldStyle(layout: PhoneDuelLayout): CSSProperties {
  return { width: layout.fieldWidth, height: layout.fieldHeight, gridTemplateRows: `repeat(5, ${layout.row}px)`, '--zone-aspect': 'auto', '--pile-width': '100%', '--pile-align': 'center', '--field-card': `${layout.card}px`, '--field-card-top': `${layout.cardTop}px` } as CSSProperties
}

/** Desde este ancho el campo ya no ocupa toda la columna: se angosta hasta que sus casillas tengan forma de carta (el celular, más angosto, va a todo el ancho). */
const TABLET_FROM = 640
const TABLET_NARROWEST = 360

/**
 * `phoneDuelLayout` en todos los anchos de la mesa móvil. Hasta 639 px, el de siempre (a todo el ancho). Desde 640 px (tableta), a todo el ancho las casillas saldrían más anchas que una carta (la fila
 * la limita el alto): se angosta de a 8 px, como el visor de replays, hasta que sus filas tengan el alto de una carta, y el campo y las manos quedan centrados en ese ancho. Devuelve también el ancho usado.
 */
export function matDuelLayout(width: number, height: number, options: PhoneDuelOptions): PhoneDuelLayout & { width: number } {
  let w = width
  let layout = phoneDuelLayout(w, height, options)
  if (width >= TABLET_FROM) while (w > TABLET_NARROWEST && layout.row < layout.cell * CARD_RATIO * 0.99) layout = phoneDuelLayout((w -= 8), height, options)

  return { ...layout, width: w }
}
