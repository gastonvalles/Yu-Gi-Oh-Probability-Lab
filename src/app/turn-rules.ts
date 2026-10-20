import { matReducer, type MatAction, type MatState } from './practice-mat'

/**
 * Las reglas de turno del juego (no son de una carta): se **avisa**, no se decide (la mesa, como en DuelingBook, deja jugar lo que quien practica quiera: un efecto puede dar otra Invocación Normal o de Péndulo, y la mesa
 * no lo sabe). Sólo se dice lo que es verdad —la regla general— y que quien juega puede haber olvidado.
 *
 * - **Una Invocación Normal (o Colocar un monstruo) por turno.** La jugada es `place` con `how: 'normal'` o una con Sacrificios (`tribute`).
 * - **Una Invocación de Péndulo por turno.** Una sola Invocación de Péndulo trae **varios** monstruos a la vez (de la mano y del Extra Deck boca arriba) y la mesa los invoca de a uno: los que se invocan seguidos son la misma
 *   Invocación. Es otra cuando entre dos de ellas hubo algo que no es invocar (activar, atacar, cambiar de fase…). Sólo cuentan las que la mesa sabe que son de Péndulo (`how: 'pendulum'`: las del Extra Deck boca arriba).
 */
export type TurnRule = 'normalSummon' | 'pendulumSummon'

const isNormalSummon = (action: MatAction): boolean => action.type === 'tribute' || (action.type === 'place' && action.how === 'normal')

const isPendulumSummon = (action: MatAction): boolean => action.type === 'place' && action.how === 'pendulum'

/** Invocar de cualquier forma (a una zona de monstruo): no corta una Invocación de Péndulo en curso. */
const isSummon = (action: MatAction): boolean => action.type === 'tribute' || action.type === 'summon' || (action.type === 'place' && (action.zone === 'mz' || action.zone === 'emz'))

/**
 * La regla de turno que repite `next` (la jugada que se va a hacer) dadas las `actions` que ya se hicieron desde `initial`, o null si no repite ninguna. Lo de «este turno» es lo que se hizo desde la última vez que la mesa
 * cambió de turno (de la End Phase a la Draw Phase).
 */
export function repeatedTurnRule(initial: MatState, actions: readonly MatAction[], next: MatAction): TurnRule | null {
  const normal = isNormalSummon(next)

  if (!normal && !isPendulumSummon(next)) return null

  let state = initial
  let thisTurn: MatAction[] = []

  for (const action of actions) {
    const after = matReducer(state, action)

    // La mesa de antes de cada jugada dice en qué turno va: al cambiar de turno, lo anterior ya no cuenta.
    thisTurn = after.turn === state.turn ? [...thisTurn, action] : []
    state = after
  }

  if (normal) return thisTurn.some(isNormalSummon) ? 'normalSummon' : null

  const last = thisTurn.map(isPendulumSummon).lastIndexOf(true)

  return last >= 0 && thisTurn.slice(last + 1).some((action) => !isSummon(action)) ? 'pendulumSummon' : null
}
