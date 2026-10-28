import { EASE_IN_OUT, cancelWhenDone, flying, ownTransform, prefersReducedMotion, supportsAdditiveAnimation, transformTransition } from './motion'

/** Cuánto dura el barajado de una mano o de un deck (el del mazo propio, `riffle-*` de `index.css`, dura lo mismo). */
export const RIFFLE_MS = 640

/** El id de la animación del barajado: uno nuevo corta el que siga en curso en esa carta. */
const RIFFLE_ID = 'riffle'

/** Los tiempos del barajado, como `translate(…) rotate(…)` desde donde está la carta. */
const riffleSteps = (side: number) => [
  { at: `translate(0px, 0px) rotate(0deg)`, easing: EASE_IN_OUT },
  { at: `translate(${side * 18}px, -10px) rotate(${side * 8}deg)`, offset: 0.3, easing: EASE_IN_OUT },
  { at: `translate(${-side * 4}px, -6px) rotate(${-side * 2}deg)`, offset: 0.62, easing: EASE_IN_OUT },
  { at: `translate(0px, 3px) rotate(0deg)`, offset: 0.84, easing: EASE_IN_OUT },
  { at: `translate(0px, 0px) rotate(0deg)` },
]

/**
 * Baraja a la vista las cartas dadas (las de una mano o las capas de un deck), como a mano y en tres tiempos: se abren una a cada lado, se levantan y se entrelazan pasando un poco del
 * centro y se golpean contra la mesa para quedar parejas; en cascada. Cada carta se mueve desde la posición que ya tiene (el abanico de la mano; al robar, el lugar nuevo) y
 * vuelve ahí: sus cuadros llevan esa `transform` delante (`ownTransform`, en `replace`, que la GPU compone sola); si la carta vuela, se suma al vuelo (`flying`).
 * Cada tiempo arranca y frena con `EASE_IN_OUT`, como el barajado del mazo en CSS (`riffle-*`, con `--ease-in-out` en cada tramo): la mano y el mazo se mueven igual.
 */
export function riffle(cards: Iterable<Element>): void {
  if (prefersReducedMotion()) {
    return
  }

  const list = [...cards].filter((card) => typeof card.animate === 'function')

  // Primero se cortan los barajados en curso y después se lee cómo está cada una (una sola medida): así la base es la quieta, no la de un barajado a medias.
  for (const card of list) card.getAnimations?.().forEach((animation) => animation.id === RIFFLE_ID && animation.cancel())
  const bases = list.map((card) => (flying(card) ? null : ownTransform(card)))

  list.forEach((card, index) => {
    const steps = riffleSteps(index % 2 === 0 ? -1 : 1)
    const own = bases[index]
    const timing = { id: RIFFLE_ID, duration: RIFFLE_MS, delay: index * 24 }

    if (own !== null) {
      // Sale del fin de su transición (al robar, la mano que se abre): la tapa, así que se corta, y la del barajado queda sola y va en la GPU (con las dos, Chromium sacaba a la transición).
      transformTransition(card)?.cancel()
      cancelWhenDone(card.animate(steps.map(({ at, ...step }) => ({ ...step, transform: `${own}${at}` })), timing))
    } else if (supportsAdditiveAnimation()) cancelWhenDone(card.animate(steps.map(({ at, ...step }) => ({ ...step, transform: at })), { ...timing, composite: 'add' }))
  })
}
