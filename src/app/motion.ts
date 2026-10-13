/** Duración del reparto por carta y límite para las demás animaciones de la interfaz. */
export const UI_ANIMATION_MS = 240

/** ¿Puede una animación sumarse a otra (`composite: 'add'`)? Los giros en 3D de las cartas se suman a su `transform`; sin esto pisarían el vuelo, así que no se hacen. */
export function supportsAdditiveAnimation(): boolean {
  return typeof KeyframeEffect !== 'undefined' && 'composite' in KeyframeEffect.prototype
}

/** ¿Pidió la persona reducir el movimiento? Se consulta en el momento (no se guarda). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
