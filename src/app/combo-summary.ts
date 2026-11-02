import { describeSteps, matStates } from './mat-step-info'
import { isToken, type MatState } from './practice-mat'
import type { SavedCombo } from './saved-combos'

/**
 * El resumen de un combo guardado para su ficha en la lista (Gastón, 2026-11-02, mirando los combos de otro sitio): con qué cartas de la mano arranca y en qué tablero
 * termina. No se guarda nada: sale de reproducir las jugadas. Cada entrada es un nombre, con «×N» si hay copias.
 */
export interface ComboSummary {
  /** Las cartas de la mano inicial que salen de la mano en alguna jugada, en el orden en que se usan. */
  starts: string[]
  /** Las cartas que quedan en el campo al final: monstruos, Mágicas y Trampas, y el campo. */
  ends: string[]
}

/** Agrupa las copias por nombre, en el orden en que aparece cada una. Las fichas y las cartas sin nombre (las del rival que se tomaron) no se nombran. */
function grouped(ids: readonly string[], names: Readonly<Record<string, string>>): string[] {
  const counts = new Map<string, number>()

  for (const id of ids) {
    const name = isToken(id) ? undefined : names[id]

    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
}

const onField = (state: MatState) => [...state.mz, ...state.emz, ...state.st, state.field].flatMap((placed) => (placed ? [placed.id] : []))

export function comboSummary({ initial, actions, names }: Pick<SavedCombo, 'initial' | 'actions' | 'names'>): ComboSummary {
  if (actions.length === 0) return { starts: [], ends: [] }

  const states = matStates(initial, actions)
  const opening = new Set(initial.hand)
  const used = new Set<string>()

  // Por lo que se mueve y no sólo por la carta de la jugada: el costo de descartar en un lote también sale de la mano.
  for (const step of describeSteps(initial, actions, states)) {
    for (const move of step.moves) {
      if (move.from?.kind === 'pile' && move.from.pile === 'hand' && opening.has(move.id)) used.add(move.id)
    }
  }

  return { starts: grouped([...used], names), ends: grouped(onField(states[states.length - 1]!), names) }
}
