import { describe, expect, it } from 'vitest'

import { createMatState, matReducer, replayMat } from '../app/practice-mat'

/** Cinco cartas en la mano, un monstruo del Extra y uno ya invocado en el campo. */
function table() {
  const base = createMatState(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], ['x1', 'x2'], 5)

  return replayMat(base, [{ type: 'place', id: 'm1', zone: 'mz', index: 0, pos: 'atk' }])
}

describe('la Invocación desde el Extra Deck sin materiales', () => {
  it('se hace igual: la carta sale del Extra a la zona y nada del campo se toca', () => {
    const state = table()
    const next = matReducer(state, { type: 'summon', id: 'x1', how: 'fusion', materials: [], zone: 'mz', index: 2, pos: 'atk' })

    expect(next.extra).toEqual(['x2'])
    expect(next.mz[2]).toMatchObject({ id: 'x1', pos: 'atk', materials: [] })
    expect(next.mz[0]).toMatchObject({ id: 'm1' })
    expect(next.gy).toEqual([])
  })

  it('un Xyz sin materiales sale sin nada debajo; con materiales siguen yendo al cementerio o debajo', () => {
    const state = table()
    const bare = matReducer(state, { type: 'summon', id: 'x1', how: 'xyz', materials: [], zone: 'emz', index: 0, pos: 'def' })

    expect(bare.emz[0]).toMatchObject({ id: 'x1', pos: 'def', materials: [] })

    const withMaterial = matReducer(state, { type: 'summon', id: 'x1', how: 'xyz', materials: ['m1'], zone: 'mz', index: 0, pos: 'atk' })

    expect(withMaterial.mz[0]).toMatchObject({ id: 'x1', materials: ['m1'] })
    expect(withMaterial.gy).toEqual([])

    const fusion = matReducer(state, { type: 'summon', id: 'x1', how: 'fusion', materials: ['m1'], zone: 'mz', index: 0, pos: 'atk' })

    expect(fusion.gy).toEqual(['m1'])
  })

  it('sigue sin invocarse lo que no está en el Extra, ni en una zona ocupada', () => {
    const state = table()

    expect(matReducer(state, { type: 'summon', id: 'm2', how: 'fusion', materials: [], zone: 'mz', index: 3, pos: 'atk' })).toBe(state)
    expect(matReducer(state, { type: 'summon', id: 'x1', how: 'fusion', materials: [], zone: 'mz', index: 0, pos: 'atk' })).toBe(state)
  })
})
