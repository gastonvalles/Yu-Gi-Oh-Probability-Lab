import { describe, expect, it } from 'vitest'

import { isMoment, momentText } from '../app/duel-moment'
import { createMatState, type MatAction } from '../app/practice-mat'

const nameOf = (id: string) => ({ a1: 'Gene-Warped Warwolf', b1: 'Dark Blade', r1: 'Sky Striker Ace - Zeke' })[id] ?? id

describe('los momentos de la línea (`duel-moment.ts`)', () => {
  it('son invocar boca arriba en una zona de monstruo y atacar (también dentro de un lote); colocar, robar o cambiar de fase no', () => {
    const moments: MatAction[] = [
      { type: 'place', id: 'a1', zone: 'mz', index: 2, pos: 'atk', how: 'normal' },
      { type: 'place', id: 'a1', zone: 'emz', index: 0, pos: 'def', how: 'special' },
      { type: 'tribute', id: 'a1', tributes: ['b1'], zone: 'mz', index: 0, pos: 'atk' },
      { type: 'summon', id: 'a1', how: 'xyz', materials: ['b1'], zone: 'emz', index: 0, pos: 'atk' },
      { type: 'attack', id: 'a1', target: 'r1' },
      { type: 'attack', id: 'a1' },
      { type: 'batch', actions: [{ type: 'move', id: 'b1', to: 'gy' }, { type: 'place', id: 'a1', zone: 'mz', index: 0, pos: 'atk', how: 'special' }] },
    ]
    const others: MatAction[] = [
      { type: 'place', id: 'a1', zone: 'mz', index: 2, pos: 'set', how: 'normal' },
      { type: 'place', id: 'a1', zone: 'st', index: 0, pos: 'atk' },
      { type: 'tribute', id: 'a1', tributes: ['b1'], zone: 'mz', index: 0, pos: 'set' },
      { type: 'draw', count: 1 },
      { type: 'phase', phase: 'battle' },
      { type: 'move', id: 'a1', to: 'gy' },
    ]

    for (const action of moments) expect(isMoment(action), JSON.stringify(action)).toBe(true)
    for (const action of others) expect(isMoment(action), JSON.stringify(action)).toBe(false)
  })

  it('la frase es la del paso (la de la lista de pasos), de la jugada con la que la mesa llegó a `cursor`; si no es un momento, null', () => {
    const initial = createMatState(['a1', 'b1', 'c1', 'd1', 'e1', 'f1'], [], 5)
    const actions: MatAction[] = [
      { type: 'place', id: 'a1', zone: 'mz', index: 2, pos: 'atk', how: 'normal' },
      { type: 'phase', phase: 'battle' },
      { type: 'attack', id: 'a1', target: 'r1' },
    ]

    expect(momentText(initial, actions, 1, nameOf)).toBe('Invocación Normal de Gene-Warped Warwolf')
    expect(momentText(initial, actions, 2, nameOf)).toBeNull()
    expect(momentText(initial, actions, 3, nameOf)).toContain('Sky Striker Ace - Zeke')
    expect(momentText(initial, actions, 0, nameOf)).toBeNull()
  })
})
