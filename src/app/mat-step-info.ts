import { matEffects, type ShowcaseKind } from './mat-effects'
import { allMatIds, locateCard, matReducer, type MatAction, type MatLocation, type MatPile, type MatSpot, type MatState, type Placed } from './practice-mat'

/**
 * Lo que la lista de pasos cuenta de cada jugada además de la frase (Gastón, 2026-10-20: «nuestras replays y movimientos no se ven así»): de qué clase es (el chip),
 * de dónde sale la carta, qué cartas cambian de lugar y qué casillas del campo cambian. Todo sale de comparar el estado de antes con el de después, así que no se
 * guarda nada: el combo guardado y el replay ya traen lo necesario.
 */

/** Un lugar de la mesa dicho para una línea de «Qué se mueve»: una pila, una casilla del campo (con su número, desde 1) o debajo de un monstruo Xyz (`of`, su id). */
export type StepPlace = { kind: 'pile'; pile: MatPile } | { kind: 'zone'; spot: MatSpot; n: number } | { kind: 'material'; of: string }

/** Una carta que cambió de lugar; `null` es que no estaba (una ficha que aparece) o que ya no está (una ficha que se va). */
export interface StepMove {
  id: string
  from: StepPlace | null
  to: StepPlace | null
}

/** La clase de una jugada: el rótulo del chip. El color es el de `stepTone` (el de su destello en la mesa). */
export type StepKind =
  | 'draw'
  | 'mill'
  | 'shuffle'
  | 'normal'
  | 'special'
  | 'fusion'
  | 'synchro'
  | 'xyz'
  | 'link'
  | 'flip'
  | 'set'
  | 'activate'
  | 'target'
  | 'reveal'
  | 'declare'
  | 'attack'
  | 'position'
  | 'counter'
  | 'token'
  | 'toHand'
  | 'toGy'
  | 'banish'
  | 'toExtra'
  | 'toDeck'
  | 'attach'
  | 'zone'
  | 'control'
  | 'phase'
  | 'turn'
  | 'other'

/** De dónde sale la carta de la jugada: una pila o el campo (una zona, o un material debajo de otra carta). */
export type StepOrigin = MatPile | 'field'

export interface StepInfo {
  kind: StepKind
  origin: StepOrigin | null
  /** La carta de la jugada (la que se activa, se ataca, se invoca…); `null` si no hay una (robar, barajar, cambiar de fase). */
  card: string | null
  /** Las cartas que cambian de lugar, la de la jugada primero. Vacío si nada cambia de lugar (activar, atacar, cambiar de posición). */
  moves: StepMove[]
  /** Las casillas y pilas que quedan distintas después de la jugada (para enmarcarlas en el tablero). */
  change: BoardChange
}

/** Las casillas del campo (`mz:2`, `st:0`, `emz:1`, `field:0`) y las pilas que una jugada cambió. */
export interface BoardChange {
  spots: ReadonlySet<string>
  piles: ReadonlySet<MatPile>
  /** Las cartas que llegaron a la mano (robadas, buscadas, devueltas): se marcan en la tira de la mano del tablero chico. */
  toHand: ReadonlySet<string>
}

export const spotKey = (spot: MatSpot, index: number) => `${spot}:${index}`

const PILES: readonly MatPile[] = ['deck', 'extra', 'hand', 'gy', 'banished']
const SPOT_LISTS = ['mz', 'emz', 'st'] as const

function placeOf(location: MatLocation | null): StepPlace | null {
  if (!location) return null
  if (location.kind === 'pile') return { kind: 'pile', pile: location.pile }
  if (location.kind === 'material') return { kind: 'material', of: location.of }

  return { kind: 'zone', spot: location.spot, n: location.index + 1 }
}

/** Una clave por lugar: dos lugares son el mismo si dan la misma. */
const placeKey = (place: StepPlace | null) => (place === null ? '' : place.kind === 'pile' ? place.pile : place.kind === 'zone' ? spotKey(place.spot, place.n) : `material:${place.of}`)

/** Las cartas que cambian de lugar entre dos estados (una pila que sólo se baraja no cuenta). */
function movesBetween(before: MatState, after: MatState, first: string | null): StepMove[] {
  const ids = [...new Set([...allMatIds(before), ...allMatIds(after)])]
  const moves = ids.flatMap((id) => {
    const from = placeOf(locateCard(before, id))
    const to = placeOf(locateCard(after, id))

    return placeKey(from) === placeKey(to) ? [] : [{ id, from, to }]
  })

  // La carta de la jugada va primero; el resto, como salió.
  return first === null ? moves : [...moves.filter((move) => move.id === first), ...moves.filter((move) => move.id !== first)]
}

const samePlaced = (a: Placed | null, b: Placed | null) => a === b || (a !== null && b !== null && a.id === b.id && a.pos === b.pos && a.counters === b.counters && a.materials.join() === b.materials.join())

/** Qué casillas y pilas quedan distintas: una carta que llega, se va, cambia de posición o de contadores o de materiales; una pila que gana o pierde una carta (el deck, sólo si cambia su cantidad: barajarlo no es un cambio). */
export function boardChange(before: MatState, after: MatState): BoardChange {
  const spots = new Set<string>()
  const piles = new Set<MatPile>()

  for (const spot of SPOT_LISTS) {
    after[spot].forEach((placed, index) => {
      if (!samePlaced(before[spot][index] ?? null, placed)) spots.add(spotKey(spot, index))
    })
  }

  if (!samePlaced(before.field, after.field)) spots.add(spotKey('field', 0))

  for (const pile of PILES) {
    const changed = pile === 'deck' ? before.deck.length !== after.deck.length : before[pile].join() !== after[pile].join()

    if (changed) piles.add(pile)
  }

  return { spots, piles, toHand: new Set(after.hand.filter((id) => !before.hand.includes(id))) }
}

const originOf = (location: MatLocation | null): StepOrigin | null => (location ? (location.kind === 'pile' ? location.pile : 'field') : null)

/** Lo que se muestra en el centro al reproducir (las invocaciones se dicen por su destello: ver `kindOf`) y la clase de jugada que le toca. */
const SHOWCASE_KIND: Partial<Record<ShowcaseKind, StepKind>> = { hand: 'toHand', gy: 'toGy', banish: 'banish', extra: 'toExtra', deck: 'toDeck', attach: 'attach' }

/** Las jugadas que no tienen un destello propio (o lo tienen de otro tipo) y se dicen por lo que son. */
function kindByAction(action: MatAction): StepKind | null {
  switch (action.type) {
    case 'draw':
      return 'draw'
    case 'mill':
      return 'mill'
    case 'shuffle':
      return 'shuffle'
    case 'token':
      return 'token'
    case 'counter':
      return 'counter'
    case 'give':
    case 'take':
    case 'regain':
      return 'control'
    default:
      return null
  }
}

function kindOf(before: MatState, after: MatState, action: MatAction): StepKind {
  const byAction = kindByAction(action)

  if (byAction) return byAction
  if (action.type === 'phase') return before.turn !== after.turn ? 'turn' : 'phase'

  const effects = matEffects(before, action)

  // Dar vuelta un monstruo boca abajo es una Invocación por Volteo, no una Normal (aunque el destello sea el mismo).
  if (action.type === 'position' && effects.landing) return 'flip'
  if (effects.spotlight) return effects.spotlight.kind
  if (effects.landing) return effects.landing.tone
  if (effects.showcase) return SHOWCASE_KIND[effects.showcase.kind] ?? 'other'
  if (effects.quiet) return effects.quiet.kind === 'gy' ? 'toGy' : 'banish'

  switch (action.type) {
    case 'place':
    case 'tribute':
      return action.pos === 'set' ? 'set' : 'zone'
    case 'position':
      return action.pos === 'set' ? 'set' : 'position'
    default:
      return 'other'
  }
}

function stepBetween(before: MatState, after: MatState, action: MatAction): StepInfo {
  const card = 'id' in action ? action.id : null
  const moves = movesBetween(before, after, card)
  const from = card === null ? moves[0]?.id : card
  // Robar y mandar cartas del tope salen del deck aunque la jugada no diga cuáles.
  const origin = action.type === 'draw' || action.type === 'mill' ? 'deck' : from === undefined ? null : originOf(locateCard(before, from))

  return { kind: kindOf(before, after, action), origin, card, moves, change: boardChange(before, after) }
}

/** Todo lo que la lista de pasos cuenta de una jugada: `before` es el estado de antes. */
export const describeStep = (before: MatState, action: MatAction): StepInfo => stepBetween(before, matReducer(before, action), action)

/**
 * La mesa de cada paso, en un solo recorrido: el índice 0 es la inicial y el `i + 1`, la de después de la jugada `i` (el tablero chico de la lista).
 * Con `replayMat` paso por paso serían n² jugadas.
 */
export function matStates(initial: MatState, actions: readonly MatAction[]): MatState[] {
  const states = [initial]

  for (const action of actions) states.push(matReducer(states[states.length - 1]!, action))

  return states
}

/** La información de cada jugada de la lista, en orden; `states` (de `matStates`) evita recorrer las jugadas otra vez si ya se tienen. */
export function describeSteps(initial: MatState, actions: readonly MatAction[], states: readonly MatState[] = matStates(initial, actions)): StepInfo[] {
  return actions.map((action, index) => stepBetween(states[index]!, states[index + 1]!, action))
}
