import { describe, expect, it } from 'vitest'

import type { MatAction } from '../app/practice-mat'
import { comboGroupOf, groupSavedCombos, type SavedCombo } from '../app/saved-combos'
import { referenceCombo } from './support/combo-fixtures'

const combo = (id: string, deckName: string, savedAt: string, actions: MatAction[] = []): SavedCombo => ({ ...referenceCombo(), id, deckName, savedAt, actions })
const rivalUse: MatAction = { type: 'rivalUse', id: 'rival.card-14558127-1' }
const place: MatAction = { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' }

describe('grupos de los combos guardados', () => {
  it('el grupo se deduce de las jugadas: con un `rivalUse` (también dentro de un lote) es «Con handtrap»; sin él o sin jugadas, la línea base', () => {
    expect(comboGroupOf(combo('a', 'X', '1', [place]))).toBe('base')
    expect(comboGroupOf(combo('b', 'X', '1', []))).toBe('base')
    expect(comboGroupOf(combo('c', 'X', '1', [place, rivalUse, place]))).toBe('handtrap')
    expect(comboGroupOf(combo('d', 'X', '1', [{ type: 'batch', actions: [place, rivalUse] }]))).toBe('handtrap')
  })

  it('la línea base primero y adentro el orden de siempre: el deck actual, después por nombre de deck y el más nuevo primero', () => {
    const list = [
      combo('old-b', 'Branded', '2026-10-01', [rivalUse]),
      combo('cur-old', 'Snake-Eye', '2026-10-01'),
      combo('ang', 'Angelechy', '2026-10-05'),
      combo('cur-new', 'Snake-Eye', '2026-10-09'),
      combo('new-b', 'Branded', '2026-10-09', [rivalUse]),
      combo('cur-ht', 'Snake-Eye', '2026-10-02', [{ type: 'batch', actions: [rivalUse] }]),
    ]

    expect(groupSavedCombos(list, 'Snake-Eye').map(({ group, combos }) => [group, combos.map((item) => item.id)])).toEqual([
      ['base', ['cur-new', 'cur-old', 'ang']],
      ['handtrap', ['cur-ht', 'new-b', 'old-b']],
    ])
  })

  it('con una sola clase hay un solo grupo, y sin combos ninguno', () => {
    expect(groupSavedCombos([combo('a', 'X', '1', [rivalUse])], 'X').map(({ group }) => group)).toEqual(['handtrap'])
    expect(groupSavedCombos([combo('a', 'X', '1'), combo('b', 'Y', '2')], 'X').map(({ group }) => group)).toEqual(['base'])
    expect(groupSavedCombos([], 'X')).toEqual([])
  })
})
