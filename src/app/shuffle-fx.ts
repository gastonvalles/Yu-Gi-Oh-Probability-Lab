import { EASE_IN_OUT, animationsOf, cancelWhenDone, flying, ownTransform, prefersReducedMotion, supportsAdditiveAnimation, transformTransition } from './motion'

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

  // Una sola fase de lectura y después las escrituras: se leen las animaciones de todas las cartas, se cortan los barajados en curso, se lee la base quieta de todas (una sola medida,
  // no la de un barajado a medias) y recién entonces se escribe en cada una. Leer una carta después de escribir en la anterior recalculaba los estilos carta por carta.
  const animations = list.map((card) => animationsOf(card))
  for (const own of animations) for (const animation of own) if (animation.id === RIFFLE_ID) animation.cancel()
  const rest = animations.map((own) => own.filter((animation) => animation.id !== RIFFLE_ID))
  const bases = list.map((card, index) => (flying(card, rest[index]) ? null : ownTransform(card, rest[index])))
  const transitions = list.map((card, index) => transformTransition(card, rest[index]))

  list.forEach((card, index) => {
    const steps = riffleSteps(index % 2 === 0 ? -1 : 1)
    const own = bases[index]
    const timing = { id: RIFFLE_ID, duration: RIFFLE_MS, delay: index * 24 }

    if (own !== null) {
      // Sale del fin de su transición (al robar, la mano que se abre): la tapa, así que se corta, y la del barajado queda sola y va en la GPU (con las dos, Chromium sacaba a la transición).
      transitions[index]?.cancel()
      cancelWhenDone(card.animate(steps.map(({ at, ...step }) => ({ ...step, transform: `${own}${at}` })), timing))
    } else if (supportsAdditiveAnimation()) cancelWhenDone(card.animate(steps.map(({ at, ...step }) => ({ ...step, transform: at })), { ...timing, composite: 'add' }))
  })
}
