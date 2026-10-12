/**
 * Fondos propios de la práctica (el violeta #9B00FF y el verde #00FFA3 ya son los de toda la app).
 * Se publica como variables en la raíz de la práctica y la heredan todos sus elementos.
 */
export const PRACTICE_PALETTE =
  '[--warning:#f59e0b] [--warning-rgb:245_158_11] [--background:#0b0b0f] [--background-rgb:11_11_15] [--card-background:#12121a] [--card-background-rgb:18_18_26]'

/** Color de una salida (verde) o de un problema (rojo): lo heredan los botones y la explicación. */
export const RULE_COLOR = {
  opening: '[--rule-color:rgb(var(--success-rgb))]',
  problem: '[--rule-color:rgb(var(--danger-rgb))]',
} as const

/** Dorso de carta, liso: violeta oscuro con un marco fino adentro (lo comparten el mazo, el Extra, las cartas boca abajo y el fantasma). */
export const CARD_BACK =
  'absolute inset-0 z-1 overflow-hidden rounded-tag border border-primary/55 bg-[#160f28] after:absolute after:inset-[10%] after:rounded-[3px] after:border after:border-primary/35'
