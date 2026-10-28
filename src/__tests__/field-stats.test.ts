import { describe, expect, it } from 'vitest'
import { fieldStatsOf, nowStat, printedStat } from '../app/field-stats'
import { createMatState, replayMat } from '../app/practice-mat'
import type { ApiCardReference } from '../types'

const api = (atk: string | null, def: string | null, linkValue: number | null = null) => ({ atk, def, linkValue }) as ApiCardReference

describe('field-stats · la etiqueta de ATK/DEF del campo', () => {
  it('los impresos: un Link sin DEF, «?» lo que no es un número o falta en un monstruo, y nada sin ATK ni DEF (una Mágica, una carta que no cargó)', () => {
    expect(printedStat(api('2500', '2000'))).toEqual({ attack: 2500, defense: 2000 })
    expect(printedStat(api('2300', null, 4))).toEqual({ attack: 2300, defense: null })
    expect(printedStat(api('?', null, 4))).toEqual({ attack: '?', defense: null })
    expect(printedStat(api('?', '0'))).toEqual({ attack: '?', defense: 0 })
    expect(printedStat(api(null, '1800'))).toEqual({ attack: '?', defense: 1800 })
    expect(printedStat(api('-1', '-1'))).toEqual({ attack: '?', defense: '?' })
    expect(printedStat(api(null, null))).toBeNull()
    expect(printedStat(null)).toBeNull()
  })

  it('los de ahora: nivel 0 y DEF 0 es un Link (sin DEF)', () => {
    expect(nowStat({ attack: 1900, defense: 1000, level: 4 })).toEqual({ attack: 1900, defense: 1000 })
    expect(nowStat({ attack: 2300, defense: 0, level: 0 })).toEqual({ attack: 2300, defense: null })
    expect(nowStat({ attack: -2, defense: -2, level: 4 })).toEqual({ attack: '?', defense: '?' })
    expect(nowStat(undefined)).toBeNull()
  })

  it('sólo los monstruos boca arriba de la fila de monstruos y de las Zonas Extra, y el mismo mapa si los números no cambian', () => {
    const mat = replayMat(createMatState(['a', 'b', 'c', 'd'], ['x'], 4), [
      { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: 'b', zone: 'mz', index: 1, pos: 'def' },
      { type: 'place', id: 'c', zone: 'mz', index: 2, pos: 'set' },
      { type: 'place', id: 'd', zone: 'st', index: 0, pos: 'atk' },
      { type: 'place', id: 'x', zone: 'emz', index: 1, pos: 'atk' },
    ])
    const stat = (attack: number) => () => ({ attack, defense: 100 })
    const first = fieldStatsOf(mat, stat(1000))

    expect([...first.keys()]).toEqual(['a', 'b', 'x'])
    expect(fieldStatsOf(mat, stat(1000), first)).toBe(first)
    expect(fieldStatsOf(mat, stat(1200), first)).not.toBe(first)
    expect(fieldStatsOf(mat, (id) => (id === 'a' ? { attack: 1000, defense: 100 } : null), first).size).toBe(1)
  })
})
