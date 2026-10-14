import type { Duelist } from './life-calculator'
import type { MatState } from './practice-mat'

/**
 * Cuántos turnos terminó un jugador: los que ya pasó (su contador de turnos) y, si está parado en la End Phase, el de ahora. Terminar un turno es llegar a la
 * End Phase y dejar de tocar: no hace falta ningún botón.
 */
export const completedTurns = (state: MatState | null): number => (state ? state.turn - 1 + (state.phase === 'end' ? 1 : 0) : 0)

/** En qué turno del duelo van los dos juntos (el primero que juega es el 1, el del otro es el 2, y así). */
export const duelTurnNumber = (mine: MatState | null, theirs: MatState | null): number => completedTurns(mine) + completedTurns(theirs) + 1

/**
 * De quién es el turno en un duelo: empieza quien dijeron (el anfitrión si nadie dijo nada) y le toca al otro apenas el que juega llega a su End Phase.
 * Es una cuenta, no una regla: si alguien llega a la End Phase cuando no le tocaba, el turno se invierte, como pasaría en la mesa (y se arregla deshaciendo).
 */
export function whoseTurn(me: Duelist, mine: MatState | null, theirs: MatState | null, starter: Duelist = 0): 'mine' | 'theirs' {
  const starterPlays = (duelTurnNumber(mine, theirs) - 1) % 2 === 0

  return starterPlays === (me === starter) ? 'mine' : 'theirs'
}
