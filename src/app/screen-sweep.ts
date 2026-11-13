/** Hacia dónde barre la pantalla nueva al cambiar de destino. */
export type SweepDirection = 'next' | 'prev'

/**
 * El sentido de la navegación (`order`: los destinos en el orden del menú): `next` si el nuevo va después (entra desde la derecha, o desde abajo con el menú lateral), `prev` si va
 * antes; `null` si es el mismo o alguno no está en el menú (entra sin barrido).
 */
export function sweepDirection(order: readonly string[], from: string, to: string): SweepDirection | null {
  const before = order.indexOf(from)
  const after = order.indexOf(to)

  return before < 0 || after < 0 || before === after ? null : after > before ? 'next' : 'prev'
}
