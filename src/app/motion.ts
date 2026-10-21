/** Duración del reparto por carta y límite para las demás animaciones de la interfaz. */
export const UI_ANIMATION_MS = 240

/**
 * Las tres curvas del movimiento para la Web Animations API (`animate(…, { easing })`), que no resuelve `var(…)`: espejan `--ease-out`, `--ease-in-out` y
 * `--ease-snap` de `index.css` (un test lo verifica). La palabra `ease-out` de esa API es otra curva, no la del proyecto.
 */
/** Lo que entra o se queda: desacelera (también el default de las transiciones de Tailwind). */
export const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)'
/**
 * Lo que viaja de un lugar a otro de la pantalla (los vuelos de las cartas, el barajado, la espada del ataque): arranca suave y llega suave. Con `EASE_OUT` la
 * carta hacía la mitad del camino en el primer quinto del vuelo y se arrastraba el resto; con ésta (medido), la mitad cae al 40 % y el pico de velocidad baja de
 * 4 a 2,8 veces la velocidad media.
 */
export const EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)'
/** Lo que arranca ya en movimiento y se asienta (pops, lo que suelta un gesto, estallidos, la moneda, las medallas). */
export const EASE_SNAP = 'cubic-bezier(0.25, 1, 0.5, 1)'

/** ¿Puede una animación sumarse a otra (`composite: 'add'`)? Los giros en 3D de las cartas se suman a su `transform`; sin esto pisarían el vuelo, así que no se hacen. */
export function supportsAdditiveAnimation(): boolean {
  return typeof KeyframeEffect !== 'undefined' && 'composite' in KeyframeEffect.prototype
}

/** ¿Pidió la persona reducir el movimiento? Se consulta en el momento (no se guarda). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
