/** Duración del reparto por carta y límite para las demás animaciones de la interfaz. */
export const UI_ANIMATION_MS = 240

/** ¿Pidió la persona reducir el movimiento? Se consulta en el momento (no se guarda). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
