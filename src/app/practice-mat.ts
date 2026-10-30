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
/** Dónde puede quedar una carta cuyo control cambia de manos: una zona de monstruo, de Mágicas y Trampas o la de Campo (la Extra Monster Zone cuenta como de monstruo). */
export type MatTakeZone = 'mz' | 'st' | 'field'
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
  /**
   * Las cartas del Extra Deck que están boca arriba (un Monstruo de Péndulo que llegó ahí del campo, de la mano o del cementerio): el rival las ve, y se pueden invocar por Péndulo. Siempre son un subconjunto de `extra`.
   */
  extraUp: string[]
  /** Cartas marcadas como objetivo de un efecto (la marca se va al cambiar de lugar). */
  targeted: string[]
  /** El simulador de handtraps de «Jugar solo» (`app/handtraps.ts`): la mano del rival. Sin él (la práctica de siempre, un duelo, las mesas y los combos de antes) no hay rival. */
  rival?: RivalHand
  /**
   * Materiales Xyz debajo de una carta que sigue en el Extra Deck, por su id (duelos automáticos: la Invocación Xyz del núcleo junta los materiales antes de preguntar dónde
   * va y en qué posición). No se ven; al salir la carta del Extra se los lleva (al campo, debajo; a otro lado, al cementerio). Sin ninguno, no está.
   */
  held?: Record<string, string[]>
}

/** La mano del rival en el simulador de handtraps: lo que robó (`hand`, que no cambia: una usada se queda en su lugar) y lo que ya usó, en el orden en que lo usó. */
export interface RivalHand {
  hand: string[]
  used: string[]
}

/** Cómo llega la carta al campo (sólo cambia el texto de la jugada): Invocación Normal, Especial, de Péndulo (desde el Extra Deck boca arriba), o como escala de péndulo. */
export type MatSummon = 'normal' | 'special' | 'pendulum' | 'scale'
/** Invocación desde el Extra Deck: con qué se hace (y a dónde van los materiales). */
type ExtraSummon = 'fusion' | 'synchro' | 'xyz' | 'link'

export type MatAction =
  /**
   * Robar del tope. `ids` (duelos automáticos): cuáles se roban, estén donde estén del deck. El núcleo baraja y no le dice a nadie el orden (ni a su dueño): cuando
   * roba, dice qué carta salió, así que la mesa no puede tenerla arriba de antemano. Con `ids`, `count` no cuenta.
   */
  | { type: 'draw'; count: number; ids?: string[] }
  | { type: 'mill'; count: number }
  | { type: 'shuffle'; seed: number }
  /** `deck` = tope del deck. `faceDown` sólo aplica al destierro. `shuffle`: la carta salió mirando el deck y el resto se baraja con esa semilla en la misma jugada. */
  | { type: 'move'; id: string; to: MatPile | 'deck-bottom'; faceDown?: boolean; faceUp?: boolean; shuffle?: number }
  | { type: 'place'; id: string; zone: MatSpot; index: number; pos: MatPos; how?: MatSummon; shuffle?: number }
  /** Invocación Normal (o Colocar) de un monstruo de Nivel 5+: los sacrificios van al cementerio y la carta sale a la zona. */
  | { type: 'tribute'; id: string; tributes: string[]; zone: MatZone; index: number; pos: MatPos }
  /** Invocación desde el Extra Deck, con materiales del campo o sin ninguno: Fusión, Sincronía y Enlace los mandan al cementerio; Xyz los pone debajo. Sin materiales sale igual (como cualquier Invocación Especial). */
  | { type: 'summon'; id: string; how: ExtraSummon; materials: string[]; zone: MatZone; index: number; pos: MatPos }
  /**
   * Pone la carta como material Xyz debajo de otra que está en el campo. `held` (sólo el automático: la Invocación Xyz del núcleo junta los materiales antes de preguntar dónde
   * va la carta): debajo de una que sigue en el Extra Deck (`MatState.held`). Sin `held`, una carta del Extra no recibe materiales, como siempre en la mesa manual y el enlace.
   */
  | { type: 'attach'; id: string; to: string; held?: true }
  | { type: 'position'; id: string; pos: MatPos }
  | { type: 'counter'; id: string; delta: number }
  /** Una ficha en una zona de monstruo, en ataque o en defensa (las fichas guardadas antes de elegir la posición no tienen `pos` y salen en ataque). */
  | { type: 'token'; zone: MatZone; index: number; pos?: Exclude<MatPos, 'set'> }
  /**
   * Activar el efecto de una carta (queda anotado); con costo, la carta se descarta o se destierra. `effect` dice cuál efecto, por su lugar entre los efectos del texto (el orden de `getCardEffectMap`): sólo cuando la carta tiene
   * varios que la mesa sabe contar uno por uno (`countableEffects` en `mat-assistant.ts`); sin él, la activación no dice cuál efecto es.
   */
  | { type: 'activate'; id: string; cost?: 'discard' | 'banish'; effect?: number }
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
   * Control de una carta (duelo): `give` la saca de mi mesa —del campo (los materiales van a mi cementerio) o de una pila— para que la tenga el rival, o la devuelve si era de él (su id lleva `f.`);
   * `take` pone en mi campo una carta de él (con su id `f.…`), venga de su campo, de su cementerio o de su destierro; `regain` me devuelve una carta mía que el rival tenía (al campo o a una pila). Lo que hace uno, el otro lo
   * completa solo en su mesa (`auto`: la jugada de respuesta, que no vuelve a provocar otra). Ver `mat-control.ts`.
   */
  | { type: 'give'; id: string; auto?: true }
  | { type: 'take'; id: string; zone: MatTakeZone; index: number; pos: MatPos; auto?: true }
  | { type: 'regain'; id: string; to: MatPile | 'deck-bottom' | MatTakeZone; index?: number; pos?: MatPos; faceDown?: boolean; faceUp?: boolean; auto?: true }
  /**
   * Varias cartas en una sola jugada (elegidas juntas en el Main, el Extra, el cementerio o el destierro): las partes van en orden, de un mismo tipo y destino, con un `shuffle` al principio
   * (salen mirando el Main: el resto se baraja) o al final («Al azar»: entran al deck y se baraja todo). Es una jugada: un paso, una línea, un Deshacer y, en el duelo, un mensaje. Un lote
   * dentro de otro no hace nada.
   */
  | { type: 'batch'; actions: MatAction[] }
  /** El rival usa una handtrap de su mano (el simulador de «Jugar solo»): queda usada en su lugar. Es de la práctica: no viaja en un duelo. */
  | { type: 'rivalUse'; id: string }

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
    extraUp: [],
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

  const of = Object.keys(state.held ?? {}).find((xyz) => state.held![xyz]!.includes(id))

  return of === undefined ? null : { kind: 'material', of }
}

/** Todas las cartas en juego (deck, Extra, mano, pilas, campo y materiales). */
export function allMatIds(state: MatState): string[] {
  const placed = SPOTS.flatMap((spot) => spotCards(state, spot)).filter((card): card is Placed => card !== null)

  return [...PILES.flatMap((pile) => state[pile]), ...placed.flatMap((card) => [card.id, ...card.materials]), ...Object.values(state.held ?? {}).flat()]
}

/** Los materiales de una carta del Extra Deck (`held`): sin ninguno, la carta sale de la lista y, sin cartas, la lista de la mesa. */
function withHeld(state: MatState, xyz: string, materials: readonly string[]): MatState {
  const { [xyz]: _, ...rest } = state.held ?? {}
  const held = materials.length > 0 ? { ...rest, [xyz]: [...materials] } : rest
  const { held: __, ...bare } = state

  return Object.keys(held).length > 0 ? { ...bare, held } : bare
}

export function placedAt(state: MatState, spot: MatSpot, index: number): Placed | null {
  return spot === 'field' ? state.field : (state[spot][index] ?? null)
}

export const isTakeZone = (value: unknown): value is MatTakeZone => value === 'mz' || value === 'st' || value === 'field'

/** Una zona (de monstruo, de Mágicas y Trampas o de Campo) con ese lugar libre y bien dicho. */
export function isFreeTakeZone(state: MatState, zone: MatTakeZone, index: number): boolean {
  const size = zone === 'field' ? 1 : ZONE_SIZES[zone]

  return Number.isInteger(index) && index >= 0 && index < size && placedAt(state, zone, index) === null
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
    const extraUp = where.pile === 'extra' ? state.extraUp.filter((card) => card !== id) : state.extraUp
    const left = { ...state, [where.pile]: state[where.pile].filter((card) => card !== id), facedown, extraUp }
    // Del Extra con materiales (`held`): se los lleva, como una carta del campo.
    const held = where.pile === 'extra' ? state.held?.[id] : undefined

    return held ? { state: withHeld(left, id, []), placed: { id, pos: 'atk', counters: 0, materials: held } } : { state: left, placed: null }
  }

  if (where.kind === 'material' && state.held?.[where.of]) {
    return { state: withHeld(state, where.of, state.held[where.of]!.filter((card) => card !== id)), placed: null }
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

/** Los materiales que la carta se lleva consigo al salir del campo o al adjuntarse. Las fichas desaparecen y las cartas del rival no son mías: vuelven a su dueño. */
function carriedMaterials(placed: Placed | null): string[] {
  return placed?.materials.filter((id) => !isToken(id) && !isForeignId(id)) ?? []
}

/** Al dejar el campo, los materiales Xyz van al cementerio (las fichas desaparecen). */
function dropMaterials(state: MatState, placed: Placed | null): MatState {
  const materials = carriedMaterials(placed)
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
      if (action.ids) {
        const drawn = action.ids.filter((id, at) => state.deck.includes(id) && action.ids!.indexOf(id) === at)
        return drawn.length === 0 ? state : { ...state, deck: state.deck.filter((id) => !drawn.includes(id)), hand: [...state.hand, ...drawn] }
      }

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
      // Al Extra Deck puede llegar boca arriba (un Monstruo de Péndulo); de lo contrario, boca abajo como siempre.
      const extraUp = action.to === 'extra' && action.faceUp ? [...next.extraUp, action.id] : next.extraUp
      const grown = { ...next, [pile]: [...next[pile], action.id], facedown, extraUp }
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
      const inExtra = action.held === true && target?.kind === 'pile' && target.pile === 'extra'

      if (action.id === action.to || isToken(action.id) || (target?.kind !== 'spot' && !inExtra) || !locateCard(state, action.id)) {
        return state
      }

      // La carta se lleva sus materiales (un Xyz con materiales pasa debajo de otro con todo lo que tenía): no van al cementerio.
      const removed = removeEverywhere(state, action.id)

      // Debajo de una carta del Extra Deck (la Invocación Xyz del núcleo): queda en `held` hasta que la carta sale.
      if (inExtra) return withHeld(removed.state, action.to, [...(removed.state.held?.[action.to] ?? []), action.id, ...carriedMaterials(removed.placed)])

      const owner = locateCard(removed.state, action.to)

      if (owner?.kind !== 'spot') {
        return state
      }

      return withPlaced(removed.state, owner.spot, owner.index, { ...owner.placed, materials: [...owner.placed.materials, action.id, ...carriedMaterials(removed.placed)] })
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
      if (!state.extra.includes(action.id) || action.materials.includes(action.id)) {
        return state
      }

      // En un Xyz, lo que cada material tenía debajo pasa también al nuevo: se junta antes de que los materiales vayan al cementerio.
      const underneath = action.materials.flatMap((material) => {
        const where = locateCard(state, material)
        return action.how === 'xyz' && where?.kind === 'spot' ? carriedMaterials(where.placed) : []
      })

      let next = state

      for (const material of action.materials) {
        const where = locateCard(next, material)

        // Ya debajo de una carta del Extra Deck (`held`): pasa debajo de la que sale.
        if (action.how === 'xyz' && where?.kind === 'material' && next.held?.[where.of]) continue

        // Sólo monstruos propios en el campo; una ficha no puede ser material Xyz (sí de Enlace: desaparece al salir del campo).
        if (where?.kind !== 'spot' || where.spot === 'st' || where.spot === 'field' || (action.how === 'xyz' && isToken(material))) {
          return state
        }

        next = matReducer(next, { type: 'move', id: material, to: 'gy' })
      }

      const placed = matReducer(next, { type: 'place', id: action.id, zone: action.zone, index: action.index, pos: action.pos, how: 'special' })

      if (placed === next) return state
      if (action.how !== 'xyz') return placed

      // Los materiales Xyz (y lo que tenían debajo) pasan del cementerio a debajo de la carta.
      return [...action.materials, ...underneath].reduce((current, material) => matReducer(current, { type: 'attach', id: material, to: action.id }), placed)
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

      // Se da (o se le suelta al rival) una carta del campo o de una pila: el menú sólo lo ofrece en el campo, y el rival la toma de su cementerio o su
      // destierro; en un duelo automático el núcleo también la manda de la mano o del deck al campo del rival (un Kaiju de la mano, Allure Palace del deck).
      // Un material o una ficha no.
      if ((where?.kind !== 'spot' && where?.kind !== 'pile') || isToken(action.id)) {
        return state
      }

      const removed = removeEverywhere(state, action.id)

      return dropMaterials(removed.state, removed.placed)
    }

    case 'take': {
      if (!isForeignId(action.id) || !isFreeTakeZone(state, action.zone, action.index) || locateCard(state, action.id)) {
        return state
      }

      return withPlaced(state, action.zone, action.index, { id: action.id, pos: action.pos, counters: 0, materials: [] })
    }

    case 'regain': {
      // Una carta mía que ya no está en mi mesa (la tenía el rival).
      if (isForeignId(action.id) || isToken(action.id) || locateCard(state, action.id)) {
        return state
      }

      if (isTakeZone(action.to)) {
        const index = action.index

        if (index === undefined || !isFreeTakeZone(state, action.to, index)) {
          return state
        }

        return withPlaced(state, action.to, index, { id: action.id, pos: action.pos ?? 'atk', counters: 0, materials: [] })
      }

      if (action.to === 'deck') {
        return { ...state, deck: [action.id, ...state.deck] }
      }

      const pile = action.to === 'deck-bottom' ? 'deck' : action.to
      const facedown = action.to === 'banished' && action.faceDown ? [...state.facedown, action.id] : state.facedown
      const extraUp = action.to === 'extra' && action.faceUp ? [...state.extraUp, action.id] : state.extraUp

      return { ...state, [pile]: [...state[pile], action.id], facedown, extraUp }
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

    case 'batch':
      return action.actions.reduce((current, part) => (part.type === 'batch' ? current : matReducer(current, part)), state)

    case 'rivalUse': {
      const rival = state.rival

      // Sólo una carta de la mano del rival que todavía no usó (una mesa sin rival, de antes o de un duelo, no cambia).
      return rival && rival.hand.includes(action.id) && !rival.used.includes(action.id) ? { ...state, rival: { ...rival, used: [...rival.used, action.id] } } : state
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

  return action.type === 'batch' ? describeBatch(before, action.actions, name) : describeOne(before, action, name)
}

/** La línea de una jugada; `count` es cuántas cartas nombra `name` (en un lote, la lista entera: las frases en tercera persona concuerdan con ella). */
function describeOne(before: MatState, action: MatAction, name: (id: string) => string, count = 1): string {
  const text = describePlay(before, action, name, count)

  if (action.type === 'move' && shufflesIn(before, action)) {
    return t('practice.step.deckShuffled', { card: name(action.id) })
  }

  // La carta salió mirando el deck y el resto se barajó en la misma jugada.
  return (action.type === 'move' || action.type === 'place') && action.shuffle !== undefined ? t('practice.step.andShuffle', { text }) : text
}

type CardAction = Extract<MatAction, { id: string }>

/**
 * Un lote, en una línea: si todas sus partes dicen lo mismo sin su carta (mismo tipo, destino y origen), la frase de la primera con todas las cartas —hasta tres por su nombre; desde
 * cuatro, «N cartas»—; si no (un lote mezclado, que sólo llega armado a mano), «Movés …». Su `shuffle` se dice como el de una carta: al final, con todo entrando al deck, «Barajás …
 * dentro del deck»; si no, «… y barajás».
 */
function describeBatch(before: MatState, actions: readonly MatAction[], name: (id: string) => string): string {
  const parts = actions.filter((part): part is CardAction => 'id' in part)
  const shuffles = actions.some((part) => part.type === 'shuffle')
  const first = parts[0]

  if (!first) return t(shuffles ? 'practice.step.shuffle' : 'practice.step.play')

  const cards = parts.length > 3 ? t('practice.mat.cardCount', { count: parts.length }) : listNames(parts.map((part) => name(part.id)))
  const bare = (part: CardAction) => describeOne(before, part, (id) => (id === part.id ? '' : name(id)), parts.length)
  const shape = bare(first)
  const text = parts.every((part) => bare(part) === shape) ? describeOne(before, first, (id) => (id === first.id ? cards : name(id)), parts.length) : t('practice.step.move', { card: cards })

  if (!shuffles) return text

  const intoDeck = actions.at(-1)?.type === 'shuffle' && parts.every((part) => part.type === 'move' && (part.to === 'deck' || part.to === 'deck-bottom') && !before.deck.includes(part.id))

  return intoDeck ? t('practice.step.deckShuffled', { card: cards }) : t('practice.step.andShuffle', { text })
}

function describePlay(before: MatState, action: MatAction, name: (id: string) => string, count = 1): string {
  switch (action.type) {
    case 'draw': {
      const top = action.ids ? action.ids[0] : before.deck[0]
      const count = action.ids?.length ?? action.count
      return count === 1 && top ? t('practice.step.draw', { card: name(top) }) : t('practice.step.drawCount', { count })
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
          if (fromPile && fromPile !== 'hand') return t('practice.step.pileToHand', { card, count, pile: t(PILE_PHRASE_KEY[fromPile]) })
          return t('practice.step.backToHand', { card })
        case 'gy':
          if (isToken(action.id)) return t('practice.step.tokenGone')
          return fromPile === 'deck' ? t('practice.step.mill', { card }) : t('practice.step.toGy', { card, count })
        case 'banished':
          return action.faceDown ? t('practice.step.banishFaceDown', { card }) : t('practice.step.banish', { card })
        case 'extra':
          return t(action.faceUp ? 'practice.step.toExtraFaceUp' : 'practice.step.toExtra', { card, count })
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
      if (action.how === 'pendulum') return t('practice.step.pendulumSummon', { card, position })
      return t('practice.step.enters', { card, position })
    }

    case 'tribute': {
      const card = name(action.id)
      const list = listNames(action.tributes.map(name))

      return action.pos === 'set' ? t('practice.step.tributeSet', { card, list }) : t('practice.step.tributeSummon', { card, list })
    }

    case 'summon': {
      const params = { summon: t(SUMMON_NAME_KEY[action.how]), card: name(action.id), materials: listNames(action.materials.map(name)) }

      // Sin materiales es una Invocación Especial a secas.
      if (action.materials.length === 0) return t(action.pos === 'def' ? 'practice.step.summonNoneDefense' : 'practice.step.summonNone', params)

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
      if (action.effect !== undefined) return t('practice.step.effectNumber', { card, n: action.effect + 1 })
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
      return t(isTakeZone(action.to) && !action.auto ? 'practice.step.regainControl' : 'practice.step.regain', { card: name(action.id) })

    case 'rivalUse':
      return t('handtraps.step.used', { card: name(action.id) })

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
  /** Una línea chica arriba de la opción (en el segundo paso de «Activar efecto»: el número del efecto y cuándo se activa). */
  lead?: string
  /** Una línea chica debajo de la opción (en el segundo paso de «Activar efecto»: si ya se usó, desde dónde se activa y sus rasgos). */
  hint?: string
  /** La opción se ve apagada, no se elige y dice por qué (en el menú de varias cartas, la jugada que no admiten todas: «No va con Ash y Droll»). La mesa la dibuja como `MenuItem` con `disabled` y esta razón de `hint`. */
  disabled?: string
  /** El pedazo del texto de la carta que dice esta opción (la frase del efecto): en escritorio, al pasar el mouse el detalle de la carta, a la izquierda, lo resalta. */
  preview?: { start: number; end: number }
  /** Invocación desde el Extra: se pueden elegir materiales en el campo (los que sean, o ninguno) y se confirma con un botón, o se toca una casilla libre para invocar ahí. */
  materials?: true
  /** Mandar la carta al deck "al azar": la mesa le pone la semilla al elegirla (se pone y se baraja todo el deck). */
  shuffleDeck?: true
  /** Una jugada de apoyo (revelar, target, descartar, desterrar, devolver al deck o al Extra), no una jugada del juego: la hoja de la mano las ofrece aparte, todas a un toque. */
  utility?: true
  /** La carta que nombra la opción (en el segundo paso de «Desacoplar», un material; en el de «Adjuntar a un Xyz», un Xyz del campo): para que el menú pueda mostrar su miniatura. */
  cardId?: string
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
 * Si la carta es un **Monstruo de Péndulo en el campo**: en una zona de monstruo o en una zona de Péndulo (las zonas 0 y 4 de Mágicas y Trampas, `MatState.st`). Uno en otra zona de Mágicas y Trampas se trata como una Mágica Continua
 * y no es un monstruo mientras esté ahí: no cuenta.
 */
export function pendulumOnField(state: MatState, id: string, kindOf: (id: string) => MatCardKind): boolean {
  const where = locateCard(state, id)

  if (where?.kind !== 'spot' || isToken(id) || isForeignId(id)) return false

  const kind = kindOf(id)

  return kind.monster && kind.pendulum && (where.spot === 'mz' || where.spot === 'emz' || (where.spot === 'st' && (where.index === 0 || where.index === 4)))
}

/**
 * Las escalas de péndulo activas: un Monstruo de Péndulo **boca arriba** en la zona 0 o en la 4 de Mágicas y Trampas (`MatState.st`). Boca abajo, o en otra zona, no son escalas.
 * Con dos se ofrece la Invocación de Péndulo desde la mano. El rango de nivel no se valida: el que practica manda.
 */
export function activeScales(state: MatState, kindOf: (id: string) => MatCardKind): { index: number; id: string }[] {
  return [0, 4].flatMap((index): { index: number; id: string }[] => {
    const placed = state.st[index]

    if (!placed || placed.pos === 'set' || isToken(placed.id)) return []

    const kind = kindOf(placed.id)

    return kind.monster && kind.pendulum ? [{ index, id: placed.id }] : []
  })
}

/**
 * La jugada de mandar una carta a una pila. Un Monstruo de Péndulo que **sale del campo al cementerio** (destruido, mandado, usado como Sacrificio) va, por regla, al Extra Deck boca arriba, y un monstruo del Extra Deck
 * que iba a la mano o al deck vuelve al Extra Deck boca abajo: es la misma jugada con ese destino (la arma quien juega, así las dos mesas de un duelo la aplican igual). Lo demás va adonde se dijo.
 */
export function pileAction(state: MatState, id: string, to: MatPile, kindOf: (id: string) => MatCardKind): MatAction {
  if (to === 'gy' && pendulumOnField(state, id, kindOf)) return { type: 'move', id, to: 'extra', faceUp: true }
  // Un monstruo del Extra Deck que iba a la mano o al deck vuelve, por regla, al Extra Deck (boca abajo).
  if ((to === 'hand' || to === 'deck') && kindOf(id).extra) return { type: 'move', id, to: 'extra' }

  return { type: 'move', id, to }
}

/**
 * Lo que se puede hacer con una carta desde donde está: el menú al tocarla (cubre todo lo que hace el arrastre),
 * con las jugadas del juego: Invocación Normal y Colocar desde la mano, Invocación Especial (que pregunta la posición) desde cualquier lado, Invocación de Péndulo desde la mano con dos escalas activas,
 * Invocación por Volteo de un monstruo boca abajo, Activar efecto (con descarte como costo si está en la mano),
 * escalas de péndulo, revelar, descartar, desterrar. Una Mágica o Trampa del cementerio o del destierro se activa o se coloca (como una de la mano). Las Trampas no se activan desde la mano; los Link no van a
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
  /** Una jugada de apoyo: no es una jugada del juego (invocar, colocar, activar). */
  const addUtility = (label: string, action: MatAction) => items.push({ label, action, utility: true })
  /** Un monstruo del Extra Deck nunca va a la mano: por regla vuelve al Extra Deck (lo ofrece «Al Extra Deck»). */
  const toHand = () => {
    if (!kind.extra) add(t('practice.menu.toHand'), { type: 'move', id, to: 'hand' })
  }
  const target = () => addUtility(state.targeted.includes(id) ? t('practice.menu.untarget') : t('practice.menu.target'), { type: 'target', id })
  const banish = () => items.push({ ...banishItem(id, t('practice.menu.banish')), utility: true })
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
  const specialSummonItem = (attack: MatMenuItem | null, defense: MatMenuItem | null, label = t('practice.menu.specialSummon')) => {
    if (!attack || !defense) return
    items.push(kind.link ? { ...attack, label } : askItem(label, [attack, defense]))
  }
  const specialSummon = (label?: string, how: MatSummon = 'special') => specialSummonItem(placeItem(t('practice.menu.attack'), zones, 'atk', how), placeItem(t('practice.menu.defense'), zones, 'def', how), label)
  /** Una carta boca arriba en el Extra Deck (un Monstruo de Péndulo): se invoca por Péndulo, no con materiales. */
  const faceUpExtra = pile === 'extra' && state.extraUp.includes(id)
  /** Un Monstruo de Péndulo en el campo (una zona de monstruo o una zona de Péndulo): si sale al cementerio, va al Extra Deck boca arriba. */
  const leavesToExtra = where.kind === 'spot' && pendulumOnField(state, id, kindOf)
  /**
   * Una jugada con una de varias cartas (a qué Xyz se adjunta, qué material se desacopla): con una sola, la opción va directa y la nombra («Adjuntar a Zeus»); con varias, es una sola opción
   * que pregunta cuál, con una respuesta por carta (aunque dos se llamen igual). Sin ninguna, no se ofrece.
   */
  const oneOf = (cards: readonly string[], direct: (name: string) => string, label: string, action: (card: string) => MatAction) => {
    const [first, ...rest] = cards.map((card): MatMenuItem => ({ label: nameOf(card), action: action(card), cardId: card }))

    if (first) items.push(rest.length === 0 ? { label: direct(first.label), action: first.action } : askItem(label, [first, ...rest]))
  }
  /** Adjuntar la carta como material a un Xyz del campo: cualquiera que no sea ella misma, boca arriba o boca abajo (la mesa no valida reglas). Una ficha no es material. */
  const attachTo = () =>
    oneOf(
      isToken(id) ? [] : monstersOnField(state).filter((other) => other !== id && !isToken(other) && kindOf(other).xyz),
      (name) => t('practice.menu.attachTo', { name }),
      t('practice.menu.attachToXyz'),
      (xyz) => ({ type: 'attach', id, to: xyz }),
    )

  if (where.kind === 'spot') {
    const { placed, spot } = where

    if (spot === 'st' || spot === 'field') {
      if (placed.pos === 'set') add(t('practice.menu.activate'), { type: 'position', id, pos: 'atk' })
      else if (kind.effect) add(t('practice.menu.activateEffect'), { type: 'activate', id })
      // Un monstruo del Extra Deck ahí (una Mágica de Equipo) no se pone boca abajo.
      if (placed.pos !== 'set' && !kind.extra) add(t('practice.menu.turnFaceDown'), { type: 'position', id, pos: 'set' })
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

      attachTo()
      // Desacoplar: con un material, «Desacoplar X»; con varios, una sola opción que pregunta cuál.
      oneOf(placed.materials, (name) => t('practice.menu.detach', { name }), t('practice.menu.detachMaterial'), (material) => ({ type: 'move', id: material, to: 'gy' }))
    }

    target()

    if (isToken(id)) {
      add(t('practice.menu.removeToken'), { type: 'move', id, to: 'gy' })
      return items
    }

    // Dar el control de un monstruo (o devolverlo a su dueño): sólo en un duelo y si el rival tiene una zona de monstruo libre. Una Mágica o Trampa del rival que tomé se devuelve siempre (sin lugar, vuelve a su cementerio).
    if (control && (spot === 'mz' || spot === 'emz' ? control.rivalHasRoom : isForeignId(id))) {
      add(t(isForeignId(id) ? 'practice.menu.returnControl' : 'practice.menu.giveControl', { name: control.rival }), { type: 'give', id })
    }

    // Un monstruo puede pasar a la zona de Mágicas y Trampas (los que se tratan como Mágicas de Equipo o Continuas).
    if (spot !== 'st' && spot !== 'field') placeIn(t('practice.menu.toSpellTrapZone'), ['st'], 'atk')
  }

  if (where.kind === 'material') {
    add(t('practice.menu.detachToGy'), { type: 'move', id, to: 'gy' })
    banish()
    toHand()
    if (kind.extra) addUtility(t('practice.menu.toExtra'), { type: 'move', id, to: 'extra' })
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
    // Con dos escalas de péndulo activas, la Invocación de Péndulo es la Especial de siempre (zona y posición) con `how: 'pendulum'`. Una carta del Extra no se invoca así.
    if (kind.monster && !kind.extra && activeScales(state, kindOf).length === 2) specialSummon(t('practice.menu.pendulumSummon'), 'pendulum')

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
    addUtility(t('practice.menu.reveal'), { type: 'reveal', id })
    target()
    addUtility(t('practice.menu.discard'), { type: 'move', id, to: 'gy' })
    banish()
  } else if (pile) {
    // Deck, Extra, cementerio o destierro.
    if (pile === 'deck' || faceUpExtra) toHand()
    // Las Mágicas de Campo se activan directo desde el Deck (hay efectos que lo piden).
    if (pile === 'deck' && kind.fieldSpell) placeIn(t('practice.menu.activate'), ['field'], 'atk')
    // Colocar boca abajo directo desde el Deck (hay efectos que piden "Colocar 1 carta de tu Deck"): Mágicas y Trampas a su zona (la de Campo, a la suya) y monstruos a una Zona de Monstruo.
    // Un monstruo del Extra Deck (de una mesa de antes, cuando podía llegar al Deck) nunca se coloca.
    if (pile === 'deck' && (kind.spell || kind.trap)) placeIn(t('practice.menu.set'), kind.fieldSpell ? ['field'] : ['st'], 'set')
    else if (pile === 'deck' && kind.monster && !kind.extra) placeIn(t('practice.menu.set'), zones, 'set')

    const how = pile === 'extra' && !faceUpExtra ? extraSummonOf(kind) : null

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
      if (faceUpExtra) specialSummon(t('practice.menu.pendulumSummon'), 'pendulum')
      else specialSummon()
    }
    if (kind.monster && (pile === 'gy' || pile === 'banished')) placeIn(t('practice.menu.toSpellTrapZone'), ['st'], 'atk')
    // Una Mágica o una Trampa del cementerio o del destierro también se activa (sale boca arriba a su zona, la de Campo a la suya) o se coloca boca abajo: hay efectos que lo piden.
    if ((pile === 'gy' || pile === 'banished') && (kind.spell || kind.trap)) {
      const spellTrapZones: MatSpot[] = kind.fieldSpell ? ['field'] : ['st']

      placeIn(t('practice.menu.activate'), spellTrapZones, 'atk')
      placeIn(t('practice.menu.set'), spellTrapZones, 'set')
    }
    if (pile === 'gy' || pile === 'banished') {
      // Efectos que se activan en el cementerio o en el destierro.
      if (kind.effect) add(t('practice.menu.activateEffect'), { type: 'activate', id })
      toHand()
      target()
    }
    // Del Deck o del Extra (que nadie ve) se puede mostrar una carta al rival sin moverla.
    if (pile === 'deck' || (pile === 'extra' && !faceUpExtra)) addUtility(t('practice.menu.reveal'), { type: 'reveal', id })
    if (pile !== 'gy') add(t('practice.menu.toGy'), { type: 'move', id, to: 'gy' })
    if (pile !== 'banished') banish()
  } else {
    // En el campo.
    toHand()
    // Un Monstruo de Péndulo que sale del campo al cementerio va, por regla, al Extra Deck boca arriba: la jugada ya lo hace sola.
    if (leavesToExtra) add(t('practice.menu.toGyPendulum'), pileAction(state, id, 'gy', kindOf))
    else add(t('practice.menu.toGy'), { type: 'move', id, to: 'gy' })
    banish()
  }

  // Un monstruo de la mano, el deck, el cementerio o el destierro también se adjunta como material a un Xyz del campo (en el campo va con sus otras jugadas; del Extra Deck, no).
  if (pile && pile !== 'extra' && kind.monster) attachTo()

  if (pile !== 'extra') {
    // Un Monstruo de Péndulo va al Extra Deck boca arriba (de cualquier lado por un efecto; del campo, el cementerio ya lo manda ahí): ahí se ve y se puede volver a invocar por Péndulo.
    if (kind.pendulum && !leavesToExtra) add(t('practice.menu.toExtraFaceUp'), { type: 'move', id, to: 'extra', faceUp: true })
    if (kind.extra) addUtility(t('practice.menu.toExtra'), { type: 'move', id, to: 'extra' })
  } else if (faceUpExtra) {
    addUtility(t('practice.menu.extraFaceDown'), { type: 'move', id, to: 'extra' })
  }

  // Arriba/abajo del deck desde cualquier lado (mano, campo, cementerio, destierro): los mismos nombres en todos los menús.
  if (!kind.extra) {
    if (pile === 'deck') {
      // Una carta que ya está en el deck (mirándolo) sólo cambia de lugar: arriba o abajo.
      add(t('practice.menu.deckTop'), { type: 'move', id, to: 'deck' })
      add(t('practice.menu.deckBottom'), { type: 'move', id, to: 'deck-bottom' })
    } else {
      // Una carta de afuera vuelve al deck: al azar (se baraja adentro), arriba o abajo; es una sola jugada del menú que pregunta cómo.
      items.push({
        ...askItem(t('practice.menu.toDeck'), [
          { label: t('practice.menu.deckRandom'), action: { type: 'move', id, to: 'deck' }, shuffleDeck: true },
          { label: t('practice.menu.deckOnTop'), action: { type: 'move', id, to: 'deck' } },
          { label: t('practice.menu.deckOnBottom'), action: { type: 'move', id, to: 'deck-bottom' } },
        ]),
        utility: true,
      })
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

/**
 * Mantener apretado un monstruo del campo: la primera jugada de cambio de posición de su menú, sin abrirlo. Boca arriba pasa de ataque a defensa (o al revés) y boca abajo se Invoca por
 * Volteo; un Link no tiene ninguna (siempre está en ataque) y lo que no es una zona de monstruo (las Mágicas y Trampas, la mano, las pilas) tampoco: null.
 */
export function holdAction(state: MatState, id: string, kindOf: (id: string) => MatCardKind, nameOf: (id: string) => string): MatAction | null {
  const where = locateCard(state, id)

  if (where?.kind !== 'spot' || (where.spot !== 'mz' && where.spot !== 'emz')) return null

  return listCardActions(state, id, kindOf, nameOf).find((item) => item.action.type === 'position' && item.action.pos !== 'set')?.action ?? null
}

/** La clase de una jugada: un lote hecho sólo de Target cuenta como `target` (marcar varias no mueve nada, como marcar una). */
export function playType(action: MatAction): MatAction['type'] {
  return action.type === 'batch' && action.actions.length > 0 && action.actions.every((part) => part.type === 'target') ? 'target' : action.type
}

/** Lo que se hace con varias cartas a la vez: lo que pide zona o posición (invocar, activar, colocar) va de a una. */
const BATCH_PLAYS: ReadonlySet<MatAction['type']> = new Set(['move', 'target', 'attach', 'reveal'])

/** Qué hace una opción sin decir con qué carta («mover al destierro boca abajo», «adjuntar a Zeus»): dos cartas con la misma clave hacen lo mismo. Target es una sola, marque o quite la mira; una pregunta, por su nombre. */
function playKey(item: MatMenuItem): string {
  const { action } = item

  if (item.choices) return `ask:${item.label}`
  if (action.type === 'move') return `move:${action.to}:${action.faceDown ? 'down' : ''}:${action.faceUp ? 'up' : ''}:${item.shuffleDeck ? 'random' : ''}`
  if (action.type === 'attach') return `attach:${action.to}`

  return action.type
}

/** Del menú de una carta, lo que también se hace con varias (una pregunta se queda con las respuestas que sí). */
function batchable(items: readonly MatMenuItem[]): MatMenuItem[] {
  return items.flatMap((item) => {
    if (!item.choices) return BATCH_PLAYS.has(item.action.type) ? [item] : []

    const choices = batchable(item.choices)

    return choices.length > 0 ? [{ ...item, choices }] : []
  })
}

/**
 * El menú de varias cartas de una pila, elegidas juntas en su visor (en el orden en que se eligieron): lo que el menú de cada una (`listCardActions`) ofrece a **todas**, con una jugada `batch`
 * de una parte por carta. Se compara la jugada sin su carta (`playKey`); lo que admiten sólo algunas va apagado y dice con cuáles no va (hasta tres nombres; desde cuatro, cuántas). Entran
 * mover, Target, Adjuntar y Revelar, y lo que el menú de una carta sume se hereda solo. Target marca sólo las que no tienen la mira; con todas marcadas, es «Quitar target». Las partes van en
 * el orden de elección, salvo arriba del deck: ahí van al revés, para que la primera elegida quede arriba de todo. El barajado (el de «Al azar» y el de lo que sale mirando el Main) lo pone la
 * mesa al jugar, con su semilla.
 */
export function listBatchActions(state: MatState, ids: readonly string[], kindOf: (id: string) => MatCardKind, nameOf: (id: string) => string): MatMenuItem[] {
  // Por qué va apagada: las que no la admiten, cada nombre una vez.
  const notWith = (cards: readonly string[]) => {
    const names = [...new Set(cards.map(nameOf))]

    return names.length > 3 ? t('practice.batch.notWithCount', { count: cards.length }) : t('practice.batch.notWith', { list: listNames(names) })
  }
  const merge = (menus: readonly (readonly MatMenuItem[])[]): MatMenuItem[] =>
    [...new Set(menus.flatMap((items) => items.map(playKey)))].map((key): MatMenuItem => {
      const found = menus.map((items) => items.find((item) => playKey(item) === key))
      const first = found.find((item) => item !== undefined)!
      const missing = ids.filter((_, index) => found[index] === undefined)
      const off = missing.length > 0 ? { disabled: notWith(missing) } : {}

      if (first.choices) {
        const choices = merge(found.map((item) => item?.choices ?? []))

        return { ...first, action: choices[0]!.action, choices, ...off }
      }

      const parts = found.flatMap((item) => (item ? [item.action] : []))

      if (first.action.type === 'target') {
        const unmarked = parts.filter((part) => part.type === 'target' && !state.targeted.includes(part.id))

        return { ...first, label: t(unmarked.length > 0 ? 'practice.menu.target' : 'practice.menu.untarget'), action: { type: 'batch', actions: unmarked.length > 0 ? unmarked : parts }, ...off }
      }

      const onTop = first.action.type === 'move' && first.action.to === 'deck' && !first.shuffleDeck

      return { ...first, action: { type: 'batch', actions: onTop ? parts.reverse() : parts }, ...off }
    })

  return merge(ids.map((id) => batchable(listCardActions(state, id, kindOf, nameOf))))
}
