import { PHASES, type MatAction, type MatPhase, type MatState } from '../practice-mat'

/**
 * Duelos automáticos · las paradas de la Draw y la Standby Phase. El núcleo cuenta tu DP, tu SP y tu Main Phase 1 de una tanda (si no hay nada
 * que activar, ni pregunta), pero en la mesa las fases las cambia quien juega, como en la manual: la mesa frena en la jugada `phase` de tu mesa que
 * pasa de la DP a la SP o de la SP a la M1 (una parada) hasta que pidas dejar esa fase con el botón de fases (`Allowed`). El núcleo ya espera más
 * adelante, así que frenar la mesa no cambia el juego. La SP que un efecto salta (de la DP a la M1) no frena. Puro: lo usa el ritmo de `useAutoAsks`.
 */

/** La fase más lejana que pediste en un turno de tu mesa (`MatState.turn`). */
export interface Allowed {
  turn: number
  phase: MatPhase
}

type At = Pick<MatState, 'phase' | 'turn'>

const rank = (phase: MatPhase) => PHASES.findIndex((item) => item.id === phase)

/** Si ya pediste dejar `phase` en el turno `turn` (un turno anterior ya lo dejaste entero). Vale para las paradas y para las ventanas de esa fase. */
export const leaves = (allowed: Allowed | null, turn: number, phase: MatPhase) => allowed !== null && (turn < allowed.turn || (turn === allowed.turn && rank(allowed.phase) > rank(phase)))

/** Pedir llegar a `to` en el turno `turn`: lo pedido sólo sube. */
export const allowTo = (allowed: Allowed | null, turn: number, to: MatPhase): Allowed =>
  allowed && (turn < allowed.turn || (turn === allowed.turn && rank(to) <= rank(allowed.phase))) ? allowed : { turn, phase: to }

const isStop = (from: MatPhase, action: MatAction) => action.type === 'phase' && ((from === 'draw' && action.phase === 'standby') || (from === 'standby' && action.phase === 'main1'))

/** La fase y el turno después de una jugada: sólo las de fase los cambian (de la End a la Draw Phase empieza otro turno, como en `matReducer`). */
const after = (at: At, action: MatAction): At => (action.type !== 'phase' || action.phase === at.phase ? at : { phase: action.phase, turn: at.phase === 'end' && action.phase === 'draw' ? at.turn + 1 : at.turn })

/** Hasta dónde puede contar la mesa: la primera parada desde `from` que no pediste dejar, o `actions.length`. `start`: la mesa del arranque. */
export function stopAt(start: At, actions: readonly MatAction[], from: number, allowed: Allowed | null): number {
  let at = start

  for (const [i, action] of actions.entries()) {
    if (i >= from && isStop(at.phase, action) && !leaves(allowed, at.turn, at.phase)) return i
    at = after(at, action)
  }

  return actions.length
}

/** Dónde empiezan las paradas con que terminan las jugadas, o `actions.length`: al rearmarse, la mesa frena ahí (un duelo nuevo, el turno recién llegado) y no a mitad de un turno. */
export function trailingStops(start: At, actions: readonly MatAction[]): number {
  let at = start
  let run = actions.length

  for (const [i, action] of actions.entries()) {
    run = isStop(at.phase, action) ? Math.min(run, i) : actions.length
    at = after(at, action)
  }

  return run
}
