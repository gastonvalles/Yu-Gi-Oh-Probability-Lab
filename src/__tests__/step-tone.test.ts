import { describe, expect, it } from 'vitest'

import { createMatState, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { stepTone } from '../components/probability/step-tone'

const main = Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`)
const start = createMatState(main, ['card-9001-1'], 5)
const [first, second, third] = start.hand as [string, string, string]

/** El estado de antes de la última jugada y esa jugada: lo que mira `stepTone`. */
const last = (...actions: MatAction[]): [MatState, MatAction] => {
  let before = start

  for (const action of actions.slice(0, -1)) before = matReducer(before, action)

  return [before, actions[actions.length - 1]!]
}

const tone = (...actions: MatAction[]) => stepTone(...last(...actions))

describe('el color de un paso del replay: el del destello que hace en la mesa', () => {
  it('invocar: la Normal, dorada; la Especial, celeste; por el Extra Deck, el de cómo llega (Fusión violeta, Sincronía blanca, Xyz índigo, Enlace verde agua)', () => {
    expect(tone({ type: 'place', id: first, zone: 'mz', index: 0, pos: 'atk', how: 'normal' })).toBe('gold')
    expect(tone({ type: 'place', id: first, zone: 'mz', index: 0, pos: 'atk', how: 'special' })).toBe('cyan')
    expect(tone({ type: 'summon', id: 'card-9001-1', how: 'fusion', materials: [], zone: 'mz', index: 0, pos: 'atk' })).toBe('violet')
    expect(tone({ type: 'summon', id: 'card-9001-1', how: 'synchro', materials: [], zone: 'mz', index: 0, pos: 'atk' })).toBe('white')
    expect(tone({ type: 'summon', id: 'card-9001-1', how: 'xyz', materials: [], zone: 'mz', index: 0, pos: 'atk' })).toBe('indigo')
    expect(tone({ type: 'summon', id: 'card-9001-1', how: 'link', materials: [], zone: 'mz', index: 0, pos: 'atk' })).toBe('teal')
  })

  it('los efectos: activar, dorado; marcar un objetivo y atacar, rojo; mostrar, celeste; declarar, violeta', () => {
    const summoned: MatAction = { type: 'place', id: first, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }

    expect(tone(summoned, { type: 'activate', id: first })).toBe('gold')
    expect(tone(summoned, { type: 'target', id: first })).toBe('red')
    expect(tone(summoned, { type: 'attack', id: first })).toBe('red')
    expect(tone({ type: 'reveal', id: second })).toBe('cyan')
    expect(tone({ type: 'declare', id: second })).toBe('violet')
  })

  it('las pilas: robar y buscar, celeste; el cementerio, violeta; el destierro, ámbar', () => {
    expect(tone({ type: 'draw', count: 1 })).toBe('cyan')
    expect(tone({ type: 'move', id: main[10]!, to: 'hand' })).toBe('cyan')
    expect(tone({ type: 'move', id: second, to: 'gy' })).toBe('violet')
    expect(tone({ type: 'move', id: third, to: 'banished' })).toBe('amber')
  })

  it('un paso sin destello (colocar boca abajo, cambiar de posición, barajar), un cambio de fase y la jugada que no cambia nada no tienen color', () => {
    const summoned: MatAction = { type: 'place', id: first, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }

    expect(tone({ type: 'place', id: first, zone: 'mz', index: 0, pos: 'set' })).toBeNull()
    expect(tone(summoned, { type: 'position', id: first, pos: 'def' })).toBeNull()
    expect(tone({ type: 'shuffle', seed: 3 })).toBeNull()
    expect(tone({ type: 'phase', phase: 'battle' })).toBeNull()
    // Una carta que no existe: nada cambia, nada destella.
    expect(tone({ type: 'activate', id: 'card-que-no-esta' })).toBeNull()
  })
})
