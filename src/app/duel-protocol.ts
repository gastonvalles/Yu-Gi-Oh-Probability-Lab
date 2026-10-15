import { RPS_PICKS, TOSS_METHODS, cleanChat, type DuelGame, type TossMethod } from './duel-games'
import { MAX_MESSAGE_BYTES } from './duel-relay-rules'
import { MAX_LP, STARTING_LP } from './life-calculator'
import type { WireAct } from './mat-public'
import { PHASES, type MatAction, type MatPile, type MatPos, type MatSpot, type MatState, type Placed } from './practice-mat'
import { isRecord } from './utils'

/**
 * Protocolo del duelo por enlace: los mensajes que se mandan los dos dispositivos y cómo se revisan al
 * llegar. Todo lo que viene de la red es dato de otra persona: `parseMessage` lo valida y devuelve una
 * copia con forma conocida (o `null`), así que nada de lo que entra puede romper `matReducer` ni
 * llenar la memoria. Los mensajes viajan como texto JSON.
 */

export const PROTOCOL_VERSION = 1
/** Tope de un mensaje: lo fija `duel-relay-rules.ts` porque el relay también lo hace cumplir. */
export { MAX_MESSAGE_BYTES }

export interface DuelSettings {
  /** Puntos de vida con los que empieza cada uno. */
  lp: number
  /** Cartas de la mano inicial. */
  hand: number
}

export const DEFAULT_SETTINGS: DuelSettings = { lp: STARTING_LP, hand: 5 }

/** Lo que alguien marca como objetivo del lado del otro: cartas (por el id con que su dueño las nombra) y pilas enteras (la mano, el deck, el Extra, el cementerio, lo desterrado). */
export interface Marks {
  cards: readonly string[]
  piles: readonly MatPile[]
}

export const NO_MARKS: Marks = { cards: [], piles: [] }

/** Algo que se puede marcar del lado del rival. */
export type MarkTarget = { card: string } | { pile: MatPile }

/** Cuántas cartas se pueden tener marcadas a la vez. */
export const MAX_MARKS = 30

/** Cómo va, de mi lado, la tirada que define quién elige ir primero: con qué, quién lo eligió, mi dado y, si ya se sabe, quién elige. */
export interface OpeningWire {
  method?: TossMethod
  caller?: 0 | 1
  die?: number
  chooser?: 0 | 1
}

/** El reloj de la ronda: lo acumulado y si corre (no viaja un instante: cada dispositivo tiene su reloj). */
interface ClockWire {
  running: boolean
  elapsedMs: number
}

/**
 * - `hello`: quién soy (`sid` cambia si recargo la página: el otro lado empieza de cero con mis números). Sólo el anfitrión manda los ajustes.
 * - `sync`: mi mesa de ahora (enmascarada, si ya la empecé), todo lo que ya sabés de ella, mis puntos de vida y, si soy el anfitrión, el reloj; sirve para arrancar, reconectar y reparar.
 * - `act` / `undo`: una jugada mía o el "volver atrás". `n` es la cantidad de jugadas que tengo después de ella.
 * - `life` / `clock`: mis puntos de vida (siempre el valor, no el cambio) y el reloj compartido.
 * - `game`: moneda, dado, piedra-papel-tijera o quién va primero (no cambian la mesa; `n` cuenta los míos para no repetir ninguno).
 * - `ready`: estoy listo (o ya no) para empezar el duelo; también viaja en el `sync`.
 * - `chat`: una línea del chat (`n` cuenta las mías para no repetir ninguna).
 * - `marks`: todo lo que tengo marcado como objetivo del lado de quien lo recibe (cartas por su id opaco, y pilas); siempre el conjunto entero, así repetirlo no cambia nada y reconectar lo repone.
 * - `resync`: me perdí algo, mandame un `sync`.
 */
export type DuelMessage =
  | { t: 'hello'; v: number; sid: string; role: 'host' | 'guest'; name: string; settings?: DuelSettings }
  /** `ready`, `order` (quién empieza, si ya se eligió) y `opening` (cómo va la tirada que lo define) hacen que quien vuelve a entrar, o perdió un mensaje, sepa en qué punto va el otro. */
  | { t: 'sync'; n: number; state?: MatState; known: Record<string, string>; lp: number; lifeN: number; clock?: ClockWire; ready?: boolean; order?: 0 | 1; opening?: OpeningWire }
  | { t: 'act'; n: number; wire: WireAct }
  | { t: 'undo'; n: number }
  | { t: 'life'; n: number; lp: number }
  | { t: 'clock'; n: number; running: boolean; elapsedMs: number }
  | { t: 'game'; n: number; game: DuelGame }
  | { t: 'ready'; ready: boolean }
  | { t: 'chat'; n: number; text: string }
  | { t: 'marks'; cards: string[]; piles: MatPile[] }
  | { t: 'resync' }

export function encodeMessage(message: DuelMessage): string {
  return JSON.stringify(message)
}

const MAX_ID_LENGTH = 100
const MAX_NAME_LENGTH = 40
const MAX_CARDS = 200
const MAX_COUNT = 1_000_000
const MAX_CLOCK_MS = 1_000_000_000

/** El nombre sin caracteres de control, sin espacios de más y con un largo razonable. */
export const cleanName = (name: string) =>
  [...name]
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, MAX_NAME_LENGTH)

const isPlain = (value: unknown): value is Record<string, unknown> => isRecord(value) && !Array.isArray(value)
const isInt = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
const isIds = (value: unknown, max = MAX_CARDS): value is string[] => Array.isArray(value) && value.length <= max && value.every(isId)
const isSeed = (value: unknown): value is number => isInt(value, 0, 2 ** 32 - 1)
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (values as readonly string[]).includes(value)
const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || check(value)

const isPile = oneOf<MatPile>(['deck', 'extra', 'hand', 'gy', 'banished'])
const isPos = oneOf<MatPos>(['atk', 'def', 'set'])
const isSpot = oneOf<MatSpot>(['mz', 'emz', 'st', 'field'])
const isZone = oneOf(['mz', 'emz', 'st'] as const)
const isPhase = oneOf(PHASES.map((phase) => phase.id))

/**
 * Qué lleva cada jugada. El tipo obliga a que una jugada nueva tenga su revisión; los valores
 * permitidos (`how`, `cost`…) son los de `MatAction` y hay que ponerlos al día si ese tipo cambia.
 */
const actionChecks: Record<MatAction['type'], (action: Record<string, unknown>) => boolean> = {
  draw: (a) => isInt(a.count, 0, MAX_CARDS),
  mill: (a) => isInt(a.count, 0, MAX_CARDS),
  shuffle: (a) => isSeed(a.seed),
  move: (a) => isId(a.id) && (isPile(a.to) || a.to === 'deck-bottom') && optional(a.faceDown, (v) => typeof v === 'boolean') && optional(a.shuffle, isSeed),
  place: (a) => isId(a.id) && isSpot(a.zone) && isInt(a.index, 0, 4) && isPos(a.pos) && optional(a.how, oneOf(['normal', 'special', 'scale'])) && optional(a.shuffle, isSeed),
  tribute: (a) => isId(a.id) && isIds(a.tributes, 10) && isZone(a.zone) && isInt(a.index, 0, 4) && isPos(a.pos),
  summon: (a) => isId(a.id) && oneOf(['fusion', 'synchro', 'xyz', 'link'])(a.how) && isIds(a.materials, 10) && isZone(a.zone) && isInt(a.index, 0, 4) && isPos(a.pos),
  attach: (a) => isId(a.id) && isId(a.to),
  position: (a) => isId(a.id) && isPos(a.pos),
  counter: (a) => isId(a.id) && isInt(a.delta, -1000, 1000),
  token: (a) => isZone(a.zone) && isInt(a.index, 0, 4) && optional(a.pos, oneOf(['atk', 'def'])),
  activate: (a) => isId(a.id) && optional(a.cost, oneOf(['discard', 'banish'])),
  reveal: (a) => isId(a.id),
  declare: (a) => isId(a.id),
  target: (a) => isId(a.id),
  attack: (a) => isId(a.id) && optional(a.target, isId),
  phase: (a) => isPhase(a.phase) && optional(a.skipDraw, (v) => v === true),
}

function parseAction(value: unknown): MatAction | null {
  if (!isPlain(value) || typeof value.type !== 'string' || !Object.hasOwn(actionChecks, value.type)) {
    return null
  }

  return actionChecks[value.type as MatAction['type']](value) ? (value as unknown as MatAction) : null
}

const isRps = oneOf(RPS_PICKS)
const isMethod = oneOf(TOSS_METHODS)

function parseGame(value: unknown): DuelGame | null {
  if (!isPlain(value)) {
    return null
  }

  switch (value.kind) {
    case 'coin':
      if (value.face !== 0 && value.face !== 1) {
        return null
      }

      return value.call === undefined ? { kind: 'coin', face: value.face } : value.call === 0 || value.call === 1 ? { kind: 'coin', face: value.face, call: value.call } : null
    case 'toss':
      return isMethod(value.method) ? { kind: 'toss', method: value.method } : null
    case 'die':
      return isInt(value.value, 1, 6) ? { kind: 'die', value: value.value } : null
    case 'rps':
      return value.pick === null ? { kind: 'rps', pick: null } : isRps(value.pick) ? { kind: 'rps', pick: value.pick } : null
    case 'order':
      return value.first === 0 || value.first === 1 ? { kind: 'order', first: value.first } : null
    case 'concede':
      return { kind: 'concede' }
    case 'rematch':
      return { kind: 'rematch' }
    default:
      return null
  }
}

function parseKnown(value: unknown, max: number): Record<string, string> | null {
  if (!isPlain(value)) {
    return null
  }

  const entries = Object.entries(value)
  return entries.length <= max && entries.every(([opaque, real]) => isId(opaque) && isId(real)) ? (Object.fromEntries(entries) as Record<string, string>) : null
}

function parseWire(value: unknown): WireAct | null {
  if (!isPlain(value)) {
    return null
  }

  const action = parseAction(value.action)
  const reveal = parseKnown(value.reveal, 50)
  return action && reveal ? { action, reveal } : null
}

function parsePlaced(value: unknown): Placed | null {
  if (!isPlain(value) || !isId(value.id) || !isPos(value.pos) || !isInt(value.counters, 0, MAX_COUNT) || !isIds(value.materials, 20)) {
    return null
  }

  return { id: value.id, pos: value.pos, counters: value.counters, materials: [...value.materials] }
}

/** Una fila de zonas con su largo exacto: cada lugar vacío o una carta bien formada. */
function parseSpots(value: unknown, size: number): (Placed | null)[] | null {
  if (!Array.isArray(value) || value.length !== size) {
    return null
  }

  const spots = value.map((spot) => (spot === null ? null : parsePlaced(spot)))
  return spots.every((spot, index) => spot !== null || value[index] === null) ? spots : null
}

function parseState(value: unknown): MatState | null {
  if (!isPlain(value)) {
    return null
  }

  const { deck, extra, hand, gy, banished, facedown, targeted, mz, emz, st, field } = value
  const piles = [deck, extra, hand, gy, banished]

  if (!piles.every((pile) => isIds(pile)) || (piles as string[][]).reduce((total, pile) => total + pile.length, 0) > MAX_CARDS) {
    return null
  }

  const parsedMz = parseSpots(mz, 5)
  const parsedEmz = parseSpots(emz, 2)
  const parsedSt = parseSpots(st, 5)
  const parsedField = field === null ? null : parsePlaced(field)

  if (!parsedMz || !parsedEmz || !parsedSt || (field !== null && !parsedField) || !isIds(facedown) || !isIds(targeted)) {
    return null
  }

  if (!isInt(value.tokens, 0, 1000) || !isPhase(value.phase) || !isInt(value.turn, 1, 10_000)) {
    return null
  }

  return {
    deck: [...(deck as string[])],
    extra: [...(extra as string[])],
    hand: [...(hand as string[])],
    gy: [...(gy as string[])],
    banished: [...(banished as string[])],
    mz: parsedMz,
    emz: parsedEmz,
    st: parsedSt,
    field: parsedField,
    tokens: value.tokens,
    phase: value.phase,
    turn: value.turn,
    facedown: [...facedown],
    targeted: [...targeted],
  }
}

function parseSettings(value: unknown): DuelSettings | null {
  return isPlain(value) && isInt(value.lp, 1, MAX_LP) && isInt(value.hand, 0, 20) ? { lp: value.lp, hand: value.hand } : null
}

function parseOpening(value: unknown): OpeningWire | null {
  if (!isPlain(value)) {
    return null
  }

  const { method, caller, die, chooser } = value
  const duelist = (v: unknown) => v === undefined || v === 0 || v === 1

  if (!optional(method, isMethod) || !duelist(caller) || !optional(die, (v) => isInt(v, 1, 6)) || !duelist(chooser)) {
    return null
  }

  return {
    ...(method === undefined ? {} : { method: method as TossMethod }),
    ...(caller === 0 || caller === 1 ? { caller } : {}),
    ...(typeof die === 'number' ? { die } : {}),
    ...(chooser === 0 || chooser === 1 ? { chooser } : {}),
  }
}

function parseClock(value: unknown): ClockWire | null {
  return isPlain(value) && typeof value.running === 'boolean' && isInt(value.elapsedMs, 0, MAX_CLOCK_MS) ? { running: value.running, elapsedMs: value.elapsedMs } : null
}

/** El mensaje que llegó, ya revisado; `null` si no es de este protocolo o viene mal formado. */
export function parseMessage(text: unknown): DuelMessage | null {
  if (typeof text !== 'string' || text.length > MAX_MESSAGE_BYTES) {
    return null
  }

  let raw: unknown

  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }

  if (!isPlain(raw)) {
    return null
  }

  switch (raw.t) {
    case 'hello': {
      const settings = raw.settings === undefined ? undefined : parseSettings(raw.settings)
      const name = typeof raw.name === 'string' ? cleanName(raw.name) : null

      if (!isInt(raw.v, 0, 1000) || !isId(raw.sid) || (raw.role !== 'host' && raw.role !== 'guest') || name === null || settings === null) {
        return null
      }

      const hello = { t: 'hello', v: raw.v, sid: raw.sid, role: raw.role, name } as const
      return settings ? { ...hello, settings } : hello
    }

    case 'sync': {
      const state = raw.state === undefined ? undefined : parseState(raw.state)
      const known = parseKnown(raw.known, MAX_CARDS)
      const clock = raw.clock === undefined ? undefined : parseClock(raw.clock)

      const orderOk = raw.order === undefined || raw.order === 0 || raw.order === 1
      const opening = raw.opening === undefined ? undefined : parseOpening(raw.opening)

      if (state === null || !known || clock === null || !isInt(raw.n, 0, MAX_COUNT) || !isInt(raw.lp, 0, MAX_LP) || !isInt(raw.lifeN, 0, MAX_COUNT) || !optional(raw.ready, (v) => typeof v === 'boolean') || !orderOk || opening === null) {
        return null
      }

      return {
        t: 'sync',
        n: raw.n,
        known,
        lp: raw.lp,
        lifeN: raw.lifeN,
        ...(state ? { state } : {}),
        ...(clock ? { clock } : {}),
        ...(typeof raw.ready === 'boolean' ? { ready: raw.ready } : {}),
        ...(raw.order === 0 || raw.order === 1 ? { order: raw.order } : {}),
        ...(opening && Object.keys(opening).length > 0 ? { opening } : {}),
      }
    }

    case 'act': {
      const wire = parseWire(raw.wire)
      return wire && isInt(raw.n, 1, MAX_COUNT) ? { t: 'act', n: raw.n, wire } : null
    }

    case 'undo':
      return isInt(raw.n, 0, MAX_COUNT) ? { t: 'undo', n: raw.n } : null

    case 'life':
      return isInt(raw.n, 1, MAX_COUNT) && isInt(raw.lp, 0, MAX_LP) ? { t: 'life', n: raw.n, lp: raw.lp } : null

    case 'clock':
      return isInt(raw.n, 1, MAX_COUNT) && typeof raw.running === 'boolean' && isInt(raw.elapsedMs, 0, MAX_CLOCK_MS) ? { t: 'clock', n: raw.n, running: raw.running, elapsedMs: raw.elapsedMs } : null

    case 'game': {
      const game = parseGame(raw.game)
      return game && isInt(raw.n, 1, MAX_COUNT) ? { t: 'game', n: raw.n, game } : null
    }

    case 'ready':
      return typeof raw.ready === 'boolean' ? { t: 'ready', ready: raw.ready } : null

    case 'chat': {
      const text = typeof raw.text === 'string' ? cleanChat(raw.text) : ''

      return text !== '' && isInt(raw.n, 1, MAX_COUNT) ? { t: 'chat', n: raw.n, text } : null
    }

    case 'marks': {
      const piles = raw.piles

      if (!isIds(raw.cards, MAX_MARKS) || !Array.isArray(piles) || piles.length > 5 || !piles.every(isPile) || new Set(piles).size !== piles.length) {
        return null
      }

      return { t: 'marks', cards: [...raw.cards], piles: [...(piles as MatPile[])] }
    }

    case 'resync':
      return { t: 'resync' }

    default:
      return null
  }
}
