import type { ApiCardReference } from '../types'

/**
 * Mesa de práctica: el estado de una partida en solitario (deck, Extra, mano, campo, cementerio y
 * destierro) y las jugadas que lo cambian. Es puro y determinista: cada jugada es un dato, así que la
 * lista de jugadas se puede deshacer, reproducir paso a paso y guardar como combo. No valida reglas
 * del juego (zonas de link, escalas, invocaciones): como en DuelingBook, el que practica manda.
 */

/** Posición en el campo. En Magias/Trampas `atk` es boca arriba y `set` boca abajo. */
export type MatPos = 'atk' | 'def' | 'set'
export type MatZone = 'mz' | 'emz' | 'st'
export type MatSpot = MatZone | 'field'
export type MatPile = 'deck' | 'extra' | 'hand' | 'gy' | 'banished'

export interface Placed {
  id: string
  pos: MatPos
  counters: number
  /** Materiales Xyz debajo de la carta. */
  materials: string[]
}

export interface MatState {
  /** Tope primero. */
  deck: string[]
  extra: string[]
  hand: string[]
  /** Último = más reciente. */
  gy: string[]
  banished: string[]
  mz: (Placed | null)[]
  emz: (Placed | null)[]
  /** Las zonas 0 y 4 hacen de zonas de péndulo. */
  st: (Placed | null)[]
  field: Placed | null
  /** Fichas creadas hasta ahora (dan los ids `token-n`). */
  tokens: number
}

export type MatAction =
  | { type: 'draw'; count: number }
  | { type: 'mill'; count: number }
  | { type: 'shuffle'; seed: number }
  /** `deck` = tope del deck. */
  | { type: 'move'; id: string; to: MatPile | 'deck-bottom' }
  | { type: 'place'; id: string; zone: MatSpot; index: number; pos: MatPos }
  /** Pone la carta como material Xyz debajo de otra que está en el campo. */
  | { type: 'attach'; id: string; to: string }
  | { type: 'position'; id: string; pos: MatPos }
  | { type: 'counter'; id: string; delta: number }
  | { type: 'token'; zone: MatZone; index: number }

const ZONE_SIZES: Record<MatZone, number> = { mz: 5, emz: 2, st: 5 }

const TOKEN_PREFIX = 'token-'

export const isToken = (id: string) => id.startsWith(TOKEN_PREFIX)

export function createMatState(deck: readonly string[], extra: readonly string[], handSize: number): MatState {
  return {
    deck: deck.slice(handSize),
    extra: [...extra],
    hand: deck.slice(0, handSize),
    gy: [],
    banished: [],
    mz: Array.from({ length: ZONE_SIZES.mz }, () => null),
    emz: Array.from({ length: ZONE_SIZES.emz }, () => null),
    st: Array.from({ length: ZONE_SIZES.st }, () => null),
    field: null,
    tokens: 0,
  }
}

/** Fisher-Yates con mulberry32: la misma semilla da siempre el mismo orden (así un combo se reproduce igual). */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  let a = seed >>> 0
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const next = [...items]

  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j]!, next[i]!]
  }

  return next
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32)

export type MatLocation =
  | { kind: 'pile'; pile: MatPile }
  | { kind: 'spot'; spot: MatSpot; index: number; placed: Placed }
  | { kind: 'material'; of: string }

const PILES: MatPile[] = ['deck', 'extra', 'hand', 'gy', 'banished']
const SPOTS: MatSpot[] = ['mz', 'emz', 'st', 'field']

function spotCards(state: MatState, spot: MatSpot): (Placed | null)[] {
  return spot === 'field' ? [state.field] : state[spot]
}

export function locateCard(state: MatState, id: string): MatLocation | null {
  for (const pile of PILES) {
    if (state[pile].includes(id)) {
      return { kind: 'pile', pile }
    }
  }

  for (const spot of SPOTS) {
    const cards = spotCards(state, spot)

    for (let index = 0; index < cards.length; index += 1) {
      const placed = cards[index]

      if (placed?.id === id) {
        return { kind: 'spot', spot, index, placed }
      }

      if (placed?.materials.includes(id)) {
        return { kind: 'material', of: placed.id }
      }
    }
  }

  return null
}

/** Todas las cartas en juego (deck, Extra, mano, pilas, campo y materiales). */
export function allMatIds(state: MatState): string[] {
  const placed = SPOTS.flatMap((spot) => spotCards(state, spot)).filter((card): card is Placed => card !== null)

  return [...PILES.flatMap((pile) => state[pile]), ...placed.flatMap((card) => [card.id, ...card.materials])]
}

export function placedAt(state: MatState, spot: MatSpot, index: number): Placed | null {
  return spot === 'field' ? state.field : (state[spot][index] ?? null)
}

function withPlaced(state: MatState, spot: MatSpot, index: number, placed: Placed | null): MatState {
  if (spot === 'field') {
    return { ...state, field: placed }
  }

  return { ...state, [spot]: state[spot].map((card, at) => (at === index ? placed : card)) }
}

/** Primera zona libre de ese tipo. */
export function firstFree(state: MatState, zone: MatZone): number | null {
  const index = state[zone].findIndex((card) => card === null)
  return index === -1 ? null : index
}

/**
 * Saca la carta de donde esté. Si estaba en el campo, sus materiales van al cementerio y se devuelve
 * su `Placed` (para conservar contadores y materiales cuando sólo cambia de zona).
 */
function removeEverywhere(state: MatState, id: string): { state: MatState; placed: Placed | null } {
  const where = locateCard(state, id)

  if (!where) {
    return { state, placed: null }
  }

  if (where.kind === 'pile') {
    return { state: { ...state, [where.pile]: state[where.pile].filter((card) => card !== id) }, placed: null }
  }

  if (where.kind === 'material') {
    const owner = locateCard(state, where.of)

    if (owner?.kind !== 'spot') {
      return { state, placed: null }
    }

    const placed = { ...owner.placed, materials: owner.placed.materials.filter((card) => card !== id) }
    return { state: withPlaced(state, owner.spot, owner.index, placed), placed: null }
  }

  return { state: withPlaced(state, where.spot, where.index, null), placed: where.placed }
}

/** Al dejar el campo, los materiales Xyz van al cementerio (las fichas desaparecen). */
function dropMaterials(state: MatState, placed: Placed | null): MatState {
  const materials = placed?.materials.filter((id) => !isToken(id)) ?? []
  return materials.length === 0 ? state : { ...state, gy: [...state.gy, ...materials] }
}

function pileLength(state: MatState, count: number): number {
  return Math.max(0, Math.min(Math.floor(count), state.deck.length))
}

export function matReducer(state: MatState, action: MatAction): MatState {
  switch (action.type) {
    case 'draw': {
      const count = pileLength(state, action.count)
      return count === 0 ? state : { ...state, deck: state.deck.slice(count), hand: [...state.hand, ...state.deck.slice(0, count)] }
    }

    case 'mill': {
      const count = pileLength(state, action.count)
      return count === 0 ? state : { ...state, deck: state.deck.slice(count), gy: [...state.gy, ...state.deck.slice(0, count)] }
    }

    case 'shuffle':
      return { ...state, deck: shuffleWithSeed(state.deck, action.seed) }

    case 'move': {
      if (!locateCard(state, action.id)) {
        return state
      }

      const removed = removeEverywhere(state, action.id)
      const next = dropMaterials(removed.state, removed.placed)

      // Una ficha fuera del campo deja de existir.
      if (isToken(action.id)) {
        return next
      }

      if (action.to === 'deck') {
        return { ...next, deck: [action.id, ...next.deck] }
      }

      const pile = action.to === 'deck-bottom' ? 'deck' : action.to
      return { ...next, [pile]: [...next[pile], action.id] }
    }

    case 'place': {
      const size = action.zone === 'field' ? 1 : ZONE_SIZES[action.zone]

      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= size || placedAt(state, action.zone, action.index) || !locateCard(state, action.id)) {
        return state
      }

      const removed = removeEverywhere(state, action.id)
      const kept = removed.placed
      const placed: Placed = { id: action.id, pos: action.pos, counters: kept?.counters ?? 0, materials: kept?.materials ?? [] }

      return withPlaced(removed.state, action.zone, action.index, placed)
    }

    case 'attach': {
      const target = locateCard(state, action.to)

      if (action.id === action.to || isToken(action.id) || target?.kind !== 'spot' || !locateCard(state, action.id)) {
        return state
      }

      const removed = removeEverywhere(state, action.id)
      const next = dropMaterials(removed.state, removed.placed)
      const owner = locateCard(next, action.to)

      if (owner?.kind !== 'spot') {
        return state
      }

      return withPlaced(next, owner.spot, owner.index, { ...owner.placed, materials: [...owner.placed.materials, action.id] })
    }

    case 'position': {
      const where = locateCard(state, action.id)
      return where?.kind === 'spot' ? withPlaced(state, where.spot, where.index, { ...where.placed, pos: action.pos }) : state
    }

    case 'counter': {
      const where = locateCard(state, action.id)

      if (where?.kind !== 'spot' || !Number.isFinite(action.delta)) {
        return state
      }

      return withPlaced(state, where.spot, where.index, { ...where.placed, counters: Math.max(0, where.placed.counters + Math.trunc(action.delta)) })
    }

    case 'token': {
      if (!(action.zone in ZONE_SIZES) || !Number.isInteger(action.index) || action.index < 0 || action.index >= ZONE_SIZES[action.zone] || state[action.zone][action.index]) {
        return state
      }

      const tokens = state.tokens + 1
      return withPlaced({ ...state, tokens }, action.zone, action.index, { id: `${TOKEN_PREFIX}${tokens}`, pos: 'atk', counters: 0, materials: [] })
    }

    default:
      return state
  }
}

export function replayMat(initial: MatState, actions: readonly MatAction[], upTo = actions.length): MatState {
  return actions.slice(0, upTo).reduce(matReducer, initial)
}

const PILE_LABELS: Record<MatPile, string> = { deck: 'el deck', extra: 'el Extra Deck', hand: 'la mano', gy: 'el cementerio', banished: 'el destierro' }

/** Qué hace la jugada, en una línea: `before` es el estado previo (para saber de dónde viene la carta). */
export function describeMatAction(before: MatState, action: MatAction, nameOf: (id: string) => string): string {
  const name = (id: string) => (isToken(id) ? 'la ficha' : nameOf(id))

  switch (action.type) {
    case 'draw': {
      const top = before.deck[0]
      return action.count === 1 && top ? `Robás ${name(top)}` : `Robás ${action.count} cartas`
    }

    case 'mill': {
      const top = before.deck[0]
      return action.count === 1 && top ? `Mandás ${name(top)} del deck al cementerio` : `Mandás ${action.count} cartas del deck al cementerio`
    }

    case 'shuffle':
      return 'Barajás el deck'

    case 'move': {
      const card = name(action.id)
      const from = locateCard(before, action.id)
      const fromPile = from?.kind === 'pile' ? from.pile : null

      switch (action.to) {
        case 'hand':
          if (fromPile === 'deck') return `Buscás ${card} del deck a la mano`
          if (fromPile === 'gy') return `Recuperás ${card} del cementerio`
          if (fromPile && fromPile !== 'hand') return `${card} va de ${PILE_LABELS[fromPile]} a la mano`
          return `${card} vuelve a la mano`
        case 'gy':
          if (isToken(action.id)) return 'La ficha desaparece'
          return fromPile === 'deck' ? `Mandás ${card} del deck al cementerio` : `${card} va al cementerio`
        case 'banished':
          return `Desterrás ${card}`
        case 'extra':
          return `${card} vuelve al Extra Deck`
        case 'deck':
          return `Ponés ${card} arriba del deck`
        case 'deck-bottom':
          return `Ponés ${card} abajo del deck`
        default:
          return `Movés ${card}`
      }
    }

    case 'place': {
      const card = name(action.id)
      const from = locateCard(before, action.id)

      if (from?.kind === 'spot') {
        return `Movés ${card} de zona`
      }

      if (action.zone === 'st' || action.zone === 'field') {
        return action.pos === 'set' ? `Colocás ${card}` : `Activás ${card}`
      }

      if (action.pos === 'set') return `Colocás ${card} boca abajo`
      return `Invocás ${card} en ${action.pos === 'atk' ? 'ataque' : 'defensa'}`
    }

    case 'attach':
      return `Adjuntás ${name(action.id)} a ${name(action.to)}`

    case 'position': {
      const card = name(action.id)
      const from = locateCard(before, action.id)
      const wasSet = from?.kind === 'spot' && from.placed.pos === 'set'

      if (action.pos === 'set') return `Ponés ${card} boca abajo`
      if (wasSet) return `Volteás ${card}`
      return `${card} pasa a ${action.pos === 'atk' ? 'ataque' : 'defensa'}`
    }

    case 'counter': {
      const from = locateCard(before, action.id)
      const counters = Math.max(0, (from?.kind === 'spot' ? from.placed.counters : 0) + Math.trunc(action.delta))
      return `Contador en ${name(action.id)}: ${counters}`
    }

    case 'token':
      return action.zone === 'emz' ? `Ficha en la zona extra ${action.index + 1}` : `Ficha en la zona ${action.index + 1}`

    default:
      return 'Jugada'
  }
}

/** Texto de cada jugada de la lista, en orden. */
export function describeMatSteps(initial: MatState, actions: readonly MatAction[], nameOf: (id: string) => string): string[] {
  const labels: string[] = []
  let state = initial

  for (const action of actions) {
    labels.push(describeMatAction(state, action, nameOf))
    state = matReducer(state, action)
  }

  return labels
}

export interface MatCardKind {
  monster: boolean
  /** Fusión, Sincro, Xyz o Link: vive en el Extra Deck. */
  extra: boolean
  fieldSpell: boolean
  pendulum: boolean
  xyz: boolean
}

export const TOKEN_KIND: MatCardKind = { monster: true, extra: false, fieldSpell: false, pendulum: false, xyz: false }

/** La API pone el subtipo de Magia/Trampa en `race` ("Field", "Quick-Play"); el marco dice si es monstruo y de qué clase. */
export function cardKindOf(card: ApiCardReference | null): MatCardKind {
  const frame = card?.frameType.toLowerCase() ?? ''
  const monster = frame !== '' && frame !== 'spell' && frame !== 'trap' && frame !== 'token'

  return {
    monster,
    extra: ['fusion', 'synchro', 'xyz', 'link'].some((kind) => frame.includes(kind)),
    fieldSpell: frame === 'spell' && (card?.race ?? '').toLowerCase() === 'field',
    pendulum: frame.includes('pendulum'),
    xyz: frame.includes('xyz'),
  }
}

export interface MatMenuItem {
  label: string
  action: MatAction
}

/** Lo que se puede hacer con una carta desde donde está: el menú al tocarla (cubre todo lo que hace el arrastre). */
export function listCardActions(state: MatState, id: string, kindOf: (id: string) => MatCardKind, nameOf: (id: string) => string): MatMenuItem[] {
  const where = locateCard(state, id)

  if (!where) {
    return []
  }

  const kind = isToken(id) ? TOKEN_KIND : kindOf(id)
  const items: MatMenuItem[] = []
  const add = (label: string, action: MatAction) => items.push({ label, action })
  const monsterZone = (() => {
    const mz = firstFree(state, 'mz')
    if (mz !== null) return { zone: 'mz' as const, index: mz }
    const emz = firstFree(state, 'emz')
    return emz !== null ? { zone: 'emz' as const, index: emz } : null
  })()
  const summon = (label: string, pos: MatPos) => monsterZone && add(label, { type: 'place', id, zone: monsterZone.zone, index: monsterZone.index, pos })
  const spell = (zone: MatSpot, index: number) => {
    add('Activar', { type: 'place', id, zone, index, pos: 'atk' })
    add('Colocar', { type: 'place', id, zone, index, pos: 'set' })
  }

  if (where.kind === 'spot') {
    const { placed, spot } = where

    if (spot === 'st' || spot === 'field') {
      if (placed.pos === 'set') add('Activar', { type: 'position', id, pos: 'atk' })
      else add('Poner boca abajo', { type: 'position', id, pos: 'set' })
    } else {
      if (placed.pos === 'set') {
        add('Voltear', { type: 'position', id, pos: 'atk' })
      } else {
        add(placed.pos === 'atk' ? 'Pasar a defensa' : 'Pasar a ataque', { type: 'position', id, pos: placed.pos === 'atk' ? 'def' : 'atk' })
        add('Poner boca abajo', { type: 'position', id, pos: 'set' })
      }

      for (const zone of ['mz', 'emz'] as const) {
        for (const other of state[zone]) {
          if (other && other.id !== id && !isToken(other.id) && kindOf(other.id).xyz && !isToken(id)) {
            add(`Adjuntar a ${nameOf(other.id)}`, { type: 'attach', id, to: other.id })
          }
        }
      }

      add('Contador +1', { type: 'counter', id, delta: 1 })
      if (placed.counters > 0) add('Contador −1', { type: 'counter', id, delta: -1 })

      for (const material of placed.materials) {
        add(`Desacoplar ${nameOf(material)}`, { type: 'move', id: material, to: 'gy' })
      }
    }

    if (isToken(id)) {
      add('Quitar la ficha', { type: 'move', id, to: 'gy' })
      return items
    }
  }

  if (where.kind === 'material') {
    add('Desacoplar al cementerio', { type: 'move', id, to: 'gy' })
    add('Desterrar', { type: 'move', id, to: 'banished' })
    add('A la mano', { type: 'move', id, to: 'hand' })
    return items
  }

  if (where.kind === 'pile') {
    if (kind.monster) {
      summon('Invocar en ataque', 'atk')
      summon('Invocar en defensa', 'def')
      if (where.pile !== 'extra') summon('Colocar boca abajo', 'set')
    }

    const scale = [0, 4].find((index) => !state.st[index])

    if (kind.pendulum && scale !== undefined) {
      add('Activar como escala', { type: 'place', id, zone: 'st', index: scale, pos: 'atk' })
    }

    if (!kind.monster) {
      if (kind.fieldSpell) {
        if (!state.field) spell('field', 0)
      } else {
        const st = firstFree(state, 'st')
        if (st !== null) spell('st', st)
      }
    }
  }

  const pile = where.kind === 'pile' ? where.pile : null

  if (pile !== 'hand') add('A la mano', { type: 'move', id, to: 'hand' })
  if (pile !== 'gy') add('Al cementerio', { type: 'move', id, to: 'gy' })
  if (pile !== 'banished') add('Desterrar', { type: 'move', id, to: 'banished' })
  if (kind.extra && pile !== 'extra') add('Al Extra Deck', { type: 'move', id, to: 'extra' })

  if (!kind.extra) {
    add('Arriba del deck', { type: 'move', id, to: 'deck' })
    add('Abajo del deck', { type: 'move', id, to: 'deck-bottom' })
  }

  return items
}
