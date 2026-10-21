/** Duración del reparto por carta y límite para las demás animaciones de la interfaz. */
export const UI_ANIMATION_MS = 240

/**
 * Las curvas del proyecto para la Web Animations API (`animate(…, { easing })`), que no resuelve `var(…)`: espejan `--ease-out` y `--ease-out-soft` de
 * `index.css` (un test lo verifica). La palabra `ease-out` de esa API es otra curva, no la del proyecto.
 */
export const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)'
/** Hoy igual que `EASE_OUT`: así está definido `--ease-out-soft` (la suave, sin rebote). */
export const EASE_OUT_SOFT = 'cubic-bezier(0.2, 0, 0, 1)'

/** ¿Puede una animación sumarse a otra (`composite: 'add'`)? Los giros en 3D de las cartas se suman a su `transform`; sin esto pisarían el vuelo, así que no se hacen. */
export function supportsAdditiveAnimation(): boolean {
  return typeof KeyframeEffect !== 'undefined' && 'composite' in KeyframeEffect.prototype
}

/** ¿Pidió la persona reducir el movimiento? Se consulta en el momento (no se guarda). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
