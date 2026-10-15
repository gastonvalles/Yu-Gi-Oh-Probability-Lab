import { prefersReducedMotion, supportsAdditiveAnimation } from './motion'

/** Cuánto dura el barajado de una mano o de un deck. */
export const RIFFLE_MS = 520

/**
 * Baraja a la vista las cartas dadas (las de una mano o las capas de un deck): se abren una a cada lado y se vuelven a juntar, en cascada. La animación se
 * suma a la posición que ya tienen (el abanico de la mano), así que cada carta vuelve a donde estaba.
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
        { transform: `translate(${side * 14}px, -8px) rotate(${side * 6}deg)`, offset: 0.45 },
        { transform: 'translate(0px, 0px) rotate(0deg)' },
      ],
      { duration: RIFFLE_MS, delay: index * 22, easing: 'ease-in-out', composite: 'add' },
    )
    index += 1
  }
}
