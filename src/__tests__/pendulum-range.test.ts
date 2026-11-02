import { describe, expect, it } from 'vitest'

import { describeRange, matPendulumRange, pendulumCandidates, pendulumLevel, pendulumRange, rangeFit } from '../app/pendulum-range'
import { createMatState, replayMat, TOKEN_KIND, type MatCardKind } from '../app/practice-mat'

const MONSTER: MatCardKind = { monster: true, spell: false, trap: false, extra: false, effect: true, fieldSpell: false, pendulum: false, fusion: false, synchro: false, xyz: false, link: false, level: 4 }
const PENDULUM: MatCardKind = { ...MONSTER, pendulum: true }
const SPELL: MatCardKind = { ...MONSTER, monster: false, spell: true, level: null }
const KINDS: Record<string, MatCardKind> = { p1: PENDULUM, p2: PENDULUM, p3: PENDULUM, a1: MONSTER, s1: SPELL, x1: { ...PENDULUM, extra: true, xyz: true }, f1: { ...PENDULUM, extra: true, fusion: true } }
const kindOf = (id: string) => KINDS[id] ?? TOKEN_KIND

describe('el rango de la Invocación de Péndulo', () => {
  it('va de la escala menor + 1 a la mayor − 1, en cualquier orden; la escala 0 vale', () => {
    expect(pendulumRange([1, 8])).toEqual({ low: 2, high: 7 })
    expect(pendulumRange([8, 1])).toEqual({ low: 2, high: 7 })
    expect(pendulumRange([0, 4])).toEqual({ low: 1, high: 3 })
    expect(describeRange(pendulumRange([0, 4]))).toBe('Niveles 1 a 3')
    expect(describeRange(pendulumRange([2, 4]))).toBe('Nivel 3')
  })

  it('sin dato de una escala (un deck guardado sin `scale`) o con una sola escala no hay rango: nunca un número inventado', () => {
    expect(pendulumRange([3, null])).toBeNull()
    expect(pendulumRange([undefined, 5])).toBeNull()
    expect(pendulumRange([4])).toBeNull()
    expect(pendulumRange([])).toBeNull()
    expect(describeRange(null)).toBe('Sin rango (una escala sin dato)')
    expect(rangeFit(null, 4)).toBe('unknown')
  })

  it('escalas iguales o contiguas dejan el rango vacío: todo nivel queda afuera', () => {
    const contiguous = pendulumRange([4, 5])

    expect(describeRange(contiguous)).toBe('Ningún nivel (escalas 4 y 5)')
    expect(describeRange(pendulumRange([3, 3]))).toBe('Ningún nivel (escalas 3 y 3)')
    expect(rangeFit(contiguous, 4)).toBe('out')
    expect(rangeFit(contiguous, 5)).toBe('out')
  })

  it('un nivel adentro, afuera (los bordes son las escalas) o sin dato', () => {
    const range = pendulumRange([1, 8])

    expect(rangeFit(range, 2)).toBe('in')
    expect(rangeFit(range, 7)).toBe('in')
    expect(rangeFit(range, 1)).toBe('out')
    expect(rangeFit(range, 8)).toBe('out')
    expect(rangeFit(range, null)).toBe('unknown')
    // Un Xyz (Rango) y una Mágica no tienen nivel que mirar.
    expect(pendulumLevel(KINDS.x1!)).toBeNull()
    expect(pendulumLevel(SPELL)).toBeNull()
    expect(pendulumLevel(PENDULUM)).toBe(4)
  })

  it('la mesa: el rango sale de las dos escalas activas y de la escala de cada carta', () => {
    const state = replayMat(createMatState(['p1', 'p2', 'p3', 'a1', 's1'], [], 5), [
      { type: 'place', id: 'p1', zone: 'st', index: 0, pos: 'atk', how: 'scale' },
      { type: 'place', id: 'p2', zone: 'st', index: 4, pos: 'atk', how: 'scale' },
    ])

    expect(matPendulumRange(state, kindOf, (id) => ({ p1: 0, p2: 5 })[id])).toEqual({ low: 1, high: 4 })
    expect(matPendulumRange(state, kindOf, (id) => (id === 'p1' ? 2 : null))).toBeNull()
  })

  it('se eligen los monstruos de la mano (no los del Extra Deck ni las Mágicas) y los boca arriba del Extra', () => {
    // La mano: p1, a1, s1 y f1 (un Fusión de Péndulo que volvió a la mano). p3 va del deck al Extra boca arriba; x1, boca abajo, no cuenta.
    const state = replayMat(createMatState(['p1', 'a1', 's1', 'f1', 'p2', 'p3'], ['x1'], 4), [{ type: 'move', id: 'p3', to: 'extra', faceUp: true }])

    expect(pendulumCandidates(state, kindOf)).toEqual([
      { id: 'p1', from: 'hand' },
      { id: 'a1', from: 'hand' },
      { id: 'p3', from: 'extra' },
    ])
  })
})
