import { t } from '../i18n'
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
  /** Cartas marcadas como objetivo de un efecto (la marca se va al cambiar de lugar). */
  targeted: string[]
}

/** Cómo llega la carta al campo (sólo cambia el texto de la jugada): Invocación Normal, Especial, o como escala de péndulo. */
type MatSummon = 'normal' | 'special' | 'scale'
/** Invocación desde el Extra Deck: con qué se hace (y a dónde van los materiales). */
type ExtraSummon = 'fusion' | 'synchro' | 'xyz' | 'link'

export type MatAction =
  | { type: 'draw'; count: number }
  | { type: 'mill'; count: number }
  | { type: 'shuffle'; seed: number }
  /** `deck` = tope del deck. `faceDown` sólo aplica al destierro. `shuffle`: la carta salió mirando el deck y el resto se baraja con esa semilla en la misma jugada. */
  | { type: 'move'; id: string; to: MatPile | 'deck-bottom'; faceDown?: boolean; shuffle?: number }
  | { type: 'place'; id: string; zone: MatSpot; index: number; pos: MatPos; how?: MatSummon; shuffle?: number }
  /** Invocación Normal (o Colocar) de un monstruo de Nivel 5+: los sacrificios van al cementerio y la carta sale a la zona. */
  | { type: 'tribute'; id: string; tributes: string[]; zone: MatZone; index: number; pos: MatPos }
  /** Invocación desde el Extra Deck con materiales del campo: Fusión, Sincronía y Enlace los mandan al cementerio; Xyz los pone debajo. */
  | { type: 'summon'; id: string; how: ExtraSummon; materials: string[]; zone: MatZone; index: number; pos: MatPos }
  /** Pone la carta como material Xyz debajo de otra que está en el campo. */
  | { type: 'attach'; id: string; to: string }
  | { type: 'position'; id: string; pos: MatPos }
  | { type: 'counter'; id: string; delta: number }
  /** Una ficha en una zona de monstruo, en ataque o en defensa (las fichas guardadas antes de elegir la posición no tienen `pos` y salen en ataque). */
  | { type: 'token'; zone: MatZone; index: number; pos?: Exclude<MatPos, 'set'> }
  /** Activar el efecto de una carta (queda anotado); con costo, la carta se descarta o se destierra. */
  | { type: 'activate'; id: string; cost?: 'discard' | 'banish' }
  /** Mostrar una carta (de la mano, en general): sólo queda anotado. */
  | { type: 'reveal'; id: string }
  /** Declarar el nombre de una carta (para efectos que lo piden): sólo queda anotado. */
  | { type: 'declare'; id: string }
  /** Target (o quitar el target) de una carta: el objetivo de un efecto, con una mira encima. */
  | { type: 'target'; id: string }
  /**
   * Atacar con un monstruo en ataque durante la Battle Phase: sólo queda anotado (el daño y la destrucción se cuentan a mano, como en la mesa).
   * `target` es un monstruo del rival, con el id que el rival le dio (en un duelo); sin `target`, es un ataque directo.
   */
  | { type: 'attack'; id: string; target?: string }
  /**
   * Cambiar de fase; de la End Phase a la Draw Phase empieza otro turno y se roba 1 carta. `skipDraw` (en un duelo) no la roba: el turno del rival
   * no se terminó todavía, y la carta se roba cuando empieza el turno propio.
   */
  | { type: 'phase'; phase: MatPhase; skipDraw?: true }
  /**
   * Control de un monstruo (duelo): `give` lo saca de mi campo (los materiales van a mi cementerio) para que lo tenga el rival, o lo devuelve si era de él (su id lleva `f.`);
   * `take` pone en mi campo una carta de él (con su id `f.…`); `regain` me devuelve una carta mía que el rival tenía (al campo o a una pila). Lo que hace uno, el otro lo
   * completa solo en su mesa (`auto`: la jugada de respuesta, que no vuelve a provocar otra). Ver `mat-control.ts`.
   */
  | { type: 'give'; id: string; auto?: true }
  | { type: 'take'; id: string; zone: 'mz'; index: number; pos: MatPos; auto?: true }
  | { type: 'regain'; id: string; to: MatPile | 'deck-bottom' | 'mz'; index?: number; pos?: MatPos; faceDown?: boolean; auto?: true }

const ZONE_SIZES: Record<MatZone, number> = { mz: 5, emz: 2, st: 5 }

const TOKEN_PREFIX = 'token-'

export const isToken = (id: string) => id.startsWith(TOKEN_PREFIX)

/** El prefijo de una carta del rival que yo controlo (`f.c12`: la `c12` es el id con que su dueño la llama por la red). Al salir del campo vuelve a su dueño, no va a mis pilas. */
export const FOREIGN_PREFIX = 'f.'

export const isForeignId = (id: string) => id.startsWith(FOREIGN_PREFIX)

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
    targeted: [],
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
function removeEverywhere(source: MatState, id: string): { state: MatState; placed: Placed | null } {
  const where = locateCard(source, id)

  if (!where) {
    return { state: source, placed: null }
  }

  // Al cambiar de lugar la carta deja de ser objetivo.
  const state = source.targeted.includes(id) ? { ...source, targeted: source.targeted.filter((card) => card !== id) } : source

  if (where.kind === 'pile') {
    const facedown = where.pile === 'banished' ? state.facedown.filter((card) => card !== id) : state.facedown
    return { state: { ...state, [where.pile]: state[where.pile].filter((card) => card !== id), facedown }, placed: null }
  }

  if (where.kind === 'material') {
    const owner = locateCard(state, where.of)

    if (owner?.kind !== 'spot') {
      return { state: source, placed: null }
    }

    const placed = { ...owner.placed, materials: owner.placed.materials.filter((card) => card !== id) }
    return { state: withPlaced(state, owner.spot, owner.index, placed), placed: null }
  }

  return { state: withPlaced(state, where.spot, where.index, null), placed: where.placed }
}

/** Al dejar el campo, los materiales Xyz van al cementerio (las fichas desaparecen). */
function dropMaterials(state: MatState, placed: Placed | null): MatState {
  // Las fichas desaparecen y las cartas del rival no se quedan en mi cementerio (vuelven a su dueño).
  const materials = placed?.materials.filter((id) => !isToken(id) && !isForeignId(id)) ?? []
  return materials.length === 0 ? state : { ...state, gy: [...state.gy, ...materials] }
}

function pileLength(state: MatState, count: number): number {
  return Math.max(0, Math.min(Math.floor(count), state.deck.length))
}

/**
 * Una carta que viene de afuera al deck con una semilla (la opción "Al azar" de "Al deck"): se pone y se baraja TODO el deck, la carta incluida. Si ya estaba en el deck (buscarla
 * y ponerla arriba o abajo), la semilla baraja el resto y la carta queda donde se dijo.
 */
function shufflesIn(before: MatState, action: MatAction): boolean {
  return action.type === 'move' && action.shuffle !== undefined && (action.to === 'deck' || action.to === 'deck-bottom') && !before.deck.includes(action.id)
}

/** Buscar en el deck: después de sacar la carta, el resto se baraja en la misma jugada. */
function reshuffled(state: MatState, seed: number | undefined): MatState {
  return seed === undefined ? state : { ...state, deck: shuffleWithSeed(state.deck, seed) }
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
      const mixIn = shufflesIn(state, action)
      const bare = dropMaterials(removed.state, removed.placed)
      const next = mixIn ? bare : reshuffled(bare, action.shuffle)

      // Una ficha fuera del campo deja de existir; una carta del rival vuelve a su dueño (sale de mi mesa sin entrar a mis pilas).
      if (isToken(action.id) || isForeignId(action.id)) {
        return next
      }

      if (action.to === 'deck') {
        const deck = [action.id, ...next.deck]
        return { ...next, deck: mixIn ? shuffleWithSeed(deck, action.shuffle!) : deck }
      }

      const pile = action.to === 'deck-bottom' ? 'deck' : action.to
      const facedown = action.to === 'banished' && action.faceDown ? [...next.facedown, action.id] : next.facedown
      const grown = { ...next, [pile]: [...next[pile], action.id], facedown }
      return mixIn ? { ...grown, deck: shuffleWithSeed(grown.deck, action.shuffle!) } : grown
    }

    case 'place': {
      const size = action.zone === 'field' ? 1 : ZONE_SIZES[action.zone]

      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= size || placedAt(state, action.zone, action.index) || !locateCard(state, action.id)) {
        return state
      }

      const removed = removeEverywhere(state, action.id)
      const kept = removed.placed
      const placed: Placed = { id: action.id, pos: action.pos, counters: kept?.counters ?? 0, materials: kept?.materials ?? [] }

      return withPlaced(reshuffled(removed.state, action.shuffle), action.zone, action.index, placed)
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
      // Una ficha no se coloca boca abajo: cualquier otra posición sale en ataque.
      return withPlaced({ ...state, tokens }, action.zone, action.index, { id: `${TOKEN_PREFIX}${tokens}`, pos: action.pos === 'def' ? 'def' : 'atk', counters: 0, materials: [] })
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

    case 'summon': {
      if (action.materials.length === 0 || !state.extra.includes(action.id) || action.materials.includes(action.id)) {
        return state
      }

      let next = state

      for (const material of action.materials) {
        const where = locateCard(next, material)

        // Sólo monstruos propios en el campo; una ficha no puede ser material Xyz (sí de Enlace: desaparece al salir del campo).
        if (where?.kind !== 'spot' || where.spot === 'st' || where.spot === 'field' || (action.how === 'xyz' && isToken(material))) {
          return state
        }

        next = matReducer(next, { type: 'move', id: material, to: 'gy' })
      }

      const placed = matReducer(next, { type: 'place', id: action.id, zone: action.zone, index: action.index, pos: action.pos, how: 'special' })

      if (placed === next) return state
      if (action.how !== 'xyz') return placed

      // Los materiales Xyz pasan del cementerio a debajo de la carta.
      return action.materials.reduce((current, material) => matReducer(current, { type: 'attach', id: material, to: action.id }), placed)
    }

    case 'activate': {
      if (!action.cost || !locateCard(state, action.id)) {
        return state
      }

      return matReducer(state, { type: 'move', id: action.id, to: action.cost === 'discard' ? 'gy' : 'banished' })
    }

    case 'reveal':
    case 'declare':
    case 'attack':
      return state

    case 'target': {
      if (!locateCard(state, action.id)) {
        return state
      }

      const marked = state.targeted.includes(action.id)
      return { ...state, targeted: marked ? state.targeted.filter((card) => card !== action.id) : [...state.targeted, action.id] }
    }

    case 'give': {
      const where = locateCard(state, action.id)

      // Sólo se da un monstruo del campo (una ficha tampoco).
      if (where?.kind !== 'spot' || (where.spot !== 'mz' && where.spot !== 'emz') || isToken(action.id)) {
        return state
      }

      const removed = removeEverywhere(state, action.id)

      return dropMaterials(removed.state, removed.placed)
    }

    case 'take': {
      const free = action.zone === 'mz' && Number.isInteger(action.index) && action.index >= 0 && action.index < ZONE_SIZES.mz && !state.mz[action.index]

      if (!isForeignId(action.id) || !free || locateCard(state, action.id)) {
        return state
      }

      return withPlaced(state, 'mz', action.index, { id: action.id, pos: action.pos, counters: 0, materials: [] })
    }

    case 'regain': {
      // Una carta mía que ya no está en mi mesa (la tenía el rival).
      if (isForeignId(action.id) || isToken(action.id) || locateCard(state, action.id)) {
        return state
      }

      if (action.to === 'mz') {
        const index = action.index

        if (index === undefined || !Number.isInteger(index) || index < 0 || index >= ZONE_SIZES.mz || state.mz[index]) {
          return state
        }

        return withPlaced(state, 'mz', index, { id: action.id, pos: action.pos ?? 'atk', counters: 0, materials: [] })
      }

      if (action.to === 'deck') {
        return { ...state, deck: [action.id, ...state.deck] }
      }

      const pile = action.to === 'deck-bottom' ? 'deck' : action.to
      const facedown = action.to === 'banished' && action.faceDown ? [...state.facedown, action.id] : state.facedown

      return { ...state, [pile]: [...state[pile], action.id], facedown }
    }

    case 'phase': {
      if (!isPhase(action.phase) || action.phase === state.phase) {
        return state
      }

      // De la End Phase a la Draw Phase empieza otro turno, y en la Draw Phase se roba 1 carta (regla del juego).
      const newTurn = state.phase === 'end' && action.phase === 'draw'
      const next = { ...state, phase: action.phase, turn: newTurn ? state.turn + 1 : state.turn }
      return newTurn && !action.skipDraw ? matReducer(next, { type: 'draw', count: 1 }) : next
    }

    default:
      return state
  }
}

export function replayMat(initial: MatState, actions: readonly MatAction[], upTo = actions.length): MatState {
  return actions.slice(0, upTo).reduce(matReducer, initial)
}

/** De dónde viene la carta en "va de {pile} a la mano": sólo el Extra Deck y el destierro llegan a esa frase (del deck y del cementerio hay una frase propia). */
const PILE_PHRASE_KEY = { extra: 'practice.step.pile.extra', banished: 'practice.step.pile.banished' } as const

/** La posición dicha en una jugada: boca abajo se cuenta como defensa. */
const positionName = (pos: MatPos) => t(pos === 'atk' ? 'practice.step.position.atk' : 'practice.step.position.def')

/** Qué hace la jugada, en una línea: `before` es el estado previo (para saber de dónde viene la carta). */
export function describeMatAction(before: MatState, action: MatAction, nameOf: (id: string) => string): string {
  const name = (id: string) => (isToken(id) ? t('practice.token.the') : nameOf(id))
  const text = describePlay(before, action, name)

  if (action.type === 'move' && shufflesIn(before, action)) {
    return t('practice.step.deckShuffled', { card: name(action.id) })
  }

  // La carta salió mirando el deck y el resto se barajó en la misma jugada.
  return (action.type === 'move' || action.type === 'place') && action.shuffle !== undefined ? t('practice.step.andShuffle', { text }) : text
}

function describePlay(before: MatState, action: MatAction, name: (id: string) => string): string {
  switch (action.type) {
    case 'draw': {
      const top = before.deck[0]
      return action.count === 1 && top ? t('practice.step.draw', { card: name(top) }) : t('practice.step.drawCount', { count: action.count })
    }

    case 'mill': {
      const top = before.deck[0]
      return action.count === 1 && top ? t('practice.step.mill', { card: name(top) }) : t('practice.step.millCount', { count: action.count })
    }

    case 'shuffle':
      return t('practice.step.shuffle')

    case 'move': {
      const card = name(action.id)
      const from = locateCard(before, action.id)
      const fromPile = from?.kind === 'pile' ? from.pile : null

      switch (action.to) {
        case 'hand':
          if (fromPile === 'deck') return t('practice.step.search', { card })
          if (fromPile === 'gy') return t('practice.step.recover', { card })
          if (fromPile && fromPile !== 'hand') return t('practice.step.pileToHand', { card, pile: t(PILE_PHRASE_KEY[fromPile]) })
          return t('practice.step.backToHand', { card })
        case 'gy':
          if (isToken(action.id)) return t('practice.step.tokenGone')
          return fromPile === 'deck' ? t('practice.step.mill', { card }) : t('practice.step.toGy', { card })
        case 'banished':
          return action.faceDown ? t('practice.step.banishFaceDown', { card }) : t('practice.step.banish', { card })
        case 'extra':
          return t('practice.step.toExtra', { card })
        case 'deck':
          return t('practice.step.deckTop', { card })
        case 'deck-bottom':
          return t('practice.step.deckBottom', { card })
        default:
          return t('practice.step.move', { card })
      }
    }

    case 'place': {
      const card = name(action.id)
      const from = locateCard(before, action.id)
      const position = positionName(action.pos)

      if (from?.kind === 'spot') {
        return t('practice.step.moveZone', { card })
      }

      if (action.how === 'scale') return t('practice.step.scale', { card })

      if (action.zone === 'st' || action.zone === 'field') {
        return action.pos === 'set' ? t('practice.step.setSpellTrap', { card }) : t('practice.step.activate', { card })
      }

      if (action.pos === 'set') return t('practice.step.setFaceDown', { card })
      if (action.how === 'normal') return t('practice.step.normalSummon', { card })
      if (action.how === 'special') return t('practice.step.specialSummon', { card, position })
      return t('practice.step.enters', { card, position })
    }

    case 'tribute': {
      const card = name(action.id)
      const list = listNames(action.tributes.map(name))

      return action.pos === 'set' ? t('practice.step.tributeSet', { card, list }) : t('practice.step.tributeSummon', { card, list })
    }

    case 'summon': {
      const params = { summon: t(SUMMON_NAME_KEY[action.how]), card: name(action.id), materials: listNames(action.materials.map(name)) }

      return t(action.pos === 'def' ? 'practice.step.summonDefense' : 'practice.step.summon', params)
    }

    case 'attach':
      return t('practice.step.attach', { card: name(action.id), target: name(action.to) })

    case 'position': {
      const card = name(action.id)
      const from = locateCard(before, action.id)
      const wasSet = from?.kind === 'spot' && from.placed.pos === 'set'
      const spell = from?.kind === 'spot' && (from.spot === 'st' || from.spot === 'field')

      if (action.pos === 'set') return t('practice.step.turnFaceDown', { card })
      if (wasSet && spell) return t('practice.step.activate', { card })
      if (wasSet) return action.pos === 'atk' ? t('practice.step.flipSummon', { card }) : t('practice.step.turnFaceUp', { card })
      return t('practice.step.toPosition', { card, position: positionName(action.pos) })
    }

    case 'activate': {
      const card = name(action.id)
      if (action.cost === 'discard') return t('practice.step.effectDiscard', { card })
      if (action.cost === 'banish') return t('practice.step.effectBanish', { card })
      return t('practice.step.effect', { card })
    }

    case 'reveal':
      return t('practice.step.reveal', { card: name(action.id) })

    case 'declare':
      return t('practice.step.declare', { card: name(action.id) })

    case 'attack':
      return action.target === undefined ? t('practice.step.attackDirect', { card: name(action.id) }) : t('practice.step.attack', { card: name(action.id), target: name(action.target) })

    case 'target':
      return before.targeted.includes(action.id) ? t('practice.step.untarget', { card: name(action.id) }) : t('practice.step.target', { card: name(action.id) })

    case 'phase': {
      const phase = PHASES.find((entry) => entry.id === action.phase)?.name ?? action.phase

      if (before.phase === 'end' && action.phase === 'draw') {
        const top = action.skipDraw ? undefined : before.deck[0]
        const turn = before.turn + 1

        return top ? t('practice.step.newTurnDraw', { turn, phase, card: name(top) }) : t('practice.step.newTurn', { turn, phase })
      }

      return t('practice.step.phase', { phase })
    }

    case 'give':
      return t(isForeignId(action.id) ? 'practice.step.giveBack' : action.auto ? 'practice.step.taken' : 'practice.step.give', { card: name(action.id) })

    case 'take':
      return t(action.auto ? 'practice.step.receive' : 'practice.step.take', { card: name(action.id) })

    case 'regain':
      return t(action.to === 'mz' && !action.auto ? 'practice.step.regainControl' : 'practice.step.regain', { card: name(action.id) })

    case 'counter': {
      const from = locateCard(before, action.id)
      const counters = Math.max(0, (from?.kind === 'spot' ? from.placed.counters : 0) + Math.trunc(action.delta))
      return t('practice.step.counter', { card: name(action.id), count: counters })
    }

    case 'token': {
      const zone = t(action.zone === 'emz' ? 'practice.step.tokenExtraZone' : 'practice.step.tokenZone', { n: action.index + 1 })

      return t('practice.step.tokenSummon', { position: positionName(action.pos === 'def' ? 'def' : 'atk'), zone })
    }

    default:
      return t('practice.step.play')
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
  fusion: boolean
  synchro: boolean
  xyz: boolean
  /** Los Link no tienen defensa: ni se ponen en defensa ni boca abajo. */
  link: boolean
  /** Nivel (o Rango): de 5 a 6 la Invocación Normal pide 1 Sacrificio; de 7 en adelante, 2. */
  level: number | null
}

export const TOKEN_KIND: MatCardKind = { monster: true, spell: false, trap: false, extra: false, effect: false, fieldSpell: false, pendulum: false, fusion: false, synchro: false, xyz: false, link: false, level: null }

/** Con qué se Invoca un monstruo del Extra Deck usando materiales del campo (null: p. ej. un Péndulo boca arriba, que sale sin materiales). */
function extraSummonOf(kind: MatCardKind): ExtraSummon | null {
  return kind.link ? 'link' : kind.xyz ? 'xyz' : kind.synchro ? 'synchro' : kind.fusion ? 'fusion' : null
}

const SUMMON_NAME_KEY = {
  fusion: 'practice.step.summonName.fusion',
  synchro: 'practice.step.summonName.synchro',
  xyz: 'practice.step.summonName.xyz',
  link: 'practice.step.summonName.link',
} as const satisfies Record<ExtraSummon, string>

/** "A", "A y B", "A, B y C" (en inglés, "A, B, and C"). */
function listNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? ''

  return t(names.length === 2 ? 'practice.list.two' : 'practice.list.many', { head: names.slice(0, -1).join(', '), last: names[names.length - 1]! })
}

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
    fusion: frame.includes('fusion'),
    synchro: frame.includes('synchro'),
    xyz: frame.includes('xyz'),
    link: frame.includes('link'),
    level: monster && typeof card?.level === 'number' ? card.level : null,
  }
}

export interface MatTarget {
  zone: MatSpot
  index: number
}

/** Un monstruo del rival al que se puede atacar: su id (el que él le dio) y cómo se lo nombra en el menú. */
export interface AttackTarget {
  id: string
  label: string
}

/** En un duelo: a quién se le puede dar el control de un monstruo y si tiene dónde ponerlo (sin una zona de monstruo libre, no se ofrece). */
export interface ControlOffer {
  rival: string
  rivalHasRoom: boolean
}

export interface MatMenuItem {
  label: string
  /** La jugada; si hay `targets`, apunta a la primera zona libre y la mesa deja elegir otra. */
  action: MatAction
  /** Zonas libres entre las que se puede elegir dónde sale la carta. */
  targets?: MatTarget[]
  /** Cuántos monstruos del campo hay que elegir como Sacrificio antes de la zona. */
  tributes?: number
  /** Segundo paso del menú (p. ej. "¿En ataque o en defensa?"): la jugada es la del hijo elegido. */
  choices?: MatMenuItem[]
  /** Invocación desde el Extra: primero se eligen los materiales en el campo y se confirma con un botón. */
  materials?: true
  /** Mandar la carta al deck "al azar": la mesa le pone la semilla al elegirla (se pone y se baraja todo el deck). */
  shuffleDeck?: true
}

/**
 * Una opción del menú que pregunta cómo después de elegirla (en ataque o en defensa, boca arriba o boca abajo): la jugada es la del hijo que se elija.
 * Los menús ofrecen la jugada ("Invocación Especial", "Desterrar") y la pregunta va en un segundo paso, nunca desplegada en la primera lista.
 */
function askItem(label: string, choices: [MatMenuItem, ...MatMenuItem[]]): MatMenuItem {
  return { label, action: choices[0].action, choices }
}

/** Desterrar es una sola jugada del menú que pregunta cómo queda la carta: boca arriba (la de "Desterrar" a secas) o boca abajo. */
export function banishItem(id: string, label: string): MatMenuItem {
  return askItem(label, [
    { label: t('practice.menu.banishFaceUp'), action: { type: 'move', id, to: 'banished' } },
    { label: t('practice.menu.banishFaceDown'), action: { type: 'move', id, to: 'banished', faceDown: true } },
  ])
}

/** Las cartas de la mesa (monstruos, Mágicas y Trampas, de campo) con sus contadores: a las que se les puede poner o quitar un contador. */
export function fieldCards(state: MatState): Placed[] {
  return [...state.mz, ...state.emz, ...state.st, state.field].flatMap((placed) => (placed ? [placed] : []))
}

/** Monstruos propios en el campo (los que se pueden sacrificar). */
export function monstersOnField(state: MatState): string[] {
  return [...state.mz, ...state.emz].flatMap((placed) => (placed ? [placed.id] : []))
}

/** Zonas de monstruo a las que puede salir una carta: la Extra Monster Zone es sólo para las que vienen del Extra Deck (Master Rule vigente). */
export function monsterZones(fromExtraDeck: boolean): readonly MatSpot[] {
  return fromExtraDeck ? ['mz', 'emz'] : ['mz']
}

/**
 * Las dos Extra Monster Zones no son de nadie hasta que alguien invoca en una: ahí la otra pasa a ser del rival. Con `rivalEmz` (qué Zonas Extra ocupa el rival, cada una
 * por su propio número: la 0 suya es la 1 mía) una Zona Extra no se puede usar si la ocupa el rival o si ya tengo un monstruo en la otra. Sin `rivalEmz` (la práctica sola) valen las dos.
 */
function extraZoneTaken(state: MatState, rivalEmz: readonly boolean[] | undefined, index: number): boolean {
  return rivalEmz !== undefined && (rivalEmz[1 - index] === true || state.emz[1 - index] != null)
}

/** Zonas libres de esos tipos, en orden. */
export function freeTargets(state: MatState, zones: readonly MatSpot[], rivalEmz?: readonly boolean[]): MatTarget[] {
  return zones.flatMap((zone): MatTarget[] =>
    zone === 'field'
      ? state.field ? [] : [{ zone, index: 0 }]
      : state[zone].flatMap((placed, index): MatTarget[] => (placed || (zone === 'emz' && extraZoneTaken(state, rivalEmz, index)) ? [] : [{ zone, index }])),
  )
}

/**
 * Lo que se puede hacer con una carta desde donde está: el menú al tocarla (cubre todo lo que hace el arrastre),
 * con las jugadas del juego: Invocación Normal y Colocar desde la mano, Invocación Especial (que pregunta la posición) desde cualquier lado,
 * Invocación por Volteo de un monstruo boca abajo, Activar efecto (con descarte como costo si está en la mano),
 * escalas de péndulo, revelar, descartar, desterrar. Las Trampas no se activan desde la mano; los Link no van a
 * defensa; las fichas no se colocan boca abajo ni salen del campo; la Extra Monster Zone sólo se ofrece a lo que
 * viene del Extra Deck.
 */
export function listCardActions(state: MatState, id: string, kindOf: (id: string) => MatCardKind, nameOf: (id: string) => string, attackTargets: readonly AttackTarget[] = [], rivalEmz?: readonly boolean[], control?: ControlOffer): MatMenuItem[] {
  const where = locateCard(state, id)

  if (!where) {
    return []
  }

  const kind = isToken(id) ? TOKEN_KIND : kindOf(id)
  const pile = where.kind === 'pile' ? where.pile : null
  const zones = monsterZones(pile === 'extra')
  const items: MatMenuItem[] = []
  const add = (label: string, action: MatAction) => items.push({ label, action })
  const target = () => add(state.targeted.includes(id) ? t('practice.menu.untarget') : t('practice.menu.target'), { type: 'target', id })
  const banish = () => items.push(banishItem(id, t('practice.menu.banish')))
  /** Una jugada que saca la carta a una zona: la primera libre por defecto, y la lista para elegir otra. */
  const placeItem = (label: string, zones: readonly MatSpot[], pos: MatPos, how?: MatSummon): MatMenuItem | null => {
    const targets = freeTargets(state, zones, rivalEmz)
    const first = targets[0]

    return first ? { label, action: { type: 'place', id, zone: first.zone, index: first.index, pos, how }, targets } : null
  }
  const placeIn = (label: string, zones: readonly MatSpot[], pos: MatPos, how?: MatSummon) => {
    const item = placeItem(label, zones, pos, how)
    if (item) items.push(item)
  }
  /** Invocación Especial: pregunta la posición después de elegirla (un Link sale en ataque, no tiene defensa). */
  const specialSummonItem = (attack: MatMenuItem | null, defense: MatMenuItem | null) => {
    if (!attack || !defense) return
    items.push(kind.link ? { ...attack, label: t('practice.menu.specialSummon') } : askItem(t('practice.menu.specialSummon'), [attack, defense]))
  }
  const specialSummon = () => specialSummonItem(placeItem(t('practice.menu.attack'), zones, 'atk', 'special'), placeItem(t('practice.menu.defense'), zones, 'def', 'special'))

  if (where.kind === 'spot') {
    const { placed, spot } = where

    if (spot === 'st' || spot === 'field') {
      if (placed.pos === 'set') add(t('practice.menu.activate'), { type: 'position', id, pos: 'atk' })
      else if (kind.effect) add(t('practice.menu.activateEffect'), { type: 'activate', id })
      if (placed.pos !== 'set') add(t('practice.menu.turnFaceDown'), { type: 'position', id, pos: 'set' })
    } else {
      if (placed.pos === 'set') {
        add(t('practice.menu.flipSummon'), { type: 'position', id, pos: 'atk' })
        add(t('practice.menu.turnFaceUp'), { type: 'position', id, pos: 'def' })
      } else {
        // Sólo en la Battle Phase y sólo un monstruo en ataque: "Atacar" pregunta a cuál de los del rival; "Ataque directo" se ofrece siempre (la mesa no hace cumplir la regla).
        if (state.phase === 'battle' && placed.pos === 'atk') {
          const [first, ...rest] = attackTargets.map((rival): MatMenuItem => ({ label: rival.label, action: { type: 'attack', id, target: rival.id } }))

          if (first) items.push(askItem(t('practice.menu.battleAttack'), [first, ...rest]))
          add(t('practice.menu.attackDirectly'), { type: 'attack', id })
        }

        if (kind.effect) add(t('practice.menu.activateEffect'), { type: 'activate', id })
        if (!kind.link) add(placed.pos === 'atk' ? t('practice.menu.toDefense') : t('practice.menu.toAttack'), { type: 'position', id, pos: placed.pos === 'atk' ? 'def' : 'atk' })
        if (!kind.link && !isToken(id)) add(t('practice.menu.turnFaceDown'), { type: 'position', id, pos: 'set' })
      }

      for (const zone of ['mz', 'emz'] as const) {
        for (const other of state[zone]) {
          if (other && other.id !== id && !isToken(other.id) && kindOf(other.id).xyz && !isToken(id)) {
            add(t('practice.menu.attachTo', { name: nameOf(other.id) }), { type: 'attach', id, to: other.id })
          }
        }
      }

      for (const material of placed.materials) {
        add(t('practice.menu.detach', { name: nameOf(material) }), { type: 'move', id: material, to: 'gy' })
      }
    }

    target()

    if (isToken(id)) {
      add(t('practice.menu.removeToken'), { type: 'move', id, to: 'gy' })
      return items
    }

    // Dar el control de un monstruo (o devolverlo a su dueño): sólo en un duelo y si el rival tiene una zona de monstruo libre.
    if (control?.rivalHasRoom && (spot === 'mz' || spot === 'emz')) {
      add(t(isForeignId(id) ? 'practice.menu.returnControl' : 'practice.menu.giveControl', { name: control.rival }), { type: 'give', id })
    }

    // Un monstruo puede pasar a la zona de Mágicas y Trampas (los que se tratan como Mágicas de Equipo o Continuas).
    if (spot !== 'st' && spot !== 'field') placeIn(t('practice.menu.toSpellTrapZone'), ['st'], 'atk')
  }

  if (where.kind === 'material') {
    add(t('practice.menu.detachToGy'), { type: 'move', id, to: 'gy' })
    banish()
    add(t('practice.menu.toHand'), { type: 'move', id, to: 'hand' })
    return items
  }

  if (pile === 'hand') {
    if (kind.monster && !kind.extra) {
      const tributes = tributesFor(kind.level)

      if (tributes === 0) {
        // Invocación Normal (siempre en ataque) o Colocar (boca abajo): la regla fija la posición, no se pregunta.
        placeIn(t('practice.menu.normalSummon'), zones, 'atk', 'normal')
        placeIn(t('practice.menu.set'), zones, 'set', 'normal')
      } else if (monstersOnField(state).length >= tributes) {
        // Nivel 5+: es la misma Invocación Normal (o Colocar) de siempre; los Sacrificios no son otra jugada, la mesa los pide al elegirla: primero ellos y al final
        // la zona (completa `tributes`, `zone` e `index`).
        const tribute = (label: string, pos: MatPos) => items.push({ label, action: { type: 'tribute', id, tributes: [], zone: 'mz', index: 0, pos }, tributes })

        tribute(t('practice.menu.normalSummon'), 'atk')
        tribute(t('practice.menu.set'), 'set')
      }
    }

    if (kind.monster) specialSummon()

    if (kind.pendulum) {
      const scales = freeTargets(state, ['st']).filter((target) => target.index === 0 || target.index === 4)
      const first = scales[0]

      if (first) {
        items.push({ label: t('practice.menu.asScale'), action: { type: 'place', id, zone: 'st', index: first.index, pos: 'atk', how: 'scale' }, targets: scales })
      }
    }

    if (kind.spell) {
      const zones: MatSpot[] = kind.fieldSpell ? ['field'] : ['st']
      placeIn(t('practice.menu.activate'), zones, 'atk')
      placeIn(t('practice.menu.set'), zones, 'set')
    }

    if (kind.trap) {
      // La Trampa que se activa desde la mano por su propio efecto (una hand trap) sale boca arriba a la zona, y destella.
      placeIn(t('practice.menu.activateEffect'), ['st'], 'atk')
      placeIn(t('practice.menu.set'), ['st'], 'set')
    }

    // Un efecto de monstruo desde la mano (hand trap): se activa (destella) y después la carta va a donde diga el costo.
    if (kind.monster && kind.effect) add(t('practice.menu.activateEffect'), { type: 'activate', id })
    add(t('practice.menu.reveal'), { type: 'reveal', id })
    target()
    add(t('practice.menu.discard'), { type: 'move', id, to: 'gy' })
    banish()
  } else if (pile) {
    // Deck, Extra, cementerio o destierro.
    if (pile === 'deck') add(t('practice.menu.toHand'), { type: 'move', id, to: 'hand' })
    // Las Mágicas de Campo se activan directo desde el Deck (hay efectos que lo piden).
    if (pile === 'deck' && kind.fieldSpell) placeIn(t('practice.menu.activate'), ['field'], 'atk')
    // Colocar boca abajo directo desde el Deck (hay efectos que piden "Colocar 1 carta de tu Deck"): Mágicas y Trampas a su zona (la de Campo, a la suya) y monstruos a una Zona de Monstruo.
    if (pile === 'deck' && (kind.spell || kind.trap)) placeIn(t('practice.menu.set'), kind.fieldSpell ? ['field'] : ['st'], 'set')
    else if (pile === 'deck' && kind.monster) placeIn(t('practice.menu.set'), zones, 'set')

    const how = pile === 'extra' ? extraSummonOf(kind) : null

    if (kind.monster && how && monstersOnField(state).length > 0) {
      // Desde el Extra: posición, después los materiales en el campo (con confirmación) y al final la zona (contando las que se liberan).
      // Aunque ahora no haya una zona libre (o la única libre no se pueda usar), se ofrece: los materiales dejan zonas libres y la zona se elige al final, entre las que quedan.
      const summonItem = (label: string, pos: MatPos): MatMenuItem | null => {
        const targets = freeTargets(state, zones, rivalEmz)
        const first = targets[0] ?? { zone: 'mz' as const, index: 0 }

        return { label, action: { type: 'summon', id, how, materials: [], zone: first.zone as MatZone, index: first.index, pos }, targets, materials: true }
      }

      specialSummonItem(summonItem(t('practice.menu.attack'), 'atk'), summonItem(t('practice.menu.defense'), 'def'))
    } else if (kind.monster) {
      specialSummon()
    }
    if (kind.monster && (pile === 'gy' || pile === 'banished')) placeIn(t('practice.menu.toSpellTrapZone'), ['st'], 'atk')
    if (pile === 'gy' || pile === 'banished') {
      // Efectos que se activan en el cementerio o en el destierro.
      if (kind.effect) add(t('practice.menu.activateEffect'), { type: 'activate', id })
      add(t('practice.menu.toHand'), { type: 'move', id, to: 'hand' })
      target()
    }
    // Del Deck o del Extra (que nadie ve) se puede mostrar una carta al rival sin moverla.
    if (pile === 'deck' || pile === 'extra') add(t('practice.menu.reveal'), { type: 'reveal', id })
    if (pile !== 'gy') add(t('practice.menu.toGy'), { type: 'move', id, to: 'gy' })
    if (pile !== 'banished') banish()
  } else {
    // En el campo.
    add(t('practice.menu.toHand'), { type: 'move', id, to: 'hand' })
    add(t('practice.menu.toGy'), { type: 'move', id, to: 'gy' })
    banish()
  }

  if (kind.extra && pile !== 'extra') add(t('practice.menu.toExtra'), { type: 'move', id, to: 'extra' })

  // Arriba/abajo del deck desde cualquier lado (mano, campo, cementerio, destierro): los mismos nombres en todos los menús.
  if (!kind.extra) {
    if (pile === 'deck') {
      // Una carta que ya está en el deck (mirándolo) sólo cambia de lugar: arriba o abajo.
      add(t('practice.menu.deckTop'), { type: 'move', id, to: 'deck' })
      add(t('practice.menu.deckBottom'), { type: 'move', id, to: 'deck-bottom' })
    } else {
      // Una carta de afuera vuelve al deck: al azar (se baraja adentro), arriba o abajo; es una sola jugada del menú que pregunta cómo.
      items.push(
        askItem(t('practice.menu.toDeck'), [
          { label: t('practice.menu.deckRandom'), action: { type: 'move', id, to: 'deck' }, shuffleDeck: true },
          { label: t('practice.menu.deckOnTop'), action: { type: 'move', id, to: 'deck' } },
          { label: t('practice.menu.deckOnBottom'), action: { type: 'move', id, to: 'deck-bottom' } },
        ]),
      )
    }
  }

  return items
}

/**
 * Lo que se puede hacer con una carta soltada en una zona libre: el mismo menú que al tocarla (con las mismas preguntas después), sólo con
 * las jugadas que la sacan justo a esa zona, ya apuntadas a ella. Una pregunta que queda con una sola salida ya no pregunta.
 */
export function listDropActions(state: MatState, id: string, kindOf: (id: string) => MatCardKind, nameOf: (id: string) => string, target: MatTarget, rivalEmz?: readonly boolean[]): MatMenuItem[] {
  const aim = (item: MatMenuItem): MatMenuItem[] => {
    const { action } = item

    if (item.choices) {
      const [first, ...rest] = item.choices.flatMap(aim)

      if (!first) return []
      return rest.length > 0 ? [askItem(item.label, [first, ...rest])] : [{ ...first, label: item.label }]
    }

    // Por Sacrificio la zona se completa después (sólo las principales); el resto sale a una de las zonas libres que ofrece.
    if (action.type === 'tribute') return target.zone === 'mz' ? [{ ...item, action: { ...action, ...target, zone: 'mz' }, targets: [target] }] : []
    if (action.type === 'place' && item.targets?.some((free) => free.zone === target.zone && free.index === target.index)) return [{ ...item, action: { ...action, ...target }, targets: [target] }]

    return []
  }

  return listCardActions(state, id, kindOf, nameOf, [], rivalEmz).flatMap(aim)
}
