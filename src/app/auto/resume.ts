import { isForeignId, isToken, type MatPhase, type MatState, type Placed } from '../practice-mat'
import { LOCATION as L, POSITION as P, type PlacedCard, type Seat, type Setup } from './protocol'

/**
 * Pasar de manual a automático: la mesa manual (la propia y la del rival) como la arma el núcleo antes de empezar (`setup` del `create`, `core-host.ts`) y como la siembra
 * el adaptador (`adapter.ts`, `setup`): las dos leen la misma mesa, así las secuencias del núcleo y los lugares de la mesa coinciden desde el arranque. Lo que el núcleo
 * no puede recibir (`docs/duelos-automaticos.md`): el turno y la fase (arranca en el turno 1, en la Draw Phase de quien tiene el turno, y pasa a su Main Phase 1), lo hecho
 * en el turno en curso, los equipos (la mesa no los sigue) y los contadores (la mesa no sabe de qué tipo son: se pierden). Por eso sólo se pasa en un punto limpio: tu Main
 * Phase 1 o 2, sin fichas ni cartas bajo el control del otro (`whyNotResume`).
 */

/** Los flags del duelo rearmado: las reglas de siempre, el deck tal cual (sin barajar al empezar) y Battle Phase en el «turno 1» del núcleo (es un turno empezado). */
export const RESUME_FLAGS = (190_464n | 16n | 2n).toString()

/** Por qué una mesa no se puede seguir en automático ahora (clave de `auto.resume.*`), o null si se puede. */
export function whyNotResume(mine: MatState, theirs: MatState | null): 'phase' | 'tokens' | 'control' | null {
  const CLEAN: MatPhase[] = ['main1', 'main2']

  if (!CLEAN.includes(mine.phase)) return 'phase'
  const ids = [...allIds(mine), ...(theirs ? allIds(theirs) : [])]

  if (ids.some(isToken)) return 'tokens'
  if (ids.some(isForeignId)) return 'control'

  return null
}

const placedIds = (state: MatState) => [...state.mz, ...state.emz, ...state.st, state.field].flatMap((card) => (card ? [card.id, ...card.materials] : []))
const allIds = (state: MatState) => [...state.deck, ...state.hand, ...state.gy, ...state.banished, ...state.extra, ...placedIds(state)]

/** La posición del núcleo de una carta puesta en una casilla. */
const positionOf = (zone: 'mz' | 'st', placed: Placed) => (placed.pos === 'set' ? (zone === 'mz' ? P.FACEDOWN_DEFENSE : P.FACEDOWN) : zone === 'mz' ? (placed.pos === 'def' ? P.FACEUP_DEFENSE : P.FACEUP_ATTACK) : P.FACEUP)

/**
 * La mesa de un asiento como cartas del núcleo (`codeOf` da el código de cada id; 0 si quien mira no lo sabe). El deck de la mesa va tope primero: en el núcleo la de abajo es
 * la secuencia 0. Las pilas, en el orden de la mesa (el cementerio y el destierro, de la más vieja a la más nueva, como el núcleo).
 */
export function placedCards(state: MatState, controller: Seat, codeOf: (id: string) => number): PlacedCard[] {
  const out: PlacedCard[] = []
  const pile = (ids: readonly string[], location: number, position: (id: string) => number) => ids.forEach((id, sequence) => out.push({ code: codeOf(id), controller, location, sequence, position: position(id) }))
  const spot = (placed: Placed | null, location: number, sequence: number, zone: 'mz' | 'st') => {
    if (!placed) return
    out.push({ code: codeOf(placed.id), controller, location, sequence, position: positionOf(zone, placed), ...(placed.materials.length > 0 ? { materials: placed.materials.map(codeOf) } : {}) })
  }

  pile([...state.deck].reverse(), L.DECK, () => P.FACEDOWN_DEFENSE)
  pile(state.hand, L.HAND, () => P.FACEDOWN)
  pile(state.gy, L.GRAVE, () => P.FACEUP)
  pile(state.banished, L.REMOVED, (id) => (state.facedown.includes(id) ? P.FACEDOWN : P.FACEUP))
  pile(state.extra, L.EXTRA, (id) => (state.extraUp.includes(id) ? P.FACEUP : P.FACEDOWN_DEFENSE))
  state.mz.forEach((placed, i) => spot(placed, L.MZONE, i, 'mz'))
  state.emz.forEach((placed, i) => spot(placed, L.MZONE, 5 + i, 'mz'))
  state.st.forEach((placed, i) => spot(placed, L.SZONE, i, 'st'))
  spot(state.field, L.SZONE, 5, 'st')

  return out
}

/** El `setup` del `create`: las dos mesas por asiento (`seats[0]` es el asiento 0) y las vidas. */
export function setupOf(seats: readonly [{ state: MatState; codeOf: (id: string) => number }, { state: MatState; codeOf: (id: string) => number }], lp: readonly [number, number]): Setup {
  return { cards: [...placedCards(seats[0].state, 0, seats[0].codeOf), ...placedCards(seats[1].state, 1, seats[1].codeOf)], lp: [...lp] }
}
