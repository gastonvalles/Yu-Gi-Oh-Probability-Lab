import { matReducer, type MatAction, type MatState } from '../practice-mat'

/**
 * Duelos automáticos · la mano de apertura. El núcleo arranca con la mano vacía y la reparte como la primera jugada (`draw` de 5, con sus cartas); la mesa la lee como
 * la práctica: plegada en la mesa del arranque, el paso 0 es «Mano inicial», las salidas de la mano se evalúan sobre ella y un combo guardado arranca con ella en la
 * mano. Sólo esa primera jugada: un robo después (el de ir segundo, el de cada turno) sigue siendo una jugada. Puro: lo usa `useAutoAsks`.
 */
export function foldOpeningHand(initial: MatState, actions: readonly MatAction[]): { initial: MatState; skip: number } {
  const first = actions[0]

  return initial.hand.length === 0 && first?.type === 'draw' ? { initial: matReducer(initial, first), skip: 1 } : { initial, skip: 0 }
}
