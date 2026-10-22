import { RPS_PICKS, TOSS_METHODS, cleanChat, stripHidden, type DuelGame, type Series, type TossMethod } from './duel-games'
import { MAX_MESSAGE_BYTES } from './duel-relay-rules'
import type { DeckFormat } from '../types'
import { MAX_LP, STARTING_LP } from './life-calculator'
import type { WireAct } from './mat-public'
import { isTakeZone, PHASES, type MatAction, type MatPhase, type MatPile, type MatPos, type MatSpot, type MatState, type Placed } from './practice-mat'
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

/** Con qué formato se revisa el deck de cada uno en una sala (los del builder: la banlist del TCG o del OCG, Goat, Edison, Genesys, o sin límite). Cómo se revisa se lee aparte, en `duel-format.ts`. */
export const DUEL_FORMATS = ['tcg', 'ocg', 'goat', 'edison', 'genesys', 'unlimited'] as const satisfies readonly DeckFormat[]
export const DEFAULT_DUEL_FORMAT: DeckFormat = 'unlimited'

export interface DuelSettings {
  /** Puntos de vida con los que empieza cada uno. */
  lp: number
  /** Cartas de la mano inicial. */
  hand: number
  /** Minutos del reloj de cada duelo (cuenta para atrás); 0 es sin límite: el reloj cuenta para adelante. */
  limitMin: number
  /** El formato con que se revisa el deck de cada uno al tocar «Estoy listo». */
  format: DeckFormat
  /** Sólo en Genesys: el total de puntos que las cartas del deck no pueden pasar (vale `GENESYS_POINT_CAP` si no se manda: un anfitrión de antes no lo manda). */
  genesysCap?: number
  /** Reloj de turnos (ver `duel-clock.ts`): los minutos con que arranca la reserva de cada jugador; 0 o sin dato es sin límite por turno. */
  turnMin?: number
  /** Los minutos que se suman a la reserva de quien recibe el turno (con `turnMin` en 0 no cuenta). */
  turnBonusMin?: number
  /** Un Match (mejor de 3) en vez de un solo duelo. */
  match: boolean
  /** En un Match, cambiar cartas entre el Main, el Extra y el Side entre un duelo y el siguiente. */
  siding: boolean
}

/** Los tiempos que se ofrecen al crear la sala: 50 minutos (lo que dura una ronda de torneo) o sin tiempo (0). El protocolo acepta cualquier tiempo de 0 a 180: salas de antes tenían otros. */
export const DUEL_LIMIT_CHOICES = [50, 0] as const
export const DEFAULT_LIMIT_MIN = 50

/** Los puntos máximos de Genesys que se pueden pedir al crear la sala (el oficial es 100). */
export const GENESYS_CAP_RANGE = { min: 10, max: 500 } as const

/** El reloj de turnos que se puede pedir al crear la sala (el protocolo acepta hasta 60 y 30 minutos de más): lo que viene elegido son 7 minutos y 3 de más. */
export const TURN_MIN_RANGE = { min: 1, max: 30 } as const
export const TURN_BONUS_RANGE = { min: 0, max: 10 } as const
export const DEFAULT_TURN_MIN = 7
export const DEFAULT_TURN_BONUS_MIN = 3

export const DEFAULT_SETTINGS: DuelSettings = { lp: STARTING_LP, hand: 5, limitMin: DEFAULT_LIMIT_MIN, format: DEFAULT_DUEL_FORMAT, turnMin: DEFAULT_TURN_MIN, turnBonusMin: DEFAULT_TURN_BONUS_MIN, match: false, siding: false }

/** Lo que alguien marca como objetivo del lado del otro: cartas (por el id con que su dueño las nombra) y pilas enteras (la mano, el deck, el Extra, el cementerio, lo desterrado). */
export interface Marks {
  cards: readonly string[]
  piles: readonly MatPile[]
}

export const NO_MARKS: Marks = { cards: [], piles: [] }

/** Algo que se puede marcar del lado del rival. */
export type MarkTarget = { card: string } | { pile: MatPile }

/** Lo que alguien está haciendo y el otro puede ver: mirando su deck, su Extra Deck, su cementerio o lo desterrado, o eligiendo cómo jugar una carta (materiales, zona, Sacrificios). `null` es nada de eso. */
export const ACTIVITIES = ['deck', 'extra', 'gy', 'banished', 'choosing'] as const
export type Activity = (typeof ACTIVITIES)[number]

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
 * - `undoAsk` / `undoPull` / `undoAnswer` / `undoCancel`: Deshacer vuelve atrás la última jugada de la mesa, sea de quien sea, y antes se le pide permiso al otro (`id` cuenta mis pedidos).
 *   `undoAsk`: la última jugada es mía; él contesta con `ok` y, si lo permite, recién ahí mando el `undo`. `undoPull`: la última jugada es suya; si lo permite, él la deshace y me manda su `undo`, y me confirma con `ok`.
 *   Si me arrepiento (o pasa mucho sin respuesta) lo cancelo y su cartel se va.
 * - `phaseAsk` / `phaseAnswer` / `phaseCancel`: antes de pasar de fase (`phase` es a la que quiero pasar) le pregunto al otro si no va a hacer nada más en la que dejo (`id` cuenta mis preguntas): él contesta con `ok`
 *   (pasá, o no: voy a jugar) y, si me deja, recién ahí juego el `act` de la fase; si no contesta a tiempo lo juego igual y, si me arrepiento, lo cancelo; en los dos casos su cartel se va.
 * - `life` / `clock`: mis puntos de vida (siempre el valor, no el cambio) y el reloj compartido.
 * - `turnClock`: lo que me queda en el reloj de turnos al pasar el turno (ver `duel-clock.ts`): mi palabra corrige la cuenta que el otro lado hace por su cuenta.
 * - `game`: moneda, dado, piedra-papel-tijera o quién va primero (no cambian la mesa; `n` cuenta los míos para no repetir ninguno).
 * - `ready`: estoy listo (o ya no) para empezar el duelo; también viaja en el `sync`.
 * - `chat`: una línea del chat (`n` cuenta las mías para no repetir ninguna).
 * - `ping`: señalo algo un instante (una carta por su id opaco, o una pila), de mi lado (`mine`) o del lado de quien lo recibe (`yours`). Sólo comunica: no toca la mesa, no entra en las jugadas ni en Deshacer,
 *   no se repone al reconectar y quien lo recibe lo muestra un rato y se olvida. `n` cuenta los míos para no repetir ninguno.
 * - `look`: lo que estoy haciendo (mirar una pila, elegir cómo jugar una carta) o `null` si nada: sólo comunica, no toca la mesa; quien lo recibe lo muestra mientras dure y se olvida cuando me voy.
 * - `marks`: todo lo que tengo marcado como objetivo del lado de quien lo recibe (cartas por su id opaco, y pilas); siempre el conjunto entero, así repetirlo no cambia nada y reconectar lo repone.
 * - `resync`: me perdí algo, mandame un `sync`.
 */
export type DuelMessage =
  | { t: 'hello'; v: number; sid: string; role: 'host' | 'guest'; name: string; settings?: DuelSettings }
  /** `ready`, `order` (quién empieza, si ya se eligió) y `opening` (cómo va la tirada que lo define) hacen que quien vuelve a entrar, o perdió un mensaje, sepa en qué punto va el otro. */
  | { t: 'sync'; n: number; state?: MatState; known: Record<string, string>; lp: number; lifeN: number; clock?: ClockWire; /** Lo que le queda a cada uno en el reloj de turnos (0 = anfitrión, 1 = invitado), como lo ve quien manda el `sync`. */ turnBanks?: readonly [number, number]; ready?: boolean; order?: 0 | 1; opening?: OpeningWire; series?: Series }
  | { t: 'act'; n: number; wire: WireAct }
  | { t: 'undo'; n: number }
  | { t: 'undoAsk'; id: number }
  | { t: 'undoPull'; id: number }
  | { t: 'undoAnswer'; id: number; ok: boolean }
  | { t: 'undoCancel'; id: number }
  | { t: 'phaseAsk'; id: number; phase: MatPhase }
  | { t: 'phaseAnswer'; id: number; ok: boolean }
  | { t: 'phaseCancel'; id: number }
  | { t: 'life'; n: number; lp: number }
  | { t: 'clock'; n: number; running: boolean; elapsedMs: number }
  | { t: 'turnClock'; bank: number }
  | { t: 'game'; n: number; game: DuelGame }
  | { t: 'ready'; ready: boolean }
  | { t: 'chat'; n: number; text: string }
  | { t: 'marks'; cards: string[]; piles: MatPile[] }
  | { t: 'ping'; n: number; at: 'yours' | 'mine'; card?: string; pile?: MatPile }
  | { t: 'look'; at: Activity | null }
  | { t: 'resync' }

export function encodeMessage(message: DuelMessage): string {
  return JSON.stringify(message)
}

const MAX_ID_LENGTH = 100
/** Cuántos caracteres puede tener el nombre de un jugador (se ve en las vidas, en el chat y en la arena). */
export const MAX_NAME_LENGTH = 20
const MAX_CARDS = 200
const MAX_COUNT = 1_000_000
const MAX_CLOCK_MS = 1_000_000_000

/** El nombre sin caracteres de control ni de los que esconden o dan vuelta el texto, sin espacios de más y con un largo razonable. */
export const cleanName = (name: string) => stripHidden(name).trim().slice(0, MAX_NAME_LENGTH)

/** Si dos nombres son el mismo (sin mirar mayúsculas ni espacios de los costados): en una sala los dos jugadores no pueden llamarse igual. */
export const sameName = (a: string, b: string | null | undefined): boolean => b !== null && b !== undefined && a.trim().toLowerCase() === b.trim().toLowerCase()

/** El nombre con un número al final para que no coincida con el del rival (cabe en el límite: se acorta el nombre, no el número). */
export const uniqueName = (name: string, taken: string): string => {
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`
    const candidate = `${name.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`

    if (!sameName(candidate, taken)) return candidate
  }
}

const isPlain = (value: unknown): value is Record<string, unknown> => isRecord(value) && !Array.isArray(value)
const isInt = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
/**
 * Un id de carta como viaja entre los jugadores: opaco (`c12`, la identidad nunca viaja en el id), de una carta del rival que se controla (`f.c12`: el id opaco de su dueño con el prefijo `f.`) o de ficha (`token-3`). Nada más: un id como `constructor` o `__proto__`, usado
 * después como clave de un objeto, devolvería algo heredado en vez de una carta y rompería a quien lo recibe.
 */
const CARD_ID = /^(?:c[0-9]{1,5}|f\.c[0-9]{1,5}|token-[0-9]{1,4})$/
/** La identidad real de una carta ya revelada (`card-123-2`: el número de YGOPRODeck y la copia). */
const REAL_ID = /^card-[0-9]{1,12}-[0-9]{1,3}$/
const isCardId = (value: unknown): value is string => typeof value === 'string' && CARD_ID.test(value)
const isRealId = (value: unknown): value is string => typeof value === 'string' && REAL_ID.test(value)
const isCardIds = (value: unknown, max = MAX_CARDS): value is string[] => Array.isArray(value) && value.length <= max && value.every(isCardId)
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
/** Lo que entra en un lote (`batch`): mover, marcar, adjuntar, revelar y barajar. Nunca otro lote ni un cambio de control (`give`: la otra mesa lo completa con su propia jugada). */
const isBatchPart = oneOf<MatAction['type']>(['move', 'target', 'attach', 'reveal', 'shuffle'])

/**
 * Qué lleva cada jugada. El tipo obliga a que una jugada nueva tenga su revisión; los valores
 * permitidos (`how`, `cost`…) son los de `MatAction` y hay que ponerlos al día si ese tipo cambia.
 */
const actionChecks: Record<MatAction['type'], (action: Record<string, unknown>) => boolean> = {
  draw: (a) => isInt(a.count, 0, MAX_CARDS),
  mill: (a) => isInt(a.count, 0, MAX_CARDS),
  shuffle: (a) => isSeed(a.seed),
  move: (a) => isCardId(a.id) && (isPile(a.to) || a.to === 'deck-bottom') && optional(a.faceDown, (v) => typeof v === 'boolean') && optional(a.faceUp, (v) => typeof v === 'boolean') && optional(a.shuffle, isSeed),
  place: (a) => isCardId(a.id) && isSpot(a.zone) && isInt(a.index, 0, 4) && isPos(a.pos) && optional(a.how, oneOf(['normal', 'special', 'pendulum', 'scale'])) && optional(a.shuffle, isSeed),
  tribute: (a) => isCardId(a.id) && isCardIds(a.tributes, 10) && isZone(a.zone) && isInt(a.index, 0, 4) && isPos(a.pos),
  summon: (a) => isCardId(a.id) && oneOf(['fusion', 'synchro', 'xyz', 'link'])(a.how) && isCardIds(a.materials, 10) && isZone(a.zone) && isInt(a.index, 0, 4) && isPos(a.pos),
  attach: (a) => isCardId(a.id) && isCardId(a.to),
  position: (a) => isCardId(a.id) && isPos(a.pos),
  counter: (a) => isCardId(a.id) && isInt(a.delta, -1000, 1000),
  token: (a) => isZone(a.zone) && isInt(a.index, 0, 4) && optional(a.pos, oneOf(['atk', 'def'])),
  activate: (a) => isCardId(a.id) && optional(a.cost, oneOf(['discard', 'banish'])) && optional(a.effect, (v) => isInt(v, 0, 9)),
  reveal: (a) => isCardId(a.id),
  declare: (a) => isCardId(a.id),
  target: (a) => isCardId(a.id),
  attack: (a) => isCardId(a.id) && optional(a.target, isCardId),
  phase: (a) => isPhase(a.phase) && optional(a.skipDraw, (v) => v === true),
  give: (a) => isCardId(a.id) && optional(a.auto, (v) => v === true),
  take: (a) => isCardId(a.id) && isTakeZone(a.zone) && isInt(a.index, 0, 4) && isPos(a.pos) && optional(a.auto, (v) => v === true),
  regain: (a) =>
    isCardId(a.id) && (isPile(a.to) || a.to === 'deck-bottom' || isTakeZone(a.to)) && optional(a.index, (v) => isInt(v, 0, 4)) && optional(a.pos, isPos) && optional(a.faceDown, (v) => typeof v === 'boolean') && optional(a.faceUp, (v) => typeof v === 'boolean') && optional(a.auto, (v) => v === true),
  batch: (a) => Array.isArray(a.actions) && a.actions.length > 0 && a.actions.length <= MAX_CARDS && a.actions.every((part) => isPlain(part) && isBatchPart(part.type) && actionChecks[part.type](part)),
  // El simulador de handtraps es de «Jugar solo»: la jugada nunca viaja en un duelo, y si llega se descarta.
  rivalUse: () => false,
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
      return value.timeout === true ? { kind: 'concede', timeout: true } : { kind: 'concede' }
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
  return entries.length <= max && entries.every(([opaque, real]) => isCardId(opaque) && isRealId(real)) ? (Object.fromEntries(entries) as Record<string, string>) : null
}

function parseWire(value: unknown): WireAct | null {
  if (!isPlain(value)) {
    return null
  }

  const action = parseAction(value.action)
  // Un lote puede dejar a la vista una pila entera (el Main al cementerio): tanto como una mesa.
  const reveal = parseKnown(value.reveal, MAX_CARDS)
  return action && reveal ? { action, reveal } : null
}

function parsePlaced(value: unknown): Placed | null {
  if (!isPlain(value) || !isCardId(value.id) || !isPos(value.pos) || !isInt(value.counters, 0, MAX_COUNT) || !isCardIds(value.materials, 20)) {
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

  if (!piles.every((pile) => isCardIds(pile)) || (piles as string[][]).reduce((total, pile) => total + pile.length, 0) > MAX_CARDS) {
    return null
  }

  const parsedMz = parseSpots(mz, 5)
  const parsedEmz = parseSpots(emz, 2)
  const parsedSt = parseSpots(st, 5)
  const parsedField = field === null ? null : parsePlaced(field)

  // Una versión anterior no manda las cartas boca arriba del Extra Deck: ninguna. Las que manda tienen que estar en el Extra.
  const extraUp = value.extraUp === undefined ? [] : value.extraUp

  if (!parsedMz || !parsedEmz || !parsedSt || (field !== null && !parsedField) || !isCardIds(facedown) || !isCardIds(targeted) || !isCardIds(extraUp) || !(extraUp as string[]).every((id) => (extra as string[]).includes(id))) {
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
    extraUp: [...(extraUp as string[])],
    targeted: [...targeted],
  }
}

function parseSettings(value: unknown): DuelSettings | null {
  // Un anfitrión de una versión anterior no manda el tiempo: vale el de siempre.
  if (!isPlain(value) || !isInt(value.lp, 1, MAX_LP) || !isInt(value.hand, 0, 20) || !optional(value.turnMin, (v) => isInt(v, 0, 60)) || !optional(value.turnBonusMin, (v) => isInt(v, 0, 30)) || !optional(value.limitMin, (v) => isInt(v, 0, 180)) || !optional(value.format, (v) => (DUEL_FORMATS as readonly unknown[]).includes(v)) || !optional(value.genesysCap, (v) => isInt(v, 1, 999)) || !optional(value.match, (v) => typeof v === 'boolean') || !optional(value.siding, (v) => typeof v === 'boolean')) {
    return null
  }

  const format = (value.format as DeckFormat | undefined) ?? DEFAULT_DUEL_FORMAT

  return {
    lp: value.lp,
    hand: value.hand,
    limitMin: typeof value.limitMin === 'number' ? value.limitMin : DEFAULT_LIMIT_MIN,
    format,
    // Un anfitrión de una versión anterior no manda el reloj de turnos: sin dato es sin límite por turno.
    ...(typeof value.turnMin === 'number' ? { turnMin: value.turnMin, turnBonusMin: typeof value.turnBonusMin === 'number' && value.turnMin > 0 ? value.turnBonusMin : 0 } : {}),
    // El tope sólo cuenta en Genesys.
    ...(format === 'genesys' && typeof value.genesysCap === 'number' ? { genesysCap: value.genesysCap } : {}),
    match: value.match === true,
    siding: value.match === true && value.siding === true,
  }
}

function parseSeries(value: unknown): Series | null {
  if (!isPlain(value) || !isInt(value.played, 0, 50) || !Array.isArray(value.wins) || value.wins.length !== 2 || !value.wins.every((wins) => isInt(wins, 0, 50))) {
    return null
  }

  return { played: value.played, wins: [value.wins[0] as number, value.wins[1] as number] }
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

function parseBanks(value: unknown): readonly [number, number] | null {
  return Array.isArray(value) && value.length === 2 && isInt(value[0], 0, MAX_CLOCK_MS) && isInt(value[1], 0, MAX_CLOCK_MS) ? [value[0], value[1]] : null
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
      const turnBanks = raw.turnBanks === undefined ? undefined : parseBanks(raw.turnBanks)

      const series = raw.series === undefined ? undefined : parseSeries(raw.series)
      const orderOk = raw.order === undefined || raw.order === 0 || raw.order === 1
      const opening = raw.opening === undefined ? undefined : parseOpening(raw.opening)

      if (state === null || !known || clock === null || turnBanks === null || !isInt(raw.n, 0, MAX_COUNT) || !isInt(raw.lp, 0, MAX_LP) || !isInt(raw.lifeN, 0, MAX_COUNT) || !optional(raw.ready, (v) => typeof v === 'boolean') || !orderOk || opening === null || series === null) {
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
        ...(turnBanks ? { turnBanks } : {}),
        ...(typeof raw.ready === 'boolean' ? { ready: raw.ready } : {}),
        ...(raw.order === 0 || raw.order === 1 ? { order: raw.order } : {}),
        ...(opening && Object.keys(opening).length > 0 ? { opening } : {}),
        ...(series ? { series } : {}),
      }
    }

    case 'act': {
      const wire = parseWire(raw.wire)
      return wire && isInt(raw.n, 1, MAX_COUNT) ? { t: 'act', n: raw.n, wire } : null
    }

    case 'undo':
      return isInt(raw.n, 0, MAX_COUNT) ? { t: 'undo', n: raw.n } : null

    case 'undoAsk':
      return isInt(raw.id, 1, MAX_COUNT) ? { t: 'undoAsk', id: raw.id } : null

    case 'undoPull':
      return isInt(raw.id, 1, MAX_COUNT) ? { t: 'undoPull', id: raw.id } : null

    case 'undoAnswer':
      return isInt(raw.id, 1, MAX_COUNT) && typeof raw.ok === 'boolean' ? { t: 'undoAnswer', id: raw.id, ok: raw.ok } : null

    case 'undoCancel':
      return isInt(raw.id, 1, MAX_COUNT) ? { t: 'undoCancel', id: raw.id } : null

    case 'phaseAsk':
      return isInt(raw.id, 1, MAX_COUNT) && isPhase(raw.phase) ? { t: 'phaseAsk', id: raw.id, phase: raw.phase } : null

    case 'phaseAnswer':
      return isInt(raw.id, 1, MAX_COUNT) && typeof raw.ok === 'boolean' ? { t: 'phaseAnswer', id: raw.id, ok: raw.ok } : null

    case 'phaseCancel':
      return isInt(raw.id, 1, MAX_COUNT) ? { t: 'phaseCancel', id: raw.id } : null

    case 'life':
      return isInt(raw.n, 1, MAX_COUNT) && isInt(raw.lp, 0, MAX_LP) ? { t: 'life', n: raw.n, lp: raw.lp } : null

    case 'clock':
      return isInt(raw.n, 1, MAX_COUNT) && typeof raw.running === 'boolean' && isInt(raw.elapsedMs, 0, MAX_CLOCK_MS) ? { t: 'clock', n: raw.n, running: raw.running, elapsedMs: raw.elapsedMs } : null

    case 'turnClock':
      return isInt(raw.bank, 0, MAX_CLOCK_MS) ? { t: 'turnClock', bank: raw.bank } : null

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

    case 'ping': {
      const hasCard = raw.card !== undefined
      const hasPile = raw.pile !== undefined

      // Una carta o una pila, nunca las dos ni ninguna; la carta, con su id opaco.
      if (!isInt(raw.n, 1, MAX_COUNT) || (raw.at !== 'yours' && raw.at !== 'mine') || hasCard === hasPile || (hasCard && !isCardId(raw.card)) || (hasPile && !isPile(raw.pile))) {
        return null
      }

      return { t: 'ping', n: raw.n, at: raw.at, ...(hasCard ? { card: raw.card as string } : { pile: raw.pile as MatPile }) }
    }

    case 'look':
      return raw.at === null ? { t: 'look', at: null } : (ACTIVITIES as readonly unknown[]).includes(raw.at) ? { t: 'look', at: raw.at as Activity } : null

    case 'marks': {
      const piles = raw.piles

      if (!isCardIds(raw.cards, MAX_MARKS) || !Array.isArray(piles) || piles.length > 5 || !piles.every(isPile) || new Set(piles).size !== piles.length) {
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
