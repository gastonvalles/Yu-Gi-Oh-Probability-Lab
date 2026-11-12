import { describeMatAction, replayMat, type MatAction, type MatState } from './practice-mat'

/**
 * Los momentos del duelo que la línea del celular dice un rato (`MOMENT_MS`, «Jugar solo» automático) antes de volver a la pista de fases: invocar a la vista y atacar, con la frase del
 * paso que ya existe (`describeMatAction`, la de la lista de pasos). El daño no va: lo cuenta la chapa. Puro: la pantalla lo llama cuando la mesa avanza.
 */

/** Cuánto dice la línea un momento. */
export const MOMENT_MS = 1500

/** ¿La jugada es un momento? Invocar boca arriba en una zona de monstruo (Normal, Especial, por Sacrificio, del Extra) o declarar un ataque; un lote, si lleva uno. */
export function isMoment(action: MatAction): boolean {
  switch (action.type) {
    case 'batch':
      return action.actions.some(isMoment)
    case 'attack':
      return true
    case 'summon':
    case 'tribute':
      return action.pos !== 'set'
    case 'place':
      return (action.zone === 'mz' || action.zone === 'emz') && action.pos !== 'set'
    default:
      return false
  }
}

/** La frase del momento con el que la mesa llegó a `cursor` (su jugada `cursor - 1`), o null si esa jugada no es uno. */
export function momentText(initial: MatState, actions: readonly MatAction[], cursor: number, nameOf: (id: string) => string): string | null {
  const action = actions[cursor - 1]

  return action && isMoment(action) ? describeMatAction(replayMat(initial, actions, cursor - 1), action, nameOf) : null
}
