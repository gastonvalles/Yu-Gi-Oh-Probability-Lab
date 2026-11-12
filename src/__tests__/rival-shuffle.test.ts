import { describe, expect, it } from 'vitest'

import { rivalShuffled } from '../app/rival-shuffle'
import { createMatState, matReducer } from '../app/practice-mat'

// La mesa del rival en los duelos automáticos: sus ids son opacos y su mano no se ve; lo que la mesa necesita saber es cuándo se baraja a la vista.
const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
const table = () => createMatState(ids, [], 2)

describe('rivalShuffled: cuándo el rival baraja su deck y su mano a la vista', () => {
  it('sumar una carta a su mano baraja (robar o buscar); sacar una o moverla en el campo, no', () => {
    const before = table()

    expect(rivalShuffled(before, matReducer(before, { type: 'draw', count: 1, ids: ['c3'] }))).toBe(true)
    expect(rivalShuffled(before, matReducer(before, { type: 'move', id: 'c4', to: 'hand' }))).toBe(true)
    expect(rivalShuffled(before, matReducer(before, { type: 'move', id: 'c1', to: 'gy' }))).toBe(false)
    expect(rivalShuffled(before, before)).toBe(false)
  })

  it('tocar su deck (barajar: cambia el orden, no cuántas cartas hay) baraja; sacar una carta del deck, no', () => {
    const before = table()

    expect(rivalShuffled(before, matReducer(before, { type: 'shuffle', seed: 7 }))).toBe(true)
    expect(rivalShuffled(before, matReducer(before, { type: 'mill', count: 1 }))).toBe(false)
    // La mesa que se rearma con las mismas cartas (otro arreglo, el mismo orden) no es un barajado.
    expect(rivalShuffled(before, { ...before, deck: [...before.deck] })).toBe(false)
  })

  it('el reparto (la mesa todavía sin mano) no se baraja', () => {
    const empty = createMatState(ids, [], 0)

    expect(rivalShuffled(empty, matReducer(empty, { type: 'draw', count: 2, ids: ['c1', 'c2'] }))).toBe(false)
  })
})
