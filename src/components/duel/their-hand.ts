import { createContext } from 'react'

/**
 * El tamaño de la mano del rival: cerca del de la nuestra (que mide hasta 100 px de ancho en escritorio y 96 en el celular), pero más chica (68 y 64 %), con el abanico espejado.
 * `room` es el alto que se reserva (la carta más lo que suben las puntas del abanico): arriba del campo, en el celular, se le deja ese lugar.
 */
export const THEIR_HAND = {
  desktop: { cardWidth: 68, maxWidth: 232, room: 112 },
  mobile: { cardWidth: 62, maxWidth: 220, room: 102 },
} as const

/** El duelo del celular (`phoneDuelLayout`): la mano del rival a 0,8 de la tuya, su carta y el ancho de su abanico. Lo da la mesa; sin él, `THEIR_HAND`. */
export const TheirHandSize = createContext<{ cardWidth: number; maxWidth: number; room: number } | null>(null)

/** Cuánto suben las puntas del abanico (el centro es lo más cercano al campo): el de tu mano (1,6) a 0,8. */
export const THEIR_FAN_RISE = 1.28
