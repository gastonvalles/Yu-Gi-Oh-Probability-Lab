import type { ApiCardReference } from '../types'

/**
 * Mesa de práctica: el estado de una partida en solitario (deck, Extra, mano, campo, cementerio y
 * destierro) y las jugadas que lo cambian. Es puro y determinista: cada jugada es un dato, así que la
 * lista de jugadas se puede deshacer, reproducir paso a paso y guardar como combo. No valida reglas
 * del juego (zonas de link, escalas, invocaciones): como en DuelingBook, el que practica manda.
 */

/** Posición en el campo. En Magias/Trampas `atk` es boca arriba y `set` boca abajo. */
export type MatPos = 'atk' | 'def' | 'set'
type MatZone = 'mz' | 'emz' | 'st'
export type MatSpot = MatZone | 'field'
export type MatPile = 'deck' | 'extra' | 'hand' | 'gy' | 'banished'

export interface Placed {
  id: string
  pos: MatPos
  counters: number
  /** Materiales Xyz debajo de la carta. */
  materials: string[]
}

/** Las seis fases del turno (se nombran en inglés también en el TCG en español). */
export type MatPhase = 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end'

export const PHASES: ReadonlyArray<{ id: MatPhase; short: string; name: string }> = [
  { id: 'draw', short: 'DP', name: 'Draw Phase' },
  { id: 'standby', short: 'SP', name: 'Standby Phase' },
  { id: 'main1', short: 'M1', name: 'Main Phase 1' },
  { id: 'battle', short: 'BP', name: 'Battle Phase' },
  { id: 'main2', short: 'M2', name: 'Main Phase 2' },
  { id: 'end', short: 'EP', name: 'End Phase' },
]

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
  /** Fase del turno en curso. El turno siempre empieza en la Draw Phase (en el turno 1 el que empieza no roba). */
  phase: MatPhase
  turn: number
  /** Las cartas del destierro que están boca abajo. */
  facedown: string[]
}

/** Cómo llega la carta al campo (sólo cambia el texto de la jugada): Invocación Normal, Especial, o como escala de péndulo. */
type MatSummon = 'normal' | 'special' | 'scale'

export type MatAction =
  | { type: 'draw'; count: number }
  | { type: 'mill'; count: number }
  | { type: 'shuffle'; seed: number }
  /** `deck` = tope del deck. `faceDown` sólo aplica al destierro. */
  | { type: 'move'; id: string; to: MatPile | 'deck-bottom'; faceDown?: boolean }
  | { type: 'place'; id: string; zone: MatSpot; index: number; pos: MatPos; how?: MatSummon }
  /** Invocación por Sacrificio (o Colocar por Sacrificio): los sacrificios van al cementerio y la carta sale a la zona. */
  | { type: 'tribute'; id: string; tributes: string[]; zone: MatZone; index: number; pos: MatPos }
  /** Pone la carta como material Xyz debajo de otra que está en el campo. */
  | { type: 'attach'; id: string; to: string }
  | { type: 'position'; id: string; pos: MatPos }
  | { type: 'counter'; id: string; delta: number }
  | { type: 'token'; zone: MatZone; index: number }
  /** Activar el efecto de una carta (queda anotado); con costo, la carta se descarta o se destierra. */
  | { type: 'activate'; id: string; cost?: 'discard' | 'banish' }
  /** Mostrar una carta (de la mano, en general): sólo queda anotado. */
  | { type: 'reveal'; id: string }
  /** Declarar el nombre de una carta (para efectos que lo piden): sólo queda anotado. */
  | { type: 'declare'; id: string }
  /** Cambiar de fase; de la End Phase a la Draw Phase empieza otro turno. */
  | { type: 'phase'; phase: MatPhase }

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
    phase: 'draw',
    turn: 1,
    facedown: [],
  }
}

const isPhase = (value: unknown): value is MatPhase => PHASES.some((phase) => phase.id === value)

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
    const facedown = where.pile === 'banished' ? state.facedown.filter((card) => card !== id) : state.facedown
    return { state: { ...state, [where.pile]: state[where.pile].filter((card) => card !== id), facedown }, placed: null }
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
      const facedown = action.to === 'banished' && action.faceDown ? [...next.facedown, action.id] : next.facedown
      return { ...next, [pile]: [...next[pile], action.id], facedown }
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

    case 'tribute': {
      if (action.tributes.length === 0 || !locateCard(state, action.id) || action.tributes.includes(action.id)) {
        return state
      }

      let next = state

      for (const tribute of action.tributes) {
        const where = locateCard(next, tribute)

        // Sólo se sacrifican monstruos propios en el campo (boca arriba o abajo).
        if (where?.kind !== 'spot' || where.spot === 'st' || where.spot === 'field') {
          return state
        }

        next = matReducer(next, { type: 'move', id: tribute, to: 'gy' })
      }

      const placed = matReducer(next, { type: 'place', id: action.id, zone: action.zone, index: action.index, pos: action.pos })
      return placed === next ? state : placed
    }

    case 'activate': {
      if (!action.cost || !locateCard(state, action.id)) {
        return state
      }

      return matReducer(state, { type: 'move', id: action.id, to: action.cost === 'discard' ? 'gy' : 'banished' })
    }

    case 'reveal':
    case 'declare':
      return state

    case 'phase': {
      if (!isPhase(action.phase) || action.phase === state.phase) {
        return state
      }

      // De la End Phase a la Draw Phase empieza otro turno, y en la Draw Phase se roba 1 carta (regla del juego).
      const newTurn = state.phase === 'end' && action.phase === 'draw'
      const next = { ...state, phase: action.phase, turn: newTurn ? state.turn + 1 : state.turn }
      return newTurn ? matReducer(next, { type: 'draw', count: 1 }) : next
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
          return action.faceDown ? `Desterrás ${card} boca abajo` : `Desterrás ${card}`
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
      const position = action.pos === 'atk' ? 'ataque' : 'defensa'

      if (from?.kind === 'spot') {
        return `Movés ${card} de zona`
      }

      if (action.how === 'scale') return `Activás ${card} como escala`

      if (action.zone === 'st' || action.zone === 'field') {
        return action.pos === 'set' ? `Colocás ${card}` : `Activás ${card}`
      }

      if (action.pos === 'set') return `Colocás ${card} boca abajo`
      if (action.how === 'normal') return `Invocación Normal de ${card}`
      if (action.how === 'special') return `Invocación Especial de ${card} en ${position}`
      return `${card} sale al campo en ${position}`
    }

    case 'tribute': {
      const card = name(action.id)
      const tributes = action.tributes.map(name)
      const list = tributes.length > 1 ? `${tributes.slice(0, -1).join(', ')} y ${tributes[tributes.length - 1]}` : (tributes[0] ?? '')

      return action.pos === 'set' ? `Colocás ${card} boca abajo sacrificando ${list}` : `Invocación por Sacrificio de ${card} (sacrificás ${list})`
    }

    case 'attach':
      return `Adjuntás ${name(action.id)} a ${name(action.to)}`

    case 'position': {
      const card = name(action.id)
      const from = locateCard(before, action.id)
      const wasSet = from?.kind === 'spot' && from.placed.pos === 'set'
      const spell = from?.kind === 'spot' && (from.spot === 'st' || from.spot === 'field')

      if (action.pos === 'set') return `Ponés ${card} boca abajo`
      if (wasSet && spell) return `Activás ${card}`
      if (wasSet) return action.pos === 'atk' ? `Invocación por Volteo de ${card}` : `Volteás ${card} boca arriba`
      return `${card} pasa a ${action.pos === 'atk' ? 'ataque' : 'defensa'}`
    }

    case 'activate': {
      const card = name(action.id)
      if (action.cost === 'discard') return `Activás el efecto de ${card} descartándola`
      if (action.cost === 'banish') return `Activás el efecto de ${card} desterrándola`
      return `Activás el efecto de ${card}`
    }

    case 'reveal':
      return `Revelás ${name(action.id)}`

    case 'declare':
      return `Declarás ${name(action.id)}`

    case 'phase': {
      const phase = PHASES.find((entry) => entry.id === action.phase)?.name ?? action.phase

      if (before.phase === 'end' && action.phase === 'draw') {
        const top = before.deck[0]
        return `Turno ${before.turn + 1}: ${phase}${top ? `, robás ${name(top)}` : ''}`
      }

      return `Pasás a la ${phase}`
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
  spell: boolean
  trap: boolean
  /** Fusión, Sincro, Xyz o Link: vive en el Extra Deck y sólo se Invoca de modo Especial. */
  extra: boolean
  /** Tiene efecto que activar (los monstruos Normales, no). */
  effect: boolean
  fieldSpell: boolean
  pendulum: boolean
  xyz: boolean
  /** Los Link no tienen defensa: ni se ponen en defensa ni boca abajo. */
  link: boolean
  /** Nivel (o Rango): de 5 a 6 la Invocación Normal pide 1 Sacrificio; de 7 en adelante, 2. */
  level: number | null
}

export const TOKEN_KIND: MatCardKind = { monster: true, spell: false, trap: false, extra: false, effect: false, fieldSpell: false, pendulum: false, xyz: false, link: false, level: null }

/** Sacrificios que pide la Invocación Normal (o Colocar) de un monstruo según su Nivel. */
export function tributesFor(level: number | null): number {
  if (level === null || level <= 4) return 0
  return level <= 6 ? 1 : 2
}

/** La API pone el subtipo de Magia/Trampa en `race` ("Field", "Quick-Play"); el marco dice si es monstruo y de qué clase. */
export function cardKindOf(card: ApiCardReference | null): MatCardKind {
  const frame = card?.frameType.toLowerCase() ?? ''
  const spell = frame === 'spell'
  const trap = frame === 'trap'
  const monster = frame !== '' && !spell && !trap && frame !== 'token'

  return {
    monster,
    spell,
    trap,
    extra: ['fusion', 'synchro', 'xyz', 'link'].some((kind) => frame.includes(kind)),
    effect: frame !== '' && frame !== 'normal' && frame !== 'token',
    fieldSpell: spell && (card?.race ?? '').toLowerCase() === 'field',
    pendulum: frame.includes('pendulum'),
    xyz: frame.includes('xyz'),
    link: frame.includes('link'),
    level: monster && typeof card?.level === 'number' ? card.level : null,
  }
}

export interface MatTarget {
  zone: MatSpot
  index: number
}

export interface MatMenuItem {
  label: string
  /** La jugada; si hay `targets`, apunta a la primera zona libre y la mesa deja elegir otra. */
  action: MatAction
  /** Zonas libres entre las que se puede elegir dónde sale la carta. */
  targets?: MatTarget[]
  /** Cuántos monstruos del campo hay que elegir como Sacrificio antes de la zona. */
  tributes?: number
}

/** Monstruos propios en el campo (los que se pueden sacrificar). */
export function monstersOnField(state: MatState): string[] {
  return [...state.mz, ...state.emz].flatMap((placed) => (placed ? [placed.id] : []))
}

/** Zonas libres de esos tipos, en orden. */
export function freeTargets(state: MatState, zones: readonly MatSpot[]): MatTarget[] {
  return zones.flatMap((zone): MatTarget[] =>
    zone === 'field'
      ? state.field ? [] : [{ zone, index: 0 }]
      : state[zone].flatMap((placed, index): MatTarget[] => (placed ? [] : [{ zone, index }])),
  )
}

/**
 * Lo que se puede hacer con una carta desde donde está: el menú al tocarla (cubre todo lo que hace el arrastre),
 * con las jugadas del juego: Invocación Normal / Colocar desde la mano, Invocación Especial desde cualquier lado,
 * Invocación por Volteo de un monstruo boca abajo, Activar efecto (con descarte como costo si está en la mano),
 * escalas de péndulo, revelar, descartar, desterrar. Las Trampas no se activan desde la mano; los Link no van a
 * defensa; las fichas no se colocan boca abajo ni salen del campo.
 */
export function listCardActions(state: MatState, id: string, kindOf: (id: string) => MatCardKind, nameOf: (id: string) => string): MatMenuItem[] {
  const where = locateCard(state, id)

  if (!where) {
    return []
  }

  const kind = isToken(id) ? TOKEN_KIND : kindOf(id)
  const items: MatMenuItem[] = []
  const add = (label: string, action: MatAction) => items.push({ label, action })
  /** Una jugada que saca la carta a una zona: la primera libre por defecto, y la lista para elegir otra. */
  const placeIn = (label: string, zones: readonly MatSpot[], pos: MatPos, how?: MatSummon) => {
    const targets = freeTargets(state, zones)
    const first = targets[0]

    if (first) {
      items.push({ label, action: { type: 'place', id, zone: first.zone, index: first.index, pos, how }, targets })
    }
  }
  const summon = (label: string, pos: MatPos, how: MatSummon) => placeIn(label, ['mz', 'emz'], pos, how)
  const specialSummon = () => {
    summon('Invocación Especial en ataque', 'atk', 'special')
    if (!kind.link) summon('Invocación Especial en defensa', 'def', 'special')
  }

  if (where.kind === 'spot') {
    const { placed, spot } = where

    if (spot === 'st' || spot === 'field') {
      if (placed.pos === 'set') add('Activar', { type: 'position', id, pos: 'atk' })
      else if (kind.effect) add('Activar efecto', { type: 'activate', id })
      if (placed.pos !== 'set') add('Poner boca abajo', { type: 'position', id, pos: 'set' })
    } else {
      if (placed.pos === 'set') {
        add('Invocación por Volteo', { type: 'position', id, pos: 'atk' })
        add('Voltear boca arriba', { type: 'position', id, pos: 'def' })
      } else {
        if (kind.effect) add('Activar efecto', { type: 'activate', id })
        if (!kind.link) add(placed.pos === 'atk' ? 'Pasar a defensa' : 'Pasar a ataque', { type: 'position', id, pos: placed.pos === 'atk' ? 'def' : 'atk' })
        if (!kind.link && !isToken(id)) add('Poner boca abajo', { type: 'position', id, pos: 'set' })
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
      add('Sacrificar / quitar la ficha', { type: 'move', id, to: 'gy' })
      return items
    }

    // Un monstruo puede pasar a la zona de Mágicas y Trampas (los que se tratan como Mágicas de Equipo o Continuas).
    if (spot !== 'st' && spot !== 'field') placeIn('A la zona de Mágicas y Trampas', ['st'], 'atk')
  }

  if (where.kind === 'material') {
    add('Desacoplar al cementerio', { type: 'move', id, to: 'gy' })
    add('Desterrar', { type: 'move', id, to: 'banished' })
    add('A la mano', { type: 'move', id, to: 'hand' })
    return items
  }

  const pile = where.kind === 'pile' ? where.pile : null

  if (pile === 'hand') {
    if (kind.monster && !kind.extra) {
      const tributes = tributesFor(kind.level)

      if (tributes === 0) {
        summon('Invocación Normal', 'atk', 'normal')
        summon('Colocar boca abajo', 'set', 'normal')
      } else if (monstersOnField(state).length >= tributes) {
        // Nivel 5+: primero se eligen los Sacrificios y después la zona (la mesa completa `tributes`, `zone` e `index`).
        add(`Invocación por Sacrificio (${tributes})`, { type: 'tribute', id, tributes: [], zone: 'mz', index: 0, pos: 'atk' })
        add(`Colocar por Sacrificio (${tributes})`, { type: 'tribute', id, tributes: [], zone: 'mz', index: 0, pos: 'set' })
        items[items.length - 2]!.tributes = tributes
        items[items.length - 1]!.tributes = tributes
      }
    }

    if (kind.monster) specialSummon()

    if (kind.pendulum) {
      const scales = freeTargets(state, ['st']).filter((target) => target.index === 0 || target.index === 4)
      const first = scales[0]

      if (first) {
        items.push({ label: 'Activar como escala', action: { type: 'place', id, zone: 'st', index: first.index, pos: 'atk', how: 'scale' }, targets: scales })
      }
    }

    if (kind.spell) {
      const zones: MatSpot[] = kind.fieldSpell ? ['field'] : ['st']
      placeIn('Activar', zones, 'atk')
      placeIn('Colocar', zones, 'set')
    }

    if (kind.trap) {
      // "To S/T" en DuelingBook: la Trampa que se activa desde la mano por su propio efecto sale boca arriba.
      placeIn('A la zona de Mágicas y Trampas', ['st'], 'atk')
      placeIn('Colocar', ['st'], 'set')
    }

    // Como en DuelingBook, un efecto desde la mano (hand trap) se revela y la carta va a donde diga el costo.
    add('Revelar', { type: 'reveal', id })
    add('Declarar', { type: 'declare', id })
    add('Descartar', { type: 'move', id, to: 'gy' })
    add('Desterrar', { type: 'move', id, to: 'banished' })
    add('Desterrar boca abajo', { type: 'move', id, to: 'banished', faceDown: true })
  } else if (pile) {
    // Deck, Extra, cementerio o destierro.
    if (pile === 'deck') add('A la mano', { type: 'move', id, to: 'hand' })
    if (kind.monster) specialSummon()
    if (kind.monster && (pile === 'gy' || pile === 'banished')) placeIn('A la zona de Mágicas y Trampas', ['st'], 'atk')
    if (pile === 'gy' || pile === 'banished') add('A la mano', { type: 'move', id, to: 'hand' })
    if (pile !== 'gy') add('Al cementerio', { type: 'move', id, to: 'gy' })
    if (pile !== 'banished') {
      add('Desterrar', { type: 'move', id, to: 'banished' })
      add('Desterrar boca abajo', { type: 'move', id, to: 'banished', faceDown: true })
    }
  } else {
    // En el campo.
    add('A la mano', { type: 'move', id, to: 'hand' })
    add(kind.monster ? 'Sacrificar (al cementerio)' : 'Al cementerio', { type: 'move', id, to: 'gy' })
    add('Desterrar', { type: 'move', id, to: 'banished' })
    add('Desterrar boca abajo', { type: 'move', id, to: 'banished', faceDown: true })
  }

  if (kind.extra && pile !== 'extra') add('Al Extra Deck', { type: 'move', id, to: 'extra' })

  // Arriba/abajo del deck: desde la mano y el campo (como en DuelingBook; desde el cementerio o el destierro no).
  if (!kind.extra && pile !== 'gy' && pile !== 'banished') {
    add('Arriba del deck', { type: 'move', id, to: 'deck' })
    add('Abajo del deck', { type: 'move', id, to: 'deck-bottom' })
  }

  return items
}
