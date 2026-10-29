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
}

export function readSavedCombos(): SavedCombo[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_COMBOS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isSavedCombo).map(migrateSavedCombo) : []
  } catch {
    return []
  }
}

/** Combos guardados antes de que la mesa tuviera fases y destierro boca abajo: arrancan en la Draw Phase del turno 1. Una mano del rival que no se entiende se descarta (el combo queda sin rival). */
function migrateSavedCombo(combo: SavedCombo): SavedCombo {
  const { rival, ...table } = combo.initial
  const initial: MatState = { ...table, phase: table.phase ?? 'draw', turn: table.turn ?? 1, facedown: table.facedown ?? [], extraUp: table.extraUp ?? [], targeted: table.targeted ?? [], ...(isRivalHand(rival) ? { rival } : {}) }
  return { ...combo, initial }
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
