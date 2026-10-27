import { ROOM_CODE_PATTERN } from './duel-relay-rules'
import type { DuelSnapshot, Mover } from './duel-session'
import type { SideDeck } from './duel-siding'
import type { Duelist, LifeTimer } from './life-calculator'
import type { MatAction, MatState } from './practice-mat'

/**
 * Lo propio de un duelo en curso, guardado en el navegador para no perderlo si la página se recarga, si el navegador descarta la pestaña mientras se atiende otra
 * aplicación o si el jugador sale del duelo y vuelve a entrar: la mesa de arranque y las jugadas (de ahí se vuelve a armar, el reductor es determinista), las vidas,
 * el reloj y quién empezó. Mientras falta uno de los dos el duelo está en pausa; al volver, el mismo jugador sigue con su mesa.
 * Lo del rival, el chat y el registro de juegos no se guardan: lo primero lo repite el rival al volver a saludar y lo otro es de cada sesión.
 */
export interface DuelSave {
  v: 1
  /** Anfitrión o invitado: una sala guardada con el otro rol no es de este jugador. */
  role: 'host' | 'guest'
  initial: MatState
  actions: MatAction[]
  /** Mis puntos de vida. */
  lp: number
  timer: LifeTimer
  starter: Duelist
  /** Cuándo se guardó (Date.now): el reloj se retoma desde ahí, sin contar el tiempo que se estuvo afuera, y lo guardado vence. */
  savedAt: number
  /** Cómo se llama el rival, para decir con quién es el duelo en pausa. */
  rival: string | null
  /** Quién se rindió (sin esto, un duelo que terminó rindiéndose se retomaría como si siguiera). Los guardados de antes no lo traen. */
  conceded?: Duelist | null
  /** Ya pedí la revancha (o toqué «Listo» en el siding): al volver se le repite al rival, que no se entera de otra forma. */
  rematch?: boolean
  /** De quién fue cada jugada de la mesa, intercaladas como pasaron: así Deshacer tras recargar sigue el orden real (sin esto, las del rival se suponen anteriores a las mías). Los guardados de antes no lo traen. */
  order?: Mover[]
}

const PREFIX = 'ygo-lab:duel-save:'
const saveKey = (room: string, role: 'host' | 'guest') => `${PREFIX}${room}:${role}`

/** Cuánto se espera a quien salió: pasado ese tiempo el duelo en pausa se descarta. */
export const SAVE_TTL_MS = 2 * 60 * 60 * 1000

/** Lo que hay que guardar de este duelo, o null mientras no haya mesa repartida (la mesa sólo se reparte cuando ya se eligió quién empieza) o tras una revancha, que empieza de cero. */
export function saveOf(snapshot: DuelSnapshot, now: number): DuelSave | null {
  if (!snapshot.initial) {
    return null
  }

  return {
    v: 1,
    role: snapshot.role,
    initial: snapshot.initial,
    actions: [...snapshot.actions],
    lp: snapshot.life.lp[snapshot.me],
    timer: snapshot.life.timer,
    starter: snapshot.starter,
    savedAt: now,
    rival: snapshot.peerName,
    conceded: snapshot.conceded,
    rematch: snapshot.rematch.mine,
    order: [...snapshot.order],
  }
}

/** Cuántas jugadas propias entran en un duelo guardado: al volver se rejuegan todas, así que un archivo hecho a propósito no puede traer cientos de miles. */
const MAX_SAVED_ACTIONS = 5000

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isList = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string')
/** El orden de las jugadas: `me` o `peer` por cada una de los dos (como mucho, las mías más las del rival). */
const isOrder = (value: unknown): value is Mover[] => Array.isArray(value) && value.length <= 2 * MAX_SAVED_ACTIONS && value.every((entry) => entry === 'me' || entry === 'peer')

/** Lo guardado, si es de este rol, no venció y tiene la forma de una mesa; si no, null (y se arma una mesa nueva). */
export function parseSave(raw: string | null, role: 'host' | 'guest', now: number): DuelSave | null {
  if (raw === null) {
    return null
  }

  try {
    const data: unknown = JSON.parse(raw)

    if (typeof data !== 'object' || data === null) {
      return null
    }

    const save = data as Partial<DuelSave>
    const table = save.initial as Partial<MatState> | undefined
    const timer = save.timer as Partial<LifeTimer> | undefined

    if (
      save.v !== 1 ||
      save.role !== role ||
      !table ||
      !isList(table.deck) ||
      !isList(table.hand) ||
      !isList(table.extra) ||
      !Array.isArray(save.actions) ||
      save.actions.length > MAX_SAVED_ACTIONS ||
      !isNumber(save.lp) ||
      !timer ||
      typeof timer.running !== 'boolean' ||
      !isNumber(timer.startedAt) ||
      !isNumber(timer.elapsedMs) ||
      (save.starter !== 0 && save.starter !== 1) ||
      !isNumber(save.savedAt) ||
      now - save.savedAt > SAVE_TTL_MS ||
      (save.rival !== null && typeof save.rival !== 'string') ||
      (save.conceded !== undefined && save.conceded !== null && save.conceded !== 0 && save.conceded !== 1) ||
      (save.rematch !== undefined && typeof save.rematch !== 'boolean') ||
      (save.order !== undefined && !isOrder(save.order))
    ) {
      return null
    }

    // Una mesa guardada antes de que el Extra Deck pudiera tener cartas boca arriba no las trae: ninguna.
    return { ...save, initial: { ...table, facedown: table.facedown ?? [], extraUp: table.extraUp ?? [] } } as DuelSave
  } catch {
    return null
  }
}

export function readDuelSave(room: string, role: 'host' | 'guest', now = Date.now()): DuelSave | null {
  try {
    return parseSave(localStorage.getItem(saveKey(room, role)), role, now)
  } catch {
    return null
  }
}

/** Guarda (o borra, si no hay nada que guardar) el estado de este duelo. */
export function writeDuelSave(room: string, snapshot: DuelSnapshot, now = Date.now()): void {
  try {
    const save = saveOf(snapshot, now)

    if (save) {
      localStorage.setItem(saveKey(room, snapshot.role), JSON.stringify(save))
    } else {
      localStorage.removeItem(saveKey(room, snapshot.role))
    }

    // Una sala con reglas automáticas no tiene mesa que guardar (la cuenta el núcleo): sólo quién se rindió, mientras ese duelo espera la revancha.
    if (snapshot.settings.auto && !snapshot.initial && snapshot.conceded !== null) {
      localStorage.setItem(autoEndKey(room, snapshot.role), JSON.stringify({ v: 1, conceded: snapshot.conceded, timeUp: snapshot.timeUp, savedAt: now } satisfies AutoEndSave))
    } else {
      localStorage.removeItem(autoEndKey(room, snapshot.role))
    }
  } catch {
    // Sin almacenamiento no se recuerda.
  }
}

/**
 * Quién se rindió en el duelo de una sala con reglas automáticas que terminó así: recargar antes de la revancha (el siding de un Match) no lo borra, y el Match suma el duelo
 * de los dos lados. Lo que terminó el núcleo no hace falta: su re-simulación vuelve a poner las vidas.
 */
export interface AutoEndSave {
  v: 1
  conceded: Duelist
  timeUp: boolean
  savedAt: number
}

const AUTO_END_PREFIX = 'ygo-lab:duel-auto-end:'
const autoEndKey = (room: string, role: 'host' | 'guest') => `${AUTO_END_PREFIX}${room}:${role}`

export function readAutoEndSave(room: string, role: 'host' | 'guest', now = Date.now()): AutoEndSave | null {
  try {
    const save = JSON.parse(localStorage.getItem(autoEndKey(room, role)) ?? 'null') as Partial<AutoEndSave> | null

    return save?.v === 1 && (save.conceded === 0 || save.conceded === 1) && typeof save.timeUp === 'boolean' && isNumber(save.savedAt) && now - save.savedAt <= SAVE_TTL_MS ? (save as AutoEndSave) : null
  } catch {
    return null
  }
}

export function clearDuelSave(room: string): void {
  try {
    localStorage.removeItem(saveKey(room, 'host'))
    localStorage.removeItem(saveKey(room, 'guest'))
    localStorage.removeItem(sidingKey(room, 'host'))
    localStorage.removeItem(sidingKey(room, 'guest'))
    localStorage.removeItem(autoEndKey(room, 'host'))
    localStorage.removeItem(autoEndKey(room, 'guest'))
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/** Con qué rol se jugaba esta sala en este navegador, si hay un duelo guardado de ella: así quien volvió con el enlace en otra pestaña sigue siendo quien era. */
export function savedRole(room: string, now = Date.now()): 'host' | 'guest' | null {
  return (['host', 'guest'] as const).find((role) => readDuelSave(room, role, now) !== null) ?? null
}

export interface PausedDuel {
  room: string
  role: 'host' | 'guest'
  rival: string | null
}

/** El duelo en pausa de este navegador (el más reciente), si hay uno: se vuelve a él desde el inicio del duelo. Los vencidos o rotos se borran de paso. */
export function findPausedDuel(now = Date.now()): PausedDuel | null {
  try {
    let latest: (PausedDuel & { savedAt: number }) | null = null

    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PREFIX)) {
        continue
      }

      const [room, role] = key.slice(PREFIX.length).split(':')
      const save = role === 'host' || role === 'guest' ? parseSave(localStorage.getItem(key), role, now) : null

      if (!save || !room || !ROOM_CODE_PATTERN.test(room)) {
        localStorage.removeItem(key)
      } else if (!latest || save.savedAt > latest.savedAt) {
        latest = { room, role: save.role, rival: save.rival, savedAt: save.savedAt }
      }
    }

    return latest ? { room: latest.room, role: latest.role, rival: latest.rival } : null
  } catch {
    return null
  }
}

/**
 * El siding de un Match en curso: el deck que se está armando (o el que quedó) y si la pantalla del siding está abierta. Recargar la página o volver al duelo
 * lleva otra vez a esa pantalla, con las cartas como estaban, y no se sale de ahí sin tocar «Listo».
 */
export interface SidingSave {
  v: 1
  role: 'host' | 'guest'
  /** El deck con los cambios hechos hasta ahora (ids de copia seguidos, como los que usa la mesa), o null si todavía no se confirmó nada. */
  deck: SideDeck | null
  open: boolean
  /** Lo que se está armando en la pantalla del siding (las cartas en cada zona) y cuándo se acaba el tiempo: recargar no reinicia ni el deck ni la cuenta. */
  draft?: SidingDraft | null
  /** De una sala con reglas automáticas (sin mesa guardada: la pantalla vale abierta igual). Los guardados de antes no lo traen. */
  auto?: true
  savedAt: number
}

export interface SidingDraft {
  lists: SideDeck
  /** Date.now() en que se acaba el tiempo del siding. */
  deadline: number
}

const SIDING_PREFIX = 'ygo-lab:duel-siding:'
const sidingKey = (room: string, role: 'host' | 'guest') => `${SIDING_PREFIX}${room}:${role}`
const COPY_ID = /^card-\d+-\d+$/
const MAX_SIDING_CARDS = 200

const isCopyList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= MAX_SIDING_CARDS && value.every((entry) => typeof entry === 'string' && COPY_ID.test(entry))

/** Lo guardado del siding de esta sala y este rol, si no venció y tiene la forma de un deck; si no, null. */
export function readSidingSave(room: string, role: 'host' | 'guest', now = Date.now()): SidingSave | null {
  try {
    const raw = localStorage.getItem(sidingKey(room, role))
    const data: unknown = raw === null ? null : JSON.parse(raw)

    if (typeof data !== 'object' || data === null) {
      return null
    }

    const save = data as Partial<SidingSave>
    const deck = save.deck as Partial<SideDeck> | null | undefined
    const validDeck = deck === null || (deck !== undefined && isCopyList(deck.main) && isCopyList(deck.extra) && isCopyList(deck.side))

    const draft = save.draft as Partial<SidingDraft> | null | undefined
    const lists = draft?.lists as Partial<SideDeck> | undefined
    const validDraft = draft === undefined || draft === null || (isNumber(draft.deadline) && lists !== undefined && isCopyList(lists.main) && isCopyList(lists.extra) && isCopyList(lists.side))

    return save.v === 1 && save.role === role && validDeck && validDraft && typeof save.open === 'boolean' && isNumber(save.savedAt) && now - save.savedAt <= SAVE_TTL_MS ? (save as SidingSave) : null
  } catch {
    return null
  }
}

/** Guarda el siding de esta sala (o lo borra, si no hay nada que recordar: ni deck ni pantalla abierta). */
export function writeSidingSave(room: string, role: 'host' | 'guest', save: { deck: SideDeck | null; open: boolean; draft?: SidingDraft | null; auto?: boolean } | null, now = Date.now()): void {
  try {
    if (save && (save.deck !== null || save.open)) {
      localStorage.setItem(sidingKey(room, role), JSON.stringify({ v: 1, role, deck: save.deck, open: save.open, draft: save.open ? (save.draft ?? null) : null, ...(save.auto ? { auto: true as const } : {}), savedAt: now } satisfies SidingSave))
    } else {
      localStorage.removeItem(sidingKey(room, role))
    }
  } catch {
    // Sin almacenamiento no se recuerda.
  }
}
