import type { Duelist } from './life-calculator'
import type { MatState } from './practice-mat'

/**
 * De quién es el turno en un duelo: empieza quien dijeron (el anfitrión si nadie dijo nada) y cada vez que alguien pasa de su End Phase a la Draw Phase
 * (su contador de turnos sube) le toca al otro. Es una cuenta, no una regla: si uno pasa dos veces seguidas, el turno
 * vuelve a ser suyo, como pasaría en la mesa.
 */
export function whoseTurn(me: Duelist, mine: MatState | null, theirs: MatState | null, starter: Duelist = 0): 'mine' | 'theirs' {
  const passes = (mine?.turn ?? 1) - 1 + ((theirs?.turn ?? 1) - 1)
  const starterPlays = passes % 2 === 0

  return starterPlays === (me === starter) ? 'mine' : 'theirs'
}
