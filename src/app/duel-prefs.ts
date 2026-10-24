import type { DeckFormat } from '../types'
import { DEFAULT_LIMIT_MIN, DEFAULT_TURN_BONUS_MIN, DEFAULT_TURN_MIN, DUEL_FORMATS, DUEL_LIMIT_CHOICES, GENESYS_CAP_RANGE, TURN_BONUS_RANGE, TURN_MIN_RANGE } from './duel-protocol'
import type { PublicRoom } from './duel-relay-rules'
import { GENESYS_POINT_CAP } from './genesys-format'

/**
 * Lo que se juega por defecto: las reglas con que «Jugar ahora» busca una sala o abre la tuya. Se recuerdan en el navegador (se guardan al elegirlas en «Reglas»
 * y al abrir un duelo con ellas) y valen los de siempre mientras nadie elija otras. No se guarda quién puede entrar: «Jugar ahora» es siempre público y «Retar a un amigo», siempre privado.
 */
export interface DuelPrefs {
  /** 50 (minutos) o 0 (sin tiempo). */
  limitMin: number
  /** Límite de tiempo por turno (reloj de turnos): encendido o apagado, con sus minutos (los que se recuerdan aunque esté apagado). */
  turnLimit: boolean
  turnMin: number
  turnBonusMin: number
  format: DeckFormat
  match: boolean
  siding: boolean
  /** Sólo cuenta en Genesys: el total de puntos que el deck no puede pasar. */
  genesysCap: number
}

/** Lo que fija el anfitrión de una sala al abrirla: las reglas y si aparece en la lista de salas abiertas mientras espera rival. */
export interface RoomOptions extends DuelPrefs {
  isPublic: boolean
  /**
   * Reglas automáticas (beta): el interruptor del modo automático (`auto-prefs.ts`) estaba prendido al abrirla y no es «Jugar ahora». Se decide al abrir y queda fijo
   * mientras dure la sala (no es una regla que se recuerde: cambiar el interruptor después no cambia una sala abierta). Una sala así es privada.
   */
  auto?: boolean
}

/** Lo que viene elegido: TCG, 50 minutos, un solo duelo. */
export const DEFAULT_PREFS: DuelPrefs = { limitMin: DEFAULT_LIMIT_MIN, turnLimit: true, turnMin: DEFAULT_TURN_MIN, turnBonusMin: DEFAULT_TURN_BONUS_MIN, format: 'tcg', match: false, siding: false, genesysCap: GENESYS_POINT_CAP }
export const PREFS_KEY = 'ygo-lab:duel-prefs'

const validInt = (value: unknown, range: { min: number; max: number }, otherwise: number): number => (typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max ? value : otherwise)

/** Los minutos del reloj de turnos que valen: enteros dentro de lo que se ofrece; si no, los de siempre. */
export const validTurnMin = (value: unknown): number => validInt(value, TURN_MIN_RANGE, DEFAULT_TURN_MIN)
export const validTurnBonusMin = (value: unknown): number => validInt(value, TURN_BONUS_RANGE, DEFAULT_TURN_BONUS_MIN)

/** El tope de puntos de Genesys que vale: un entero dentro del rango que se ofrece; si no, el oficial. */
export const validGenesysCap = (value: unknown): number => (typeof value === 'number' && Number.isInteger(value) && value >= GENESYS_CAP_RANGE.min && value <= GENESYS_CAP_RANGE.max ? value : GENESYS_POINT_CAP)

/** Las reglas guardadas, o las de siempre si no hay o no se entienden (lo guardado es de otra persona o de una versión anterior: se revisa campo por campo). */
export function readPrefs(storage: () => Storage = () => localStorage): DuelPrefs {
  let stored: Partial<DuelPrefs> = {}

  try {
    const parsed: unknown = JSON.parse(storage().getItem(PREFS_KEY) ?? '{}')

    stored = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Partial<DuelPrefs>) : {}
  } catch {
    // Sin almacenamiento o lo guardado no se entiende: valen los de siempre.
  }

  const match = stored.match === true

  return {
    limitMin: (DUEL_LIMIT_CHOICES as readonly number[]).includes(stored.limitMin ?? -1) ? (stored.limitMin as number) : DEFAULT_PREFS.limitMin,
    turnLimit: stored.turnLimit !== false,
    turnMin: validTurnMin(stored.turnMin),
    turnBonusMin: validTurnBonusMin(stored.turnBonusMin),
    format: (DUEL_FORMATS as readonly unknown[]).includes(stored.format) ? (stored.format as DeckFormat) : DEFAULT_PREFS.format,
    match,
    siding: match && stored.siding === true,
    genesysCap: validGenesysCap(stored.genesysCap),
  }
}

export function writePrefs(prefs: DuelPrefs, storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(PREFS_KEY, JSON.stringify({ limitMin: prefs.limitMin, turnLimit: prefs.turnLimit, turnMin: prefs.turnMin, turnBonusMin: prefs.turnBonusMin, format: prefs.format, match: prefs.match, siding: prefs.match && prefs.siding, genesysCap: prefs.genesysCap }))
  } catch {
    // Sin almacenamiento (ventana privada, cuota): valen hasta recargar.
  }
}

/**
 * La sala a la que «Jugar ahora» entra, de las que esperan rival: del mismo formato y del mismo tipo (un solo duelo o un Match: no se entra a una mejor de 3 sin saberlo) y, en Genesys,
 * con el mismo tope de puntos (si no, el deck de uno no valdría en la sala del otro). Entre ésas, la que tiene el reloj elegido y, si empatan, la que hace más que espera (la más vieja).
 * `null` si ninguna sirve: entonces se abre una con tus reglas.
 */
export function pickRoom(rooms: readonly PublicRoom[], prefs: DuelPrefs): PublicRoom | null {
  const compatible = rooms.filter((room) => room.format === prefs.format && room.match === prefs.match && (prefs.format !== 'genesys' || (room.genesysCap ?? GENESYS_POINT_CAP) === prefs.genesysCap))

  if (compatible.length === 0) {
    return null
  }

  return [...compatible].sort((a, b) => Number(b.limitMin === prefs.limitMin) - Number(a.limitMin === prefs.limitMin) || Number(b.siding === prefs.siding) - Number(a.siding === prefs.siding) || a.createdAt - b.createdAt)[0] ?? null
}
