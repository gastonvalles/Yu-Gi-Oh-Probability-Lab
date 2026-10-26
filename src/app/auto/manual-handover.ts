import { describeMatSteps, type MatAction, type MatState, type RivalHand } from '../practice-mat'
import type { AutoSnapshot } from './auto-session'
import { foldOpeningHand } from './opening-hand'

/** Cuántas jugadas ofrece «Volver atrás»: más atrás, la lista de Pasos de la manual (lleva todo el historial). */
export const MANUAL_BACK_MAX = 5

/** Una jugada tuya que «Seguir en manual» puede deshacer: dónde empieza en las jugadas de la mesa y su primer paso, como lo dice la lista de Pasos. */
export interface ManualPlay {
  at: number
  label: string
}

/** La partida que sigue en la mesa manual: la mano de apertura plegada (el paso 0, como en la práctica), todo el historial hasta ahí y los nombres. */
export interface ManualGame {
  initial: MatState
  actions: MatAction[]
  names: Record<string, string>
}

export interface ManualHandover {
  /** Tus jugadas, de la última hacia atrás (hasta `MANUAL_BACK_MAX`): volver `n` deshace de la primera a la `n`. */
  plays: ManualPlay[]
  /** La partida volviendo `back` jugadas. */
  session(back: number): ManualGame
}

type HandoverSnapshot = Pick<AutoSnapshot, 'initial' | 'mineActions' | 'playStarts' | 'ask' | 'chainSteps' | 'names'>

const PLAY_ASKS = new Set<string>(['select_idlecmd', 'select_battlecmd'])
const codeOfCardId = (id: string) => Number(id.replace(/^.*card-/, '').split('-')[0])

/**
 * «Seguir en manual»: la partida del automático, para seguirla en la mesa manual. Una jugada es lo que el núcleo hizo desde que elegiste algo del menú principal o del de batalla
 * hasta que te devolvió el control (`playStarts`); la mesa es una proyección determinista, así que recortar las jugadas ahí da la misma mesa que deshacer en el núcleo, también
 * con el núcleo caído (la última mesa buena). Una jugada que todavía no movió nada no cuenta. El rival: si jugaba con handtraps (`rival`, la mano que le repartió el simulador
 * con esa semilla), su mano, con las que ya activó hasta ahí como usadas; su campo y su cementerio no existen en la mesa manual.
 */
export function manualHandover(snap: HandoverSnapshot, nameOf: (id: string) => string | undefined, rival?: { hand: RivalHand; names: Record<string, string> }): ManualHandover {
  const opening = foldOpeningHand(snap.initial.mine, snap.mineActions)
  const actions = snap.mineActions.slice(opening.skip)
  const pending = snap.ask !== null && PLAY_ASKS.has(snap.ask.ask.type) ? 1 : 0
  const names = { ...Object.fromEntries(Object.entries(snap.names).map(([code, name]) => [`card-${code}-1`, name])), ...rival?.names }
  const labels = describeMatSteps(opening.initial, actions, (id) => nameOf(id) ?? names[id] ?? id)
  // De la última hacia atrás.
  const starts = snap.playStarts
    .slice(0, snap.playStarts.length - pending)
    .map((at) => at - opening.skip)
    .filter((at) => at >= 0 && at < actions.length)
    .reverse()

  return {
    plays: starts.slice(0, MANUAL_BACK_MAX).map((at) => ({ at, label: labels[at] ?? '' })),
    session(back) {
      const cut = starts[back - 1] ?? actions.length
      const initial = rival ? { ...opening.initial, rival: { hand: rival.hand.hand, used: usedUpTo(snap, rival.hand, cut + opening.skip) } } : opening.initial

      return { initial, actions: actions.slice(0, cut), names }
    },
  }
}

/** Las handtraps de su mano que el rival ya activó antes de la jugada `at` (contada en `mineActions`), en orden. */
function usedUpTo(snap: HandoverSnapshot, hand: RivalHand, at: number): string[] {
  const used: string[] = []

  for (const step of snap.chainSteps) {
    if (step.at >= at || step.kind !== 'chain' || !step.link || step.link.mine) continue
    const id = hand.hand.find((entry) => !used.includes(entry) && codeOfCardId(entry) === step.link!.code)

    if (id) used.push(id)
  }

  return used
}
