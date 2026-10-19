/**
 * El tamaño de la mano del rival: cerca del de la nuestra (que mide hasta 100 px de ancho en escritorio y 96 en el celular), pero más chica (68 y 64 %), con el abanico espejado.
 * `room` es el alto que se reserva (la carta más lo que sube el abanico): arriba del campo, en el celular, se le deja ese lugar.
 */
export const THEIR_HAND = {
  desktop: { cardWidth: 68, maxWidth: 232, room: 112 },
  mobile: { cardWidth: 62, maxWidth: 220, room: 102 },
} as const

/** Cuánto sube el abanico en los extremos (el centro es lo más cercano al campo). */
export const THEIR_FAN_RISE = 1.2
