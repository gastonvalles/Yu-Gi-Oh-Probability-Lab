import type { CSSProperties } from 'react'

/**
 * Colores de los efectos de la mesa, como `r g b` para `rgb(var(--fx-rgb) / alfa)`: dorado para activar y para la Invocación Normal,
 * celeste para lo que se muestra y la Invocación Especial, rojo para el objetivo, violeta para declarar, la Fusión y el cementerio.
 */
export const FX_RGB = {
  gold: '250 204 21',
  cyan: '56 189 248',
  red: '255 74 94',
  violet: '192 132 252',
  green: '0 255 163',
  white: '241 245 249',
  indigo: '129 140 248',
  teal: '45 212 191',
  amber: '251 191 36',
} as const

export type FxTone = keyof typeof FX_RGB

/** Color de una salida (verde) o de un problema (rojo): lo heredan los botones y la explicación. */
export const RULE_COLOR = {
  opening: '[--rule-color:rgb(var(--success-rgb))]',
  problem: '[--rule-color:rgb(var(--danger-rgb))]',
} as const

/**
 * El grosor de una pila de cartas (el deck y el Extra): un canto por cada seis cartas, hasta 10 px (un deck de 60), asomando debajo de la pila (o arriba, la del rival: del lado de afuera
 * del campo, donde no pisa a las demás). Así un deck de 40 se ve más grueso que uno de 15 y se va afinando al robar. Sin cartas, nada. Los cantos alternan claro y oscuro, como los de un mazo.
 */
export function pileEdge(count: number, up = false): CSSProperties | undefined {
  if (count <= 0) return undefined

  const depth = Math.min(10, Math.max(1, Math.ceil(count / 6)))
  const sign = up ? -1 : 1

  return { boxShadow: Array.from({ length: depth }, (_, index) => `0 ${sign * (index + 1)}px 0 rgb(var(--foreground-rgb) / ${index % 2 === 0 ? 0.55 : 0.18})`).join(',') }
}

/**
 * El dorso por defecto de una carta de Yu-Gi-Oh!: la imagen `cards/back.jpg` de YGOPRODeck, que sale por el mismo proxy que las
 * demás (`card-image-source`).
 */
export const CARD_BACK_URL = '/api/card-image/cards/back.jpg'

/**
 * Dorso de carta: la imagen de `CARD_BACK_URL` (un violeta oscuro debajo mientras carga). Lo comparten el mazo, el Extra, las cartas
 * boca abajo, los fantasmas de los vuelos y las cartas que se dan vuelta. Tiene que decir lo mismo que `CARD_BACK_URL`: Tailwind sólo
 * ve las clases escritas completas.
 */
export const CARD_BACK = 'absolute inset-0 z-1 overflow-hidden bg-[#1d1033] bg-cover bg-center bg-[url(/api/card-image/cards/back.jpg)]'
