import { useState } from 'react'

import type { MatState } from './practice-mat'

/**
 * ¿Lo que pasó en la mesa del rival fue tocar su deck o sumar una carta a su mano? Su mano no se ve: sumarle una carta la baraja a la vista (como `matEffects` con `hiddenHand`, que
 * cuenta el duelo por enlace), así no se adivina cuál es la nueva. El barajado del deck cambia el orden sin cambiar cuántas cartas hay (no basta con que sea otro arreglo: la mesa se rearma con las mismas cartas). La mano de antes vacía es la mesa todavía sin
 * repartir (el núcleo cargando): el reparto no se baraja.
 */
export const rivalShuffled = (before: MatState, after: MatState): boolean =>
  (before.hand.length > 0 && after.hand.length > before.hand.length) || (after.deck.length === before.deck.length && after.deck.some((id, index) => id !== before.deck[index]))

/** Cuenta las veces que la mesa del rival barajó (`rivalShuffled`): `PracticeMat` baraja su deck y su mano cada vez que sube. Para los duelos automáticos, que no pasan por `useRivalEffect`. */
export function useRivalShuffle(state: MatState): number {
  const [seen, setSeen] = useState({ state, count: 0 })

  if (seen.state !== state) setSeen({ state, count: seen.count + (rivalShuffled(seen.state, state) ? 1 : 0) })
  return seen.count
}
