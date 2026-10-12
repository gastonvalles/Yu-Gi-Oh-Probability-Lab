import { hypergeometric } from './role-distribution'

/**
 * Cuentas rápidas sin armar el deck: cuántas copias hacen falta para abrir una carta. La misma
 * hipergeométrica del Lab, sobre una sola carta (o un grupo que se cuenta junto).
 */

/** P(robar al menos `atLeast` copias) en una mano de `handSize` de un deck de `deckSize` con `copies` copias. */
export function atLeastProbability(deckSize: number, copies: number, handSize: number, atLeast: number): number {
  if (atLeast <= 0) return 1
  if (deckSize <= 0 || handSize <= 0 || copies <= 0) return 0
  // Con la mano del tamaño del deck (o más) se roba todo: sale si hay copias suficientes.
  if (handSize >= deckSize) return copies >= atLeast ? 1 : 0

  let below = 0

  for (let drawn = 0; drawn < atLeast; drawn += 1) {
    below += hypergeometric(deckSize, Math.min(copies, deckSize), handSize, drawn)
  }

  return Math.min(1, Math.max(0, 1 - below))
}

/** Mínimas copias para que P(al menos 1) llegue a `target` (0 a 1); null si ni con todo el deck. */
export function minCopiesFor(deckSize: number, handSize: number, target: number): number | null {
  for (let copies = 0; copies <= deckSize; copies += 1) {
    if (atLeastProbability(deckSize, copies, handSize, 1) >= target) return copies
  }

  return null
}
