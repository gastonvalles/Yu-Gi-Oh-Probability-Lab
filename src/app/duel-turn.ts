import type { Duelist } from './life-calculator'
import type { MatPhase, MatState } from './practice-mat'

/**
 * Cuántos turnos pasó un jugador: los que ya cerró volviendo de su End Phase a la Draw Phase (su contador de turnos). La End Phase todavía es parte de su turno
 * (se juega: se activan efectos), así que llegar a ella no lo termina: el turno pasa cuando el que juega toca la Draw Phase después de la End Phase.
 */
export const completedTurns = (state: MatState | null): number => (state ? state.turn - 1 : 0)

/** En qué turno del duelo van los dos juntos (el primero que juega es el 1, el del otro es el 2, y así). */
export const duelTurnNumber = (mine: MatState | null, theirs: MatState | null): number => completedTurns(mine) + completedTurns(theirs) + 1

/**
 * De quién es el turno en un duelo: empieza quien dijeron (el anfitrión si nadie dijo nada) y le toca al otro cuando el que juega pasa de su End Phase a la Draw Phase
 * (su contador de turnos sube). Es una cuenta, no una regla: si uno pasa dos veces seguidas, el turno vuelve a ser suyo, como pasaría en la mesa.
 */
export function whoseTurn(me: Duelist, mine: MatState | null, theirs: MatState | null, starter: Duelist = 0): 'mine' | 'theirs' {
  const starterPlays = (duelTurnNumber(mine, theirs) - 1) % 2 === 0

  return starterPlays === (me === starter) ? 'mine' : 'theirs'
}

/** La fase en que va el duelo, igual para los dos: la de quien tiene el turno (la del otro espera en la Draw Phase hasta que le toque). */
export const sharedPhase = (turn: 'mine' | 'theirs', mine: MatState | null, theirs: MatState | null): MatPhase | undefined => (turn === 'mine' ? mine : theirs)?.phase
