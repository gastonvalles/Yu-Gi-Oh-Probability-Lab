import type { DuelSnapshot } from './duel-session'
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
}

const PREFIX = 'ygo-lab:duel-save:'
const saveKey = (room: string, role: 'host' | 'guest') => `${PREFIX}${room}:${role}`

/** Cuánto se espera a quien salió: pasado ese tiempo el duelo en pausa se descarta (una partida con un amigo no dura más). */
export const SAVE_TTL_MS = 6 * 60 * 60 * 1000

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
  }
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isList = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string')

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
      !isNumber(save.lp) ||
      !timer ||
      typeof timer.running !== 'boolean' ||
      !isNumber(timer.startedAt) ||
      !isNumber(timer.elapsedMs) ||
      (save.starter !== 0 && save.starter !== 1) ||
      !isNumber(save.savedAt) ||
      now - save.savedAt > SAVE_TTL_MS ||
      (save.rival !== null && typeof save.rival !== 'string')
    ) {
      return null
    }

    return save as DuelSave
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
  } catch {
    // Sin almacenamiento no se recuerda.
  }
}

export function clearDuelSave(room: string): void {
  try {
    localStorage.removeItem(saveKey(room, 'host'))
    localStorage.removeItem(saveKey(room, 'guest'))
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

      if (!save || !room) {
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
