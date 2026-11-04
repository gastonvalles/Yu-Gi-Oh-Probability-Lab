import { PHASES, type MatPhase } from '../practice-mat'

/**
 * Duelos automáticos · lo que pediste dejar con el botón de fases. Tu DP y tu SP pasan solas (la mesa las cuenta a su ritmo y frena sólo en una pregunta del núcleo); en la ventana
 * de tu DP, pedir la Main Phase 1 también deja la SP: su ventana se pasa sola (`leaves`). Puro: lo usa `useAutoAsks`.
 */

/** La fase más lejana que pediste en un turno de tu mesa (`MatState.turn`). */
export interface Allowed {
  turn: number
  phase: MatPhase
}

const rank = (phase: MatPhase) => PHASES.findIndex((item) => item.id === phase)

/** Si ya pediste dejar `phase` en el turno `turn` (un turno anterior ya lo dejaste entero): su ventana se pasa sola. */
export const leaves = (allowed: Allowed | null, turn: number, phase: MatPhase) => allowed !== null && (turn < allowed.turn || (turn === allowed.turn && rank(allowed.phase) > rank(phase)))

/** Pedir llegar a `to` en el turno `turn`: lo pedido sólo sube. */
export const allowTo = (allowed: Allowed | null, turn: number, to: MatPhase): Allowed =>
  allowed && (turn < allowed.turn || (turn === allowed.turn && rank(to) <= rank(allowed.phase))) ? allowed : { turn, phase: to }
