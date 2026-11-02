import { describe, expect, it } from 'vitest'

import { comboSummary } from '../app/combo-summary'
import { createMatState, type MatAction } from '../app/practice-mat'
import { createSavedCombo } from '../app/saved-combos'

const NAMES: Record<string, string> = {
  'card-1-1': 'Ash',
  'card-1-2': 'Ash',
  'card-2-1': 'Maxx',
  'card-3-1': 'Droll',
  'card-4-1': 'Nib',
  'card-5-1': 'Imperm',
  'card-6-1': 'Called',
  'card-9-1': 'Zeus',
}
const nameOf = (id: string) => NAMES[id] ?? id
const DECK = ['card-1-1', 'card-1-2', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1']

const summary = (actions: MatAction[], { hand = 5, auto = false } = {}) =>
  comboSummary(createSavedCombo({ name: 'C', deckName: 'D', initial: createMatState(DECK, ['card-9-1'], hand), actions, nameOf, auto }, []))

describe('el resumen de un combo guardado', () => {
  it('arranca con las cartas de la mano que se usan, en orden y con sus copias juntas; las que no se usan no van', () => {
    const result = summary([
      { type: 'place', id: 'card-2-1', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: 'card-1-1', zone: 'mz', index: 1, pos: 'def' },
      { type: 'move', id: 'card-1-2', to: 'gy' },
    ])

    expect(result.starts).toEqual(['Maxx', 'Ash ×2'])
    expect(result.ends).toEqual(['Maxx', 'Ash'])
  })

  it('termina con monstruos, después Mágicas y Trampas y el campo; las fichas no se nombran', () => {
    const result = summary([
      { type: 'token', zone: 'mz', index: 0 },
      { type: 'place', id: 'card-4-1', zone: 'st', index: 2, pos: 'set' },
      { type: 'summon', id: 'card-9-1', how: 'link', materials: [], zone: 'emz', index: 0, pos: 'atk' },
      { type: 'place', id: 'card-3-1', zone: 'mz', index: 1, pos: 'atk' },
    ])

    expect(result.starts).toEqual(['Nib', 'Droll'])
    expect(result.ends).toEqual(['Droll', 'Zeus', 'Nib'])
  })

  it('sin jugadas, o con el campo vacío al final, la línea queda vacía (la ficha no la muestra)', () => {
    expect(summary([])).toEqual({ starts: [], ends: [] })
    expect(summary([{ type: 'move', id: 'card-1-1', to: 'gy' }])).toEqual({ starts: ['Ash'], ends: [] })
  })

  it('en el automático, lo robado después (con `ids`) no es de la mano inicial aunque se juegue', () => {
    const result = summary(
      [
        { type: 'draw', count: 1, ids: ['card-6-1'] },
        { type: 'place', id: 'card-6-1', zone: 'st', index: 0, pos: 'set' },
        { type: 'activate', id: 'card-4-1', cost: 'discard' },
      ],
      { auto: true },
    )

    expect(result.starts).toEqual(['Nib'])
    expect(result.ends).toEqual(['Called'])
  })
})
