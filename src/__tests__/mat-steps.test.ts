import { describe, expect, it } from 'vitest'

import { matStepCards } from '../app/mat-steps'
import { createMatState } from '../app/practice-mat'

// La mano son las primeras cinco (a-e); el deck sigue con f y g.
const state = createMatState(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['x1'], 5)

describe('las cartas de cada jugada (las miniaturas de la lista de pasos)', () => {
  it('son las que se mueven, se activan o se invocan; barajar y cambiar de fase sin robar no llevan ninguna', () => {
    const cards = matStepCards(state, [
      { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'move', id: 'd', to: 'gy' },
      { type: 'activate', id: 'b' },
      { type: 'draw', count: 1 },
      { type: 'mill', count: 1 },
      { type: 'phase', phase: 'battle' },
      { type: 'shuffle', seed: 1 },
    ])

    expect(cards).toEqual([['a'], ['d'], ['b'], ['f'], ['g'], [], []])
  })

  it('al empezar otro turno la carta que se roba sola es la del paso; la ficha no tiene arte', () => {
    const cards = matStepCards(state, [
      { type: 'phase', phase: 'end' },
      { type: 'phase', phase: 'draw' },
      { type: 'token', zone: 'mz', index: 0 },
    ])

    expect(cards).toEqual([[], ['f'], []])
  })
})
