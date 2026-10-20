import { describe, expect, it } from 'vitest'

import { EFFECT_FACT } from '../app/card-effect-facts'
import { LIMIT_FACTS, limitKey, usageReminder, type Activation } from '../app/mat-assistant'
import type { MatAction } from '../app/practice-mat'

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
