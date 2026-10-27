import { createMatState, isForeignId, isToken, type MatPhase, type MatState, type Placed } from '../practice-mat'
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

/** El `setup` del `create`: las dos mesas por asiento (`seats[0]` es el asiento 0, el que tiene el turno: su Main Phase va en `phase`), las vidas y la cuenta de turnos de cada mesa. */
export function setupOf(seats: readonly [{ state: MatState; codeOf: (id: string) => number }, { state: MatState; codeOf: (id: string) => number }], lp: readonly [number, number]): Setup {
  const phase = seats[0].state.phase

  return { cards: [...placedCards(seats[0].state, 0, seats[0].codeOf), ...placedCards(seats[1].state, 1, seats[1].codeOf)], lp: [...lp], ...(phase === 'main1' || phase === 'main2' ? { phase } : {}), turns: [seats[0].state.turn, seats[1].state.turn] }
}

/** Lo que la sesión necesita para arrancar desde una mesa rearmada (`SessionOptions.resume`), visto desde el asiento `me`. */
export interface ResumeStates {
  mine: MatState
  theirs: MatState
  codeOf: (side: 'mine' | 'theirs', id: string) => number
  lp: readonly [number, number]
}

/**
 * Las dos mesas desde un `setup` (el camino inverso de `placedCards`; el duelo por enlace las arma así en los dos lados y en el núcleo, de la misma lista): las mías con los ids
 * de la mesa (`card-<código>-<copia>`, como `copyIds`: las mías llegan siempre con código) y las del rival con `c1`… (las ocultas vienen con código 0). El asiento 0 está en la
 * Main Phase del `setup` (si no la trae, la 1) y el otro espera en la Draw Phase; cada mesa sigue con su cuenta de turnos.
 */
export function statesOf(setup: Setup, me: Seat): ResumeStates {
  const codes = { mine: new Map<string, number>(), theirs: new Map<string, number>() }
  const build = (controller: Seat, side: 'mine' | 'theirs'): MatState => {
    const mine = side === 'mine'
    const copies = new Map<number, number>()
    let count = 0
    const idOf = (code: number) => {
      let id: string

      if (mine) {
        const copy = (copies.get(code) ?? 0) + 1

        copies.set(code, copy)
        id = `card-${code}-${copy}`
      } else id = `c${(count += 1)}`
      codes[side].set(id, code)
      return id
    }
    const cards = setup.cards.filter((card) => card.controller === controller)
    const at = (location: number) => cards.filter((card) => card.location === location).sort((a, b) => a.sequence - b.sequence)
    const state: MatState = { ...createMatState([], [], 0), phase: controller === 0 ? (setup.phase === 'main2' ? 'main2' : 'main1') : 'draw', turn: setup.turns?.[controller] ?? 1 }
    const placed = (card: PlacedCard, zone: 'mz' | 'st'): Placed => {
      const facedown = (card.position & P.FACEDOWN) !== 0

      return { id: idOf(card.code), pos: facedown ? 'set' : zone === 'mz' && (card.position & P.FACEUP_DEFENSE) !== 0 ? 'def' : 'atk', counters: 0, materials: (card.materials ?? []).map(idOf) }
    }

    // Las pilas en el orden de `placedCards`: el deck de abajo hacia arriba (la mesa lo lleva tope primero), lo demás tal cual.
    state.deck = at(L.DECK).map((card) => idOf(card.code)).reverse()
    state.hand = at(L.HAND).map((card) => idOf(card.code))
    state.gy = at(L.GRAVE).map((card) => idOf(card.code))
    for (const card of at(L.REMOVED)) {
      const id = idOf(card.code)

      state.banished.push(id)
      if ((card.position & P.FACEDOWN) !== 0) state.facedown.push(id)
    }
    for (const card of at(L.EXTRA)) {
      const id = idOf(card.code)

      state.extra.push(id)
      if ((card.position & P.FACEDOWN) === 0) state.extraUp.push(id)
    }
    for (const card of at(L.MZONE)) {
      if (card.sequence < 5) state.mz[card.sequence] = placed(card, 'mz')
      else if (card.sequence < 7) state.emz[card.sequence - 5] = placed(card, 'mz')
    }
    for (const card of at(L.SZONE)) {
      if (card.sequence < 5) state.st[card.sequence] = placed(card, 'st')
      else if (card.sequence === 5) state.field = placed(card, 'st')
    }

    return state
  }
  const mine = build(me, 'mine')
  const theirs = build((1 - me) as Seat, 'theirs')

  return { mine, theirs, codeOf: (side, id) => codes[side].get(id) ?? 0, lp: [setup.lp[me] ?? 0, setup.lp[1 - me] ?? 0] }
}

/** El `setup` como lo recibe el asiento `viewer`: las cartas del otro que están boca abajo (su mano, su deck, lo colocado, lo desterrado o en el Extra boca abajo) van con código 0. */
export function filterSetup(setup: Setup, viewer: Seat): Setup {
  return { ...setup, cards: setup.cards.map((card) => (card.controller !== viewer && (card.position & P.FACEDOWN) !== 0 ? { ...card, code: 0 } : card)) }
}

/**
 * Si la mesa que manda el invitado (sus cartas, con códigos) es la que el anfitrión ve de él en el espejo del duelo manual (`theirs.state`, con ids opacos; `known`: los que ya
 * mostró): mismos lugares, secuencias, posiciones y materiales, todo con código, y el código de cada carta que el anfitrión ya conoce. Si no, el pase no es seguro.
 */
export function tableMatches(mirror: MatState, known: Readonly<Record<string, string>>, table: readonly PlacedCard[], controller: Seat): boolean {
  const ids: string[] = []
  const expected = placedCards(mirror, controller, (id) => {
    ids.push(id)
    return 0
  })

  if (expected.length !== table.length) return false
  let next = 0

  return expected.every((card, i) => {
    const sent = table[i]!
    const same = (id: string, code: number) => {
      const real = known[id]
      const seen = real ? Number(real.split('-')[1] ?? 0) : 0

      return code > 0 && (seen === 0 || seen === code)
    }

    if (sent.controller !== controller || sent.location !== card.location || sent.sequence !== card.sequence || sent.position !== card.position || (sent.materials?.length ?? 0) !== (card.materials?.length ?? 0)) return false
    if (!same(ids[next++]!, sent.code)) return false
    return (sent.materials ?? []).every((code) => same(ids[next++]!, code))
  })
}
