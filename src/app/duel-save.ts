import type { DuelSnapshot } from './duel-session'
import type { Duelist, LifeTimer } from './life-calculator'
import type { MatAction, MatState } from './practice-mat'

/**
 * Lo propio de un duelo en curso, guardado en la pestaña para no perderlo si la página se recarga (o el navegador descarta la pestaña mientras se atiende otra
 * aplicación): la mesa de arranque y las jugadas (de ahí se vuelve a armar, el reductor es determinista), los puntos de vida, el reloj y quién empezó.
 * Lo del rival, el chat y el registro de juegos no se guardan: lo primero lo repite el rival al volver a saludar y lo otro es de cada sesión.
 */
export interface DuelSave {
  v: 1
  /** Anfitrión o invitado: una sala guardada con el otro rol no es de esta pestaña. */
  role: 'host' | 'guest'
  initial: MatState
  actions: MatAction[]
  /** Mis puntos de vida. */
  lp: number
  timer: LifeTimer
  starter: Duelist
}

const saveKey = (room: string, role: 'host' | 'guest') => `ygo-lab:duel-save:${room}:${role}`

/** Lo que hay que guardar de este duelo, o null mientras no haya mesa repartida (la mesa sólo se reparte cuando ya se eligió quién empieza) o tras una revancha, que empieza de cero. */
export function saveOf(snapshot: DuelSnapshot): DuelSave | null {
  if (!snapshot.initial) {
    return null
  }

  return { v: 1, role: snapshot.role, initial: snapshot.initial, actions: [...snapshot.actions], lp: snapshot.life.lp[snapshot.me], timer: snapshot.life.timer, starter: snapshot.starter }
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isList = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string')

/** Lo guardado, si es de este rol y tiene la forma de una mesa; si no, null (y se arma una mesa nueva). */
export function parseSave(raw: string | null, role: 'host' | 'guest'): DuelSave | null {
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
      (save.starter !== 0 && save.starter !== 1)
    ) {
      return null
    }

    return save as DuelSave
  } catch {
    return null
  }
}

export function readDuelSave(room: string, role: 'host' | 'guest'): DuelSave | null {
  try {
    return parseSave(sessionStorage.getItem(saveKey(room, role)), role)
  } catch {
    return null
  }
}

/** Guarda (o borra, si no hay nada que guardar) el estado de este duelo. */
export function writeDuelSave(room: string, snapshot: DuelSnapshot): void {
  try {
    const save = saveOf(snapshot)

    if (save) {
      sessionStorage.setItem(saveKey(room, snapshot.role), JSON.stringify(save))
    } else {
      sessionStorage.removeItem(saveKey(room, snapshot.role))
    }
  } catch {
    // Sin almacenamiento no se recuerda.
  }
}

export function clearDuelSave(room: string): void {
  try {
    sessionStorage.removeItem(saveKey(room, 'host'))
    sessionStorage.removeItem(saveKey(room, 'guest'))
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}
