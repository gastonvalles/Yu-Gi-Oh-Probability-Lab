/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import { createMatState, replayMat, type MatAction } from '../app/practice-mat'
import { createSavedCombo, readSavedCombos, uniqueComboName, writeSavedCombos } from '../app/saved-combos'

const initial = createMatState(['card-1-1', 'card-1-2', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1'], ['card-9-1'], 5)
const actions: MatAction[] = [
  { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' },
  { type: 'draw', count: 1 },
  { type: 'shuffle', seed: 42 },
]
const names: Record<string, string> = { 'card-1-1': 'Ash', 'card-1-2': 'Ash', 'card-2-1': 'Maxx', 'card-3-1': 'Droll', 'card-4-1': 'Nib', 'card-5-1': 'Imperm', 'card-9-1': 'Zeus' }
const nameOf = (id: string) => names[id] ?? id

describe('combos guardados', () => {
  beforeEach(() => localStorage.clear())

  it('se guardan y se leen del navegador con la mesa inicial, los nombres y las jugadas', () => {
    const combo = createSavedCombo({ name: '  Línea básica ', deckName: 'Yummy', initial, actions, nameOf }, [], new Date('2026-10-11T12:00:00Z'))
    writeSavedCombos([combo])

    expect(readSavedCombos()).toEqual([combo])
    expect(combo.name).toBe('Línea básica')
    expect(combo.savedAt).toBe('2026-10-11T12:00:00.000Z')
    expect(combo.names['card-9-1']).toBe('Zeus')
    expect(combo.initial).toEqual(initial)
    expect(combo.initial).not.toBe(initial)
  })

  it('reproducir el combo guardado da el mismo estado final', () => {
    const combo = createSavedCombo({ name: 'Línea', deckName: 'Yummy', initial, actions, nameOf }, [])
    const saved = JSON.parse(JSON.stringify(combo)) as typeof combo

    expect(replayMat(saved.initial, saved.actions)).toEqual(replayMat(initial, actions))
    expect(replayMat(saved.initial, saved.actions, 1).mz[0]?.id).toBe('card-1-1')
  })

  it('un combo guardado antes de las fases arranca en la Main Phase 1 del turno 1', () => {
    const combo = createSavedCombo({ name: 'Viejo', deckName: 'd', initial, actions, nameOf }, [])
    const { phase: _phase, turn: _turn, ...legacyInitial } = combo.initial
    localStorage.setItem('ygo-lab:practice-combos', JSON.stringify([{ ...combo, initial: legacyInitial }]))

    const [read] = readSavedCombos()
    expect(read?.initial.phase).toBe('main1')
    expect(read?.initial.turn).toBe(1)
  })

  it('ignora lo que no tiene forma de combo', () => {
    localStorage.setItem('ygo-lab:practice-combos', JSON.stringify([{ id: 'x' }, 'nada', null, { id: 'c', name: 'n', deckName: 'd', savedAt: 's', initial: { deck: [] }, names: {}, actions: [] }]))

    expect(readSavedCombos()).toEqual([])

    localStorage.setItem('ygo-lab:practice-combos', '{')
    expect(readSavedCombos()).toEqual([])
  })

  it('no repite nombres', () => {
    const first = createSavedCombo({ name: 'Línea', deckName: 'd', initial, actions, nameOf }, [])
    const second = createSavedCombo({ name: 'línea', deckName: 'd', initial, actions, nameOf }, [first])

    expect(second.name).toBe('línea (2)')
    expect(uniqueComboName('', [])).toBe('Combo sin nombre')
    expect(uniqueComboName('Línea', [first, second])).toBe('Línea (3)')
  })
})
