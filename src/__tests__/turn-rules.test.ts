import { describe, expect, it } from 'vitest'

import { createMatState, type MatAction, type MatState } from '../app/practice-mat'
import { repeatedTurnRule } from '../app/turn-rules'

const DECK = ['a1', 'a2', 'a3', 'p1', 'p2', 'p3', 'x1', 'b1', 'b2', 'b3', 'b4', 'b5']
const start = (): MatState => createMatState(DECK, [], 8)

const normal = (id: string, index = 0): MatAction => ({ type: 'place', id, zone: 'mz', index, pos: 'atk', how: 'normal' })
const setMonster = (id: string, index = 0): MatAction => ({ type: 'place', id, zone: 'mz', index, pos: 'set', how: 'normal' })
const special = (id: string, index = 1): MatAction => ({ type: 'place', id, zone: 'mz', index, pos: 'atk', how: 'special' })
const pendulum = (id: string, index = 2): MatAction => ({ type: 'place', id, zone: 'mz', index, pos: 'atk', how: 'pendulum' })
const activate = (id: string): MatAction => ({ type: 'activate', id })
const nextTurn: MatAction[] = [
  { type: 'phase', phase: 'standby' },
  { type: 'phase', phase: 'main1' },
  { type: 'phase', phase: 'battle' },
  { type: 'phase', phase: 'main2' },
  { type: 'phase', phase: 'end' },
  { type: 'phase', phase: 'draw' },
]

describe('repeatedTurnRule: una Invocación Normal por turno', () => {
  it('la segunda Invocación Normal (o Colocar un monstruo) del mismo turno la repite; la primera, no', () => {
    expect(repeatedTurnRule(start(), [], normal('a1'))).toBeNull()
    expect(repeatedTurnRule(start(), [normal('a1')], normal('a2', 1))).toBe('normalSummon')
    expect(repeatedTurnRule(start(), [setMonster('a1')], normal('a2', 1))).toBe('normalSummon')
    expect(repeatedTurnRule(start(), [normal('a1')], setMonster('a2', 1))).toBe('normalSummon')
  })

  it('invocar por Sacrificio también es la Invocación Normal del turno', () => {
    const tribute: MatAction = { type: 'tribute', id: 'a2', tributes: ['a1'], zone: 'mz', index: 0, pos: 'atk' }

    expect(repeatedTurnRule(start(), [normal('a1')], tribute)).toBe('normalSummon')
    expect(repeatedTurnRule(start(), [tribute], normal('a3', 1))).toBe('normalSummon')
  })

  it('las Invocaciones Especiales, activar y lo demás no cuentan; en otro turno, tampoco', () => {
    expect(repeatedTurnRule(start(), [special('a1'), special('a2', 2)], normal('a3', 3))).toBeNull()
    expect(repeatedTurnRule(start(), [normal('a1'), activate('a1')], activate('a1'))).toBeNull()
    expect(repeatedTurnRule(start(), [normal('a1'), ...nextTurn], normal('a2', 1))).toBeNull()
    // En el mismo turno que la última Invocación Normal (después de pasar de fase sin cambiar de turno), sigue repitiendo.
    expect(repeatedTurnRule(start(), [normal('a1'), { type: 'phase', phase: 'main2' }], normal('a2', 1))).toBe('normalSummon')
  })

  it('una Invocación Normal deshecha ya no cuenta (la lista de jugadas no la tiene)', () => {
    expect(repeatedTurnRule(start(), [], normal('a2', 1))).toBeNull()
  })
})

describe('repeatedTurnRule: una Invocación de Péndulo por turno', () => {
  it('varios monstruos seguidos (del Extra Deck boca arriba y de la mano) son una sola Invocación de Péndulo: no se repite', () => {
    expect(repeatedTurnRule(start(), [pendulum('p1', 0)], pendulum('p2', 1))).toBeNull()
    expect(repeatedTurnRule(start(), [pendulum('p1', 0), special('a1', 1)], pendulum('p2', 2))).toBeNull()
    expect(repeatedTurnRule(start(), [pendulum('p1', 0), special('a1', 1), pendulum('p2', 2)], pendulum('p3', 3))).toBeNull()
  })

  it('con algo que no es invocar en el medio (activar, atacar, cambiar de fase) es otra Invocación de Péndulo: se repite', () => {
    expect(repeatedTurnRule(start(), [pendulum('p1', 0), activate('p1')], pendulum('p2', 1))).toBe('pendulumSummon')
    expect(repeatedTurnRule(start(), [pendulum('p1', 0), { type: 'phase', phase: 'battle' }], pendulum('p2', 1))).toBe('pendulumSummon')
    expect(repeatedTurnRule(start(), [pendulum('p1', 0), { type: 'move', id: 'a1', to: 'gy' }], pendulum('p2', 1))).toBe('pendulumSummon')
  })

  it('la primera Invocación de Péndulo del turno, o la de otro turno, no repite nada', () => {
    expect(repeatedTurnRule(start(), [], pendulum('p1', 0))).toBeNull()
    expect(repeatedTurnRule(start(), [activate('a1')], pendulum('p1', 0))).toBeNull()
    expect(repeatedTurnRule(start(), [pendulum('p1', 0), activate('p1'), ...nextTurn], pendulum('p2', 1))).toBeNull()
  })

  it('una Invocación Normal no es una de Péndulo, ni al revés', () => {
    expect(repeatedTurnRule(start(), [pendulum('p1', 0), activate('p1')], normal('a1', 1))).toBeNull()
    expect(repeatedTurnRule(start(), [normal('a1'), activate('a1')], pendulum('p1', 1))).toBeNull()
  })
})

describe('repeatedTurnRule: otras jugadas', () => {
  it('lo que no es una invocación no avisa nunca', () => {
    expect(repeatedTurnRule(start(), [normal('a1'), pendulum('p1', 1)], activate('a1'))).toBeNull()
    expect(repeatedTurnRule(start(), [normal('a1')], special('a2', 1))).toBeNull()
    expect(repeatedTurnRule(start(), [normal('a1')], { type: 'draw', count: 1 })).toBeNull()
  })
})
