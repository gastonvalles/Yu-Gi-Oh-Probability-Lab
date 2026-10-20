import { describe, expect, it } from 'vitest'

import { EFFECT_FACT } from '../app/card-effect-facts'
import { LIMIT_FACTS, limitKey, spellTrapActivation, usageReminder, type Activation } from '../app/mat-assistant'
import { cardKindOf, createMatState, matReducer, type MatAction } from '../app/practice-mat'
import type { ApiCardReference } from '../types'

const activate = (id: string): MatAction => ({ type: 'activate', id })
const used = (id: string, turn: number, key: string): Activation => ({ action: activate(id), turn, key })

describe('limitKey: con qué clave se cuenta el uso de una carta', () => {
  it('por nombre (una segunda copia comparte el límite) si el límite es por nombre o por duelo; si no, por carta', () => {
    expect(limitKey(EFFECT_FACT.hardOnce | EFFECT_FACT.once, 14558127, 'card-14558127-1')).toBe('n:14558127')
    expect(limitKey(EFFECT_FACT.perDuel, 14558127, 'card-14558127-2')).toBe('n:14558127')
    expect(limitKey(EFFECT_FACT.once, 14558127, 'card-14558127-1')).toBe('i:card-14558127-1')
  })

  it('los hechos con límite son los de una vez por turno, por nombre y por duelo; el efecto rápido, el costo y el objetivo no limitan', () => {
    expect(LIMIT_FACTS & (EFFECT_FACT.quick | EFFECT_FACT.cost | EFFECT_FACT.target)).toBe(0)
    expect(LIMIT_FACTS & EFFECT_FACT.once).not.toBe(0)
  })
})

describe('usageReminder: qué decir al activar de nuevo', () => {
  const key = 'n:14558127'
  const once = EFFECT_FACT.once | EFFECT_FACT.hardOnce

  it('en el mismo turno avisa (por nombre si otra copia comparte el límite); en otro turno, no; sin uso previo, tampoco', () => {
    expect(usageReminder(once, [used('a', 3, key)], key, 3)).toBe('turnByName')
    expect(usageReminder(EFFECT_FACT.once, [used('a', 3, 'i:a')], 'i:a', 3)).toBe('turn')
    expect(usageReminder(once, [used('a', 3, key)], key, 4)).toBeNull()
    expect(usageReminder(once, [], key, 3)).toBeNull()
  })

  it('sólo cuenta el uso de la misma clave: otra carta u otra copia (si el límite es por carta) no avisa', () => {
    expect(usageReminder(once, [used('b', 3, 'n:99')], key, 3)).toBeNull()
    expect(usageReminder(EFFECT_FACT.once, [used('a2', 3, 'i:a2')], 'i:a', 3)).toBeNull()
  })

  it('una vez por duelo avisa en cualquier turno posterior', () => {
    expect(usageReminder(EFFECT_FACT.perDuel, [used('a', 1, key)], key, 7)).toBe('duel')
    expect(usageReminder(EFFECT_FACT.perDuel, [], key, 7)).toBeNull()
  })

  it('una carta sin límite confirmado (sólo efecto rápido, costo u objetivo) no avisa nunca', () => {
    expect(usageReminder(EFFECT_FACT.quick | EFFECT_FACT.cost, [used('a', 3, key)], key, 3)).toBeNull()
    expect(usageReminder(0, [used('a', 3, key)], key, 3)).toBeNull()
  })
})

describe('spellTrapActivation: cuándo una jugada activa una Mágica o una Trampa', () => {
  // Los ids dicen la clase de la carta: `spell-1`, `trap-1`, `effect-1` (monstruo), `field-1` (Mágica de Campo) y `pendulum-1`.
  const apiCard = (id: string): ApiCardReference => ({ frameType: id.split('-')[0] === 'field' ? 'spell' : id.split('-')[0], race: id.startsWith('field') ? 'Field' : null, level: null }) as unknown as ApiCardReference
  const kindOf = (id: string) => cardKindOf(apiCard(id))
  const start = createMatState(['spell-1', 'trap-1', 'effect-1', 'field-1', 'pendulum-1'], [], 5)
  const place = (id: string, zone: 'st' | 'field' | 'mz', pos: 'atk' | 'set', how?: 'scale'): MatAction => ({ type: 'place', id, zone, index: 0, pos, how })

  it('una Mágica, una Trampa (de la mano) o una Mágica de Campo que sale boca arriba a su zona se activa', () => {
    expect(spellTrapActivation(start, place('spell-1', 'st', 'atk'), kindOf)).toBe('spell-1')
    expect(spellTrapActivation(start, place('trap-1', 'st', 'atk'), kindOf)).toBe('trap-1')
    expect(spellTrapActivation(start, place('field-1', 'field', 'atk'), kindOf)).toBe('field-1')
  })

  it('Colocar boca abajo, un monstruo en la zona de Mágicas y Trampas y la escala de Péndulo no son activaciones', () => {
    expect(spellTrapActivation(start, place('spell-1', 'st', 'set'), kindOf)).toBeNull()
    expect(spellTrapActivation(start, place('effect-1', 'st', 'atk'), kindOf)).toBeNull()
    expect(spellTrapActivation(start, place('pendulum-1', 'st', 'atk', 'scale'), kindOf)).toBeNull()
  })

  it('una carta que ya estaba en el campo y sólo cambia de zona no se activa de nuevo', () => {
    const onField = matReducer(start, place('spell-1', 'st', 'atk'))

    expect(spellTrapActivation(onField, { type: 'place', id: 'spell-1', zone: 'st', index: 2, pos: 'atk' }, kindOf)).toBeNull()
  })

  it('dar vuelta una Mágica o una Trampa Colocada la activa; dar vuelta un monstruo, o girar una carta boca arriba, no', () => {
    const set = matReducer(matReducer(matReducer(start, place('trap-1', 'st', 'set')), { type: 'place', id: 'effect-1', zone: 'mz', index: 0, pos: 'set' }), { type: 'place', id: 'spell-1', zone: 'st', index: 1, pos: 'atk' })

    expect(spellTrapActivation(set, { type: 'position', id: 'trap-1', pos: 'atk' }, kindOf)).toBe('trap-1')
    expect(spellTrapActivation(set, { type: 'position', id: 'effect-1', pos: 'atk' }, kindOf)).toBeNull()
    expect(spellTrapActivation(set, { type: 'position', id: 'spell-1', pos: 'set' }, kindOf)).toBeNull()
    expect(spellTrapActivation(set, { type: 'position', id: 'spell-1', pos: 'def' }, kindOf)).toBeNull()
  })

  it('las fichas, las cartas del rival y las demás jugadas no activan nada', () => {
    expect(spellTrapActivation(start, place('token-1', 'st', 'atk'), kindOf)).toBeNull()
    expect(spellTrapActivation(start, place('f.spell-9', 'st', 'atk'), kindOf)).toBeNull()
    expect(spellTrapActivation(start, { type: 'activate', id: 'spell-1' }, kindOf)).toBeNull()
    expect(spellTrapActivation(start, { type: 'move', id: 'spell-1', to: 'gy' }, kindOf)).toBeNull()
  })
})
