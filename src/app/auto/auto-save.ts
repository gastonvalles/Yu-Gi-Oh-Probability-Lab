import { SAVE_TTL_MS } from '../duel-save'
import type { SessionAnswer } from './auto-session'
import type { DeckList } from './deck-map'
import { parseAnswer, type Seat } from './protocol'

/**
 * El duelo automático por enlace guardado por el anfitrión (diseño: `docs/duelo-automatico-enlace.md`): con la semilla, su asiento, la mano de la sala, los dos
 * decks y las respuestas aceptadas de los dos (y si ya se cortó para pasar a manual), el núcleo vuelve a contar el duelo entero (`restore` de la sesión) si el anfitrión recarga la página, y el invitado lo recibe de
 * nuevo. Nada más: ni nombres ni mensajes. Se escribe con cada respuesta aceptada, se reescribe en cada revancha, se borra cuando el duelo termina (o lo borra la pantalla al
 * abandonar) y vence como el guardado del duelo manual (`SAVE_TTL_MS`).
 */
export interface AutoSave {
  v: 1
  seed: number
  /** El asiento del anfitrión en el núcleo (0 empieza). */
  seat: Seat
  /** Cuántas cartas roba cada uno al empezar (la mano de la sala): el `create` tiene que ser el mismo para que la re-simulación dé el mismo duelo. */
  hand: number
  decks: { mine: DeckList; theirs: DeckList }
  answers: SessionAnswer[]
  savedAt: number
  /** Se acordó pasar a manual y el anfitrión ya cortó (`dropped`: lo que quedó a medio jugar se descartó): rearmado, sigue cortado. Los guardados de antes no lo traen. */
  cut?: { dropped: boolean }
}

export interface AutoSaveStore {
  read(): AutoSave | null
  write(save: AutoSave): void
  clear(): void
}

const PREFIX = 'ygo-lab:auto-save:'
/** Como el tope de respuestas de un `create` del núcleo: un duelo largo anda por las 2.000. */
const MAX_ANSWERS = 20_000

const isInt = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
const isRows = (value: unknown): boolean => Array.isArray(value) && value.length <= 200 && value.every((row) => Array.isArray(row) && row.length === 2 && isInt(row[0], 1, 999_999_999_999) && isInt(row[1], 1, 200))
const isDeck = (value: unknown): value is DeckList => typeof value === 'object' && value !== null && isRows((value as DeckList).main) && ((value as DeckList).extra === undefined || isRows((value as DeckList).extra))

/** Lo guardado si tiene la forma de un duelo y no venció; si no, null (y el duelo se da por perdido). */
export function parseAutoSave(raw: string | null, now: number): AutoSave | null {
  if (raw === null) return null
  try {
    const save = JSON.parse(raw) as Partial<AutoSave> | null

    if (!save || save.v !== 1 || !isInt(save.seed, 0, 2 ** 32 - 1) || (save.seat !== 0 && save.seat !== 1) || !isInt(save.hand, 0, 60) || !isInt(save.savedAt, 0, Number.MAX_SAFE_INTEGER) || now - save.savedAt > SAVE_TTL_MS) return null
    if (!save.decks || !isDeck(save.decks.mine) || !isDeck(save.decks.theirs) || !Array.isArray(save.answers) || save.answers.length > MAX_ANSWERS) return null
    const answers = save.answers.map((item: Partial<SessionAnswer>) => (item && (item.seat === 0 || item.seat === 1) ? { seat: item.seat, answer: parseAnswer(item.answer) } : null))

    if (!answers.every((item) => item?.answer)) return null

    return { v: 1, seed: save.seed, seat: save.seat, hand: save.hand, decks: { mine: save.decks.mine, theirs: save.decks.theirs }, answers: answers as SessionAnswer[], savedAt: save.savedAt, ...(typeof save.cut?.dropped === 'boolean' ? { cut: { dropped: save.cut.dropped } } : {}) }
  } catch {
    return null
  }
}

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** El guardado de una sala en el navegador (`localStorage`); sin almacenamiento (o lleno), no se recuerda nada y recargar pierde el duelo, como sin guardado. */
export function autoSaveStore(room: string, storage: KeyStore | null = typeof localStorage === 'undefined' ? null : localStorage, now: () => number = Date.now): AutoSaveStore {
  const key = `${PREFIX}${room}`

  return {
    read() {
      try {
        return parseAutoSave(storage?.getItem(key) ?? null, now())
      } catch {
        return null
      }
    },
    write(save) {
      try {
        storage?.setItem(key, JSON.stringify(save))
      } catch {
        // Sin lugar no se recuerda.
      }
    },
    clear() {
      try {
        storage?.removeItem(key)
      } catch {
        // Sin almacenamiento no hay nada que borrar.
      }
    },
  }
}
