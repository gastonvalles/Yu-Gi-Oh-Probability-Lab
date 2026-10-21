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
  // Un Monstruo de Péndulo en el Extra Deck, boca arriba.
  { type: 'move', id: 'card-10045474-1', to: 'extra', faceUp: true },
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
  { type: 'move', id: 'card-10045474-2', to: 'extra', faceUp: true },
  { type: 'draw', count: 1 },
]

/** Los nombres de las cartas de la muestra (los de YGOPRODeck), para la lista de pasos: el catálogo no baja datos de cartas. */
const NAMES: Record<number, string> = {
  14558127: 'Ash Blossom & Joyous Spring',
  59438930: 'Ghost Ogre & Snow Rabbit',
  27204311: 'Nibiru, the Primal Being',
  5318639: 'Mystical Space Typhoon',
  53129443: 'Dark Hole',
  83764718: 'Monster Reborn',
  24094653: 'Polymerization',
  44095762: 'Mirror Force',
  53582587: 'Torrential Tribute',
  10045474: 'Infinite Impermanence',
  86066372: 'Accesscode Talker',
  4280258: 'Apollousa, Bow of the Goddess',
  38342335: 'Knightmare Unicorn',
}

/** El arte de la Ficha de la mesa (la imagen de YGOPRODeck de un token). */
const TOKEN_ART = 'https://images.ygoprodeck.com/images/cards_small/73915052.jpg'

const card = (passcode: number, copy = 1) => `card-${passcode}-${copy}`

/**
 * Un combo de muestra para la lista de pasos: una mano de cinco (Ash Blossom, Ghost Ogre, Mystical Space Typhoon, Monster Reborn y Mirror Force) y dieciocho jugadas que
 * pasan por todo lo que la lista sabe decir: cambios de fase y de turno, una Invocación Normal, activar, descartar como costo, revivir del cementerio, un Enlace con dos
 * materiales, robar, buscar, colocar, desterrar, una ficha y un ataque.
 */
export function sampleCombo() {
  const hand = [card(14558127), card(59438930), card(5318639), card(83764718), card(44095762)]
  const rest = MAIN.filter((passcode) => ![14558127, 59438930, 5318639, 83764718, 44095762].includes(passcode)).map((passcode) => card(passcode))
  const initial = createMatState([...hand, ...rest, ...hand.map((id) => id.replace(/-1$/, '-2'))], deck(EXTRA, 1), 5)
  const actions: MatAction[] = [
    { type: 'phase', phase: 'main1' },
    { type: 'place', id: card(14558127), zone: 'mz', index: 1, pos: 'atk', how: 'normal' },
    { type: 'place', id: card(5318639), zone: 'st', index: 1, pos: 'atk' },
    { type: 'move', id: card(5318639), to: 'gy' },
    { type: 'activate', id: card(59438930), cost: 'discard' },
    { type: 'place', id: card(83764718), zone: 'st', index: 2, pos: 'atk' },
    { type: 'place', id: card(59438930), zone: 'mz', index: 2, pos: 'def', how: 'special' },
    { type: 'move', id: card(83764718), to: 'gy' },
    { type: 'summon', id: card(38342335), how: 'link', materials: [card(14558127), card(59438930)], zone: 'emz', index: 0, pos: 'atk' },
    { type: 'draw', count: 1 },
    { type: 'move', id: card(53129443), to: 'hand' },
    { type: 'place', id: card(44095762), zone: 'st', index: 0, pos: 'set' },
    { type: 'move', id: card(14558127), to: 'banished' },
    { type: 'token', zone: 'mz', index: 2, pos: 'atk' },
    { type: 'phase', phase: 'battle' },
    { type: 'attack', id: card(38342335) },
    { type: 'phase', phase: 'end' },
    { type: 'phase', phase: 'draw' },
  ]
  const nameOf = (id: string) => (id.startsWith('token-') ? 'Ficha' : (NAMES[parseDerivedCardId(cardIdOfDrawId(id)) ?? 0] ?? id))
  const artOf = (id: string) => (id.startsWith('token-') ? TOKEN_ART : artOfCard(id))

  return { initial, actions, nameOf, artOf }
}

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
