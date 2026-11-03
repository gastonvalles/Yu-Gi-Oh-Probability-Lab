import { t } from '../i18n'
import { isRecord } from './utils'
import { createId } from './utils'
import type { MatAction, MatState, RivalHand } from './practice-mat'

const SAVED_COMBOS_KEY = 'ygo-lab:practice-combos'

/**
 * Un combo guardado: la mesa inicial tal cual (mano, orden del deck y Extra) y las jugadas. Se
 * reproduce aplicando las jugadas sobre `initial`; `names` guarda el nombre de cada carta para que la
 * lista de pasos salga al instante aunque la carta ya no esté en el deck.
 */
export interface SavedCombo {
  id: string
  name: string
  deckName: string
  savedAt: string
  initial: MatState
  names: Record<string, string>
  actions: MatAction[]
  /** Se grabó en «Jugar solo automático»: las jugadas las contó el núcleo de reglas. Se abre igual en las dos mesas (es la misma forma). */
  auto?: true
  /** «Por qué este paso»: una línea por jugada, con el índice de la jugada como clave (el paso N de la lista es la jugada N − 1). Sin notas, no está. */
  notes?: Record<string, string>
}

/** El largo de una nota (como un tuit corto: una línea que se lee de un vistazo). */
export const MAX_NOTE = 140

/** Una nota en una línea: los saltos y los espacios repetidos son un espacio, sin bordes y recortada a `MAX_NOTE`. Vacía, no hay nota. */
export const normalizeNote = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE).trim()

/** La clave de una nota: un índice de jugada que existe (`"3"`, nunca `"03"`, `"-1"` ni `__proto__`). */
export const isNoteKey = (key: string, actions: number) => /^(?:0|[1-9]\d{0,3})$/.test(key) && Number(key) < actions

/** Las notas de un combo leído del almacenamiento: se queda lo que se entiende (la clave de una jugada que existe y un texto) y lo raro se descarta sin romper el combo. */
function storedNotes(value: unknown, actions: number): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const notes = Object.entries(value).flatMap(([key, text]) => (isNoteKey(key, actions) && typeof text === 'string' && normalizeNote(text) ? [[key, normalizeNote(text)] as const] : []))
  return notes.length > 0 ? Object.fromEntries(notes) : undefined
}

/** Pone, cambia o (con un texto vacío) borra la nota de la jugada `index` de un combo. */
export function setComboNote(combos: readonly SavedCombo[], id: string, index: number, text: string): SavedCombo[] {
  return combos.map((combo) => {
    if (combo.id !== id || !isNoteKey(String(index), combo.actions.length)) return combo
    const { notes, ...rest } = combo
    const next: Record<string, string> = { ...notes, [index]: normalizeNote(text) }
    if (!next[index]) delete next[index]
    return Object.keys(next).length > 0 ? { ...rest, notes: next } : rest
  })
}

export function readSavedCombos(): SavedCombo[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_COMBOS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isSavedCombo).map(migrateSavedCombo) : []
  } catch {
    return []
  }
}

/**
 * Combos guardados antes de que la mesa tuviera fases y destierro boca abajo: arrancan en la Draw Phase del turno 1. Una mano del rival que no se entiende se descarta (el combo queda sin rival),
 * y una nota que no se entiende, también (las demás se quedan).
 */
export function migrateSavedCombo(combo: SavedCombo): SavedCombo {
  const { notes: rawNotes, ...rest } = combo
  const { rival, ...table } = combo.initial
  const initial: MatState = { ...table, phase: table.phase ?? 'draw', turn: table.turn ?? 1, facedown: table.facedown ?? [], extraUp: table.extraUp ?? [], targeted: table.targeted ?? [], ...(isRivalHand(rival) ? { rival } : {}) }
  const notes = storedNotes(rawNotes, combo.actions.length)
  return { ...rest, initial, ...(notes ? { notes } : {}) }
}

const isRivalHand = (value: unknown): value is RivalHand => isRecord(value) && isStringList(value.hand) && isStringList(value.used)

export function writeSavedCombos(combos: readonly SavedCombo[]): void {
  try {
    localStorage.setItem(SAVED_COMBOS_KEY, JSON.stringify(combos))
  } catch {
    // Sin almacenamiento (modo privado o cuota llena): los combos viven sólo en esta sesión.
  }
}

const isStringList = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === 'string')

/** Forma mínima: el reducer es total, así que una jugada rara no rompe nada. */
function isSavedCombo(value: unknown): value is SavedCombo {
  if (!isRecord(value) || !isRecord(value.initial) || !isRecord(value.names)) {
    return false
  }

  const initial = value.initial

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.deckName === 'string' &&
    typeof value.savedAt === 'string' &&
    Array.isArray(value.actions) &&
    (['deck', 'extra', 'hand', 'gy', 'banished'] as const).every((pile) => isStringList(initial[pile])) &&
    (['mz', 'emz', 'st'] as const).every((zone) => Array.isArray(initial[zone])) &&
    typeof initial.tokens === 'number'
  )
}

/** Evita dos combos con el mismo nombre: "Línea básica", "Línea básica (2)"… */
export function uniqueComboName(name: string, combos: readonly SavedCombo[]): string {
  const base = name.trim() || t('practice.combo.unnamed')
  const taken = new Set(combos.map((combo) => combo.name.toLowerCase()))

  if (!taken.has(base.toLowerCase())) {
    return base
  }

  let index = 2
  while (taken.has(`${base} (${index})`.toLowerCase())) {
    index += 1
  }
  return `${base} (${index})`
}

/**
 * El grupo de un combo en la lista (como «Core» y «Through hand traps» de otros sitios): no se guarda, se deduce. «Con handtrap» si el rival simulado de «Jugar solo» usó una
 * handtrap (`rivalUse`, también dentro de un lote) y el combo sigue desde ahí; lo demás es la línea base.
 */
export type ComboGroup = 'base' | 'handtrap'

const usesHandtrap = (actions: readonly MatAction[]): boolean => actions.some((action) => action.type === 'rivalUse' || (action.type === 'batch' && usesHandtrap(action.actions)))

export const comboGroupOf = (combo: SavedCombo): ComboGroup => (usesHandtrap(combo.actions) ? 'handtrap' : 'base')

/**
 * La lista agrupada: la línea base primero y después los de handtrap, sin grupos vacíos. Adentro, el orden de siempre: los del deck actual primero, después por nombre de deck y el
 * más nuevo primero.
 */
export function groupSavedCombos(combos: readonly SavedCombo[], deckName: string): { group: ComboGroup; combos: SavedCombo[] }[] {
  const ordered = [...combos].sort(
    (a, b) => Number(b.deckName === deckName) - Number(a.deckName === deckName) || a.deckName.localeCompare(b.deckName, 'es') || b.savedAt.localeCompare(a.savedAt),
  )

  return (['base', 'handtrap'] as const).map((group) => ({ group, combos: ordered.filter((combo) => comboGroupOf(combo) === group) })).filter((entry) => entry.combos.length > 0)
}

/** Una variante ligada a su combo base: las dos hacen lo mismo hasta la jugada `fork` (su índice: el paso `fork + 1` es el primero distinto). */
export interface ComboBranch {
  base: SavedCombo
  variant: SavedCombo
  fork: number
}

/** Un valor en un texto con las claves ordenadas: el mismo combo armado por el reducer o leído de un enlace (`combo-share.ts` lo arma en otro orden) da el mismo texto. */
const canon = (value: unknown) =>
  JSON.stringify(value, (_key, entry: unknown) => (isRecord(entry) && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : entry))

/** La mesa (sin el rival: la variante puede cambiar sus handtraps) y cada jugada, en texto canónico. Por referencia, como los resúmenes: renombrar o anotar recalcula sólo ese. */
const KEYS = new WeakMap<SavedCombo, { table: string; plays: string[] }>()

function keyOf(combo: SavedCombo) {
  let key = KEYS.get(combo)

  if (!key) {
    const { rival: _rival, ...table } = combo.initial
    key = { table: canon(table), plays: combo.actions.map(canon) }
    KEYS.set(combo, key)
  }

  return key
}

/**
 * Las ramas de la lista (como «si el rival interrumpe con X en el paso N» de otros sitios): no se guardan, se deducen. Una variante («Con handtrap») es de un combo de la línea base
 * si arrancan con la misma mesa y hacen lo mismo al menos una jugada antes de separarse, y el base sigue después (si el base es un prefijo, la variante lo continúa: no es una rama).
 * Con dos bases gana el que comparte más, después el del mismo deck y después el más viejo. Borrar el base deja la variante suelta; importar los dos por enlace los vuelve a ligar.
 */
export function comboBranches(combos: readonly SavedCombo[]): ComboBranch[] {
  const bases = new Map<string, SavedCombo[]>()

  for (const combo of combos) {
    if (comboGroupOf(combo) !== 'base') continue
    const { table } = keyOf(combo)
    bases.set(table, [...(bases.get(table) ?? []), combo])
  }

  return combos.flatMap((variant) => {
    if (comboGroupOf(variant) !== 'handtrap') return []
    const { table, plays } = keyOf(variant)
    const candidates = (bases.get(table) ?? []).flatMap((base) => {
      const other = keyOf(base).plays
      let fork = 0
      while (fork < plays.length && fork < other.length && plays[fork] === other[fork]) fork += 1
      return fork >= 1 && fork < other.length ? [{ base, variant, fork }] : []
    })
    candidates.sort((a, b) => b.fork - a.fork || Number(b.base.deckName === variant.deckName) - Number(a.base.deckName === variant.deckName) || a.base.savedAt.localeCompare(b.base.savedAt))
    return candidates.slice(0, 1)
  })
}

/** El otro combo de una rama, visto desde la lista de pasos de uno: `role` dice qué es el otro (sus variantes, en el base; su base, en una variante). */
export interface StepBranch {
  combo: SavedCombo
  fork: number
  role: 'variant' | 'base'
}

/** Las ramas de un combo por la jugada donde se separa (la clave es su índice, como en las notas: el paso `fork + 1`). Sin ramas, nada. */
export function stepBranchesOf(branches: readonly ComboBranch[], combo: SavedCombo): Record<number, StepBranch[]> | undefined {
  const steps: Record<number, StepBranch[]> = {}

  for (const { base, variant, fork } of branches) {
    const other = base === combo ? { combo: variant, role: 'variant' as const } : variant === combo ? { combo: base, role: 'base' as const } : null
    if (other) (steps[fork] ??= []).push({ ...other, fork })
  }

  return Object.keys(steps).length > 0 ? steps : undefined
}

/** Renombra un combo: el nombre nuevo no puede repetir el de otro (con el suyo sí) y uno vacío deja el que tenía. */
export function renameSavedCombo(combos: readonly SavedCombo[], id: string, name: string): SavedCombo[] {
  if (!name.trim()) {
    return [...combos]
  }

  const others = combos.filter((combo) => combo.id !== id)

  return combos.map((combo) => (combo.id === id ? { ...combo, name: uniqueComboName(name, others) } : combo))
}

interface NewCombo {
  name: string
  deckName: string
  initial: MatState
  actions: readonly MatAction[]
  nameOf: (id: string) => string
  auto?: boolean
}

/** Las cartas de un combo que llevan nombre en `names`: las del deck, el Extra, la mano y la mano del rival. */
export const comboCardIds = (initial: MatState) => [...initial.deck, ...initial.extra, ...initial.hand, ...(initial.rival?.hand ?? [])]

export function createSavedCombo({ name, deckName, initial, actions, nameOf, auto = false }: NewCombo, combos: readonly SavedCombo[], now = new Date()): SavedCombo {
  const ids = comboCardIds(initial)

  return {
    id: createId('combo'),
    name: uniqueComboName(name, combos),
    deckName,
    savedAt: now.toISOString(),
    initial: structuredClone(initial),
    names: Object.fromEntries(ids.map((id) => [id, nameOf(id)])),
    actions: structuredClone([...actions]),
    ...(auto ? { auto: true as const } : {}),
  }
}
