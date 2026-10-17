import type { DeckFormat } from '../types'
import { DUEL_FORMATS, DUEL_LIMITS_MIN } from './duel-protocol'
import type { PublicRoom } from './duel-relay-rules'

/**
 * Lo que se juega por defecto: las reglas con que «Jugar ahora» busca una sala o abre la tuya. Se recuerdan en el navegador (se guardan al elegirlas en «Reglas»
 * y al abrir un duelo con ellas) y valen los de siempre mientras nadie elija otras. No se guarda quién puede entrar: «Jugar ahora» es siempre público y «Retar a un amigo», siempre privado.
 */
export interface DuelPrefs {
  limitMin: number
  format: DeckFormat
  match: boolean
  siding: boolean
}

/** Lo que fija el anfitrión de una sala al abrirla: las reglas y si aparece en la lista de salas abiertas mientras espera rival. */
export interface RoomOptions extends DuelPrefs {
  isPublic: boolean
}

/** Lo que viene elegido: TCG, 40 minutos, un solo duelo. */
export const DEFAULT_PREFS: DuelPrefs = { limitMin: 40, format: 'tcg', match: false, siding: false }
export const PREFS_KEY = 'ygo-lab:duel-prefs'

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
    limitMin: (DUEL_LIMITS_MIN as readonly number[]).includes(stored.limitMin ?? -1) ? (stored.limitMin as number) : DEFAULT_PREFS.limitMin,
    format: (DUEL_FORMATS as readonly unknown[]).includes(stored.format) ? (stored.format as DeckFormat) : DEFAULT_PREFS.format,
    match,
    siding: match && stored.siding === true,
  }
}

export function writePrefs(prefs: DuelPrefs, storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(PREFS_KEY, JSON.stringify({ limitMin: prefs.limitMin, format: prefs.format, match: prefs.match, siding: prefs.match && prefs.siding }))
  } catch {
    // Sin almacenamiento (ventana privada, cuota): valen hasta recargar.
  }
}

/**
 * La sala a la que «Jugar ahora» entra, de las que esperan rival: del mismo formato y del mismo tipo (un solo duelo o un Match: no se entra a una mejor de 3 sin saberlo). Entre ésas,
 * la que tiene el reloj elegido, y si empatan, la que hace más que espera (la más vieja). `null` si ninguna sirve: entonces se abre una con tus reglas.
 */
export function pickRoom(rooms: readonly PublicRoom[], prefs: DuelPrefs): PublicRoom | null {
  const compatible = rooms.filter((room) => room.format === prefs.format && room.match === prefs.match)

  if (compatible.length === 0) {
    return null
  }

  return [...compatible].sort((a, b) => Number(b.limitMin === prefs.limitMin) - Number(a.limitMin === prefs.limitMin) || Number(b.siding === prefs.siding) - Number(a.siding === prefs.siding) || a.createdAt - b.createdAt)[0] ?? null
}
