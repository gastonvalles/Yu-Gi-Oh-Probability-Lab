import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { atLeastProbability, minCopiesFor } from '../app/quick-odds'

describe('la calculadora rápida', () => {
  it('da la hipergeométrica exacta: 3 copias en 40, mano de 5', () => {
    expect(atLeastProbability(40, 3, 5, 1) * 100).toBeCloseTo(33.76, 2)
    expect(atLeastProbability(40, 3, 5, 2) * 100).toBeCloseTo(3.64, 2)
    expect(atLeastProbability(40, 3, 5, 3) * 100).toBeCloseTo(0.1, 1)
    // Yendo segundo (6 cartas) sube.
    expect(atLeastProbability(40, 3, 6, 1)).toBeGreaterThan(atLeastProbability(40, 3, 5, 1))
  })

  it('acota los casos raros: sin copias 0, con la mano del tamaño del deck se roba todo', () => {
    expect(atLeastProbability(40, 0, 5, 1)).toBe(0)
    expect(atLeastProbability(40, 3, 5, 0)).toBe(1)
    expect(atLeastProbability(5, 2, 5, 2)).toBe(1)
    expect(atLeastProbability(5, 1, 7, 2)).toBe(0)
    expect(atLeastProbability(0, 3, 5, 1)).toBe(0)
  })

  it('calcula las copias mínimas para llegar a un %: 50 % → 5, 60 % → 7, 70 % → 9 (en 5 de 40)', () => {
    expect(minCopiesFor(40, 5, 0.5)).toBe(5)
    expect(minCopiesFor(40, 5, 0.6)).toBe(7)
    expect(minCopiesFor(40, 5, 0.7)).toBe(9)
    expect(atLeastProbability(40, 7, 5, 1) * 100).toBeCloseTo(63.93, 2)
    // Al 100 % sólo cuando no queda forma de no robarla; más que eso, imposible.
    expect(minCopiesFor(40, 5, 1)).toBe(36)
    expect(minCopiesFor(40, 5, 1.01)).toBeNull()
    expect(minCopiesFor(40, 5, 0)).toBe(0)
  })

  it('más copias nunca bajan la chance y el resultado siempre está entre 0 y 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 60 }), fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 3 }), (deck, copies, hand, atLeast) => {
        const value = atLeastProbability(deck, copies, hand, atLeast)

        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
        expect(atLeastProbability(deck, copies + 1, hand, atLeast)).toBeGreaterThanOrEqual(value - 1e-12)
      }),
    )
  })
})
