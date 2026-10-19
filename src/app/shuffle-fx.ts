import { prefersReducedMotion, supportsAdditiveAnimation } from './motion'

/** Cuánto dura el barajado de una mano o de un deck (el del mazo propio, `riffle-*` de `index.css`, dura lo mismo). */
export const RIFFLE_MS = 640

/**
 * Baraja a la vista las cartas dadas (las de una mano o las capas de un deck), como a mano y en tres tiempos: se abren una a cada lado, se levantan y se entrelazan pasando un poco del
 * centro y se golpean contra la mesa para quedar parejas; en cascada. La animación se suma a la posición que ya tienen (el abanico de la mano), así que cada carta vuelve a donde estaba.
 */
export function riffle(cards: Iterable<Element>): void {
  if (prefersReducedMotion() || !supportsAdditiveAnimation()) {
    return
  }

  let index = 0

  for (const card of cards) {
    if (typeof card.animate !== 'function') {
      return
    }

    const side = index % 2 === 0 ? -1 : 1

    card.animate(
      [
        { transform: 'translate(0px, 0px) rotate(0deg)' },
        { transform: `translate(${side * 18}px, -10px) rotate(${side * 8}deg)`, offset: 0.3 },
        { transform: `translate(${-side * 4}px, -6px) rotate(${-side * 2}deg)`, offset: 0.62 },
        { transform: 'translate(0px, 3px) rotate(0deg)', offset: 0.84 },
        { transform: 'translate(0px, 0px) rotate(0deg)' },
      ],
      { duration: RIFFLE_MS, delay: index * 24, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', composite: 'add' },
    )
    index += 1
  }
}
