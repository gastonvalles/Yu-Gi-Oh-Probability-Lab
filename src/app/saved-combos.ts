import { t } from '../i18n'
import { isRecord } from './utils'
import { createId } from './utils'
import type { MatAction, MatState } from './practice-mat'

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
}

export function readSavedCombos(): SavedCombo[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_COMBOS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isSavedCombo).map(migrateSavedCombo) : []
  } catch {
    return []
  }
}

/** Combos guardados antes de que la mesa tuviera fases y destierro boca abajo: arrancan en la Draw Phase del turno 1. */
function migrateSavedCombo(combo: SavedCombo): SavedCombo {
  const initial: MatState = { ...combo.initial, phase: combo.initial.phase ?? 'draw', turn: combo.initial.turn ?? 1, facedown: combo.initial.facedown ?? [], targeted: combo.initial.targeted ?? [] }
  return { ...combo, initial }
}

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
}

export function createSavedCombo({ name, deckName, initial, actions, nameOf }: NewCombo, combos: readonly SavedCombo[], now = new Date()): SavedCombo {
  const ids = [...initial.deck, ...initial.extra, ...initial.hand]

  return {
    id: createId('combo'),
    name: uniqueComboName(name, combos),
    deckName,
    savedAt: now.toISOString(),
    initial: structuredClone(initial),
    names: Object.fromEntries(ids.map((id) => [id, nameOf(id)])),
    actions: structuredClone([...actions]),
  }
}
