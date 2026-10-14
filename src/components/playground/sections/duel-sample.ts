import { parseDerivedCardId } from '../../../app/calculator-state'
import { encodeAct, mirrorApply, openMirror, openPublic } from '../../../app/mat-public'
import { createMatState, matReducer, replayMat, type MatAction } from '../../../app/practice-mat'
import { cardIdOfDrawId } from '../../probability/practice'
import type { DuelSideView } from '../../duel/DuelTable'

/**
 * Un duelo a medias para el catálogo: la mesa propia (la real) y la del rival tal como la ve esta pantalla, o sea
 * la que llega por la red (ids opacos, y sólo se sabe qué carta es la que él mostró). Sale de las mismas piezas que
 * usa el duelo de verdad: `replayMat` para la propia y `openPublic` / `encodeAct` / `mirrorApply` para el espejo.
 */

const MAIN = [14558127, 59438930, 27204311, 5318639, 53129443, 83764718, 24094653, 44095762, 53582587, 10045474]
const EXTRA = [86066372, 4280258, 38342335]

const deck = (passcodes: readonly number[], copies: number) => passcodes.flatMap((passcode) => Array.from({ length: copies }, (_, copy) => `card-${passcode}-${copy + 1}`))

/** El arte de una carta por el número de YGOPRODeck que lleva su id (la imagen pasa por el proxy como siempre). */
const artOfCard = (drawId: string | undefined) => {
  const passcode = drawId === undefined ? null : parseDerivedCardId(cardIdOfDrawId(drawId))
  return passcode === null ? null : `https://images.ygoprodeck.com/images/cards_small/${passcode}.jpg`
}

const MY_PLAYS: MatAction[] = [
  { type: 'place', id: 'card-14558127-1', zone: 'mz', index: 1, pos: 'atk' },
  { type: 'place', id: 'card-59438930-1', zone: 'mz', index: 2, pos: 'def' },
  { type: 'place', id: 'card-27204311-1', zone: 'mz', index: 3, pos: 'set' },
  { type: 'place', id: 'card-5318639-1', zone: 'st', index: 0, pos: 'set' },
  { type: 'place', id: 'card-53129443-1', zone: 'st', index: 2, pos: 'atk' },
  { type: 'place', id: 'card-86066372-1', zone: 'emz', index: 0, pos: 'atk' },
  { type: 'counter', id: 'card-14558127-1', delta: 2 },
  { type: 'move', id: 'card-83764718-1', to: 'gy' },
  { type: 'move', id: 'card-24094653-1', to: 'gy' },
  { type: 'move', id: 'card-44095762-1', to: 'banished' },
  { type: 'place', id: 'card-53582587-1', zone: 'field', index: 0, pos: 'atk' },
]

const THEIR_PLAYS: MatAction[] = [
  { type: 'place', id: 'card-14558127-2', zone: 'mz', index: 0, pos: 'atk' },
  { type: 'place', id: 'card-59438930-2', zone: 'mz', index: 1, pos: 'set' },
  { type: 'place', id: 'card-27204311-2', zone: 'mz', index: 3, pos: 'def' },
  { type: 'place', id: 'card-5318639-2', zone: 'st', index: 1, pos: 'set' },
  { type: 'place', id: 'card-53129443-2', zone: 'st', index: 4, pos: 'atk' },
  { type: 'place', id: 'card-4280258-1', zone: 'emz', index: 0, pos: 'atk' },
  { type: 'move', id: 'card-83764718-2', to: 'gy' },
  { type: 'move', id: 'card-24094653-2', to: 'banished' },
  { type: 'draw', count: 1 },
]

export function sampleDuel(): { mine: DuelSideView; theirs: DuelSideView } {
  const myStart = createMatState(deck(MAIN, 2), deck(EXTRA, 1), 5)
  const mine = replayMat(myStart, MY_PLAYS)

  const theirStart = createMatState(deck(MAIN, 2).reverse(), deck(EXTRA, 1).reverse(), 5)
  const open = openPublic(theirStart)
  let sender = open.sender
  let state = theirStart
  let mirror = openMirror(open.masked, open.reveal)

  for (const action of THEIR_PLAYS) {
    const sent = encodeAct(sender, state, action)

    sender = sent.sender
    state = matReducer(state, action)
    mirror = mirrorApply(mirror, sent.wire)
  }

  return {
    mine: { state: mine, artOf: (id) => artOfCard(id) },
    theirs: { state: mirror.state, artOf: (id) => artOfCard(mirror.known[id]), handCount: mirror.state.hand.length },
  }
}
