import { describe, expect, it } from 'vitest'
import { fieldStatsOf, nowStat, printedBadge, printedStat } from '../app/field-stats'
import { createMatState, replayMat } from '../app/practice-mat'
import type { ApiCardReference } from '../types'

const api = (atk: string | null, def: string | null, linkValue: number | null = null, frameType = 'effect', level: number | null = null) => ({ atk, def, linkValue, frameType, level }) as ApiCardReference

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

  it('la ficha impresa (la mesa manual): Nivel, Rango de un Xyz y LINK de un Link; los Pendulum, las fichas, lo que no se reconoce o le falta el número, sin ficha', () => {
    expect(printedStat(api('1900', '1000', null, 'effect', 4))).toEqual({ attack: 1900, defense: 1000, badge: { kind: 'level', value: 4 } })
    for (const frame of ['normal', 'ritual', 'fusion', 'Synchro']) expect(printedBadge(api('0', '0', null, frame, 8))).toEqual({ kind: 'level', value: 8 })
    expect(printedStat(api('2500', '2000', null, 'xyz', 4))).toEqual({ attack: 2500, defense: 2000, badge: { kind: 'rank', value: 4 } })
    expect(printedStat(api('2300', null, 2, 'link'))).toEqual({ attack: 2300, defense: null, badge: { kind: 'link', value: 2 } })
    for (const [frame, level] of [['effect_pendulum', 4], ['xyz_pendulum', 4], ['token', 1], ['effect', null], ['effect', 0], ['xyz', null], ['spell', null], ['', 4]] as const) {
      expect(printedBadge(api('0', '0', null, frame, level)), frame).toBeNull()
    }
    expect(printedBadge(api('2300', null, null, 'link'))).toBeNull()
    expect(printedBadge(api('2300', null, 2, 'effect', 4))).toBeNull()
    expect(printedStat(api('2500', '2000'))).not.toHaveProperty('badge')
  })

  it('la ficha de ahora (el duelo automático): el tipo sale de la carta; el Nivel, del núcleo; el Rango y el LINK, impresos si el núcleo dice nivel 0; sin carta o si no coinciden, sin ficha', () => {
    expect(nowStat({ attack: 1900, defense: 1000, level: 5 }, api('1900', '1000', null, 'effect', 4))).toEqual({ attack: 1900, defense: 1000, badge: { kind: 'level', value: 5 } })
    expect(nowStat({ attack: 1900, defense: 1000, level: 0 }, api('1900', '1000', null, 'effect', 4))).toEqual({ attack: 1900, defense: 1000 })
    expect(nowStat({ attack: 2500, defense: 0, level: 0 }, api('2500', '0', null, 'xyz', 4))).toEqual({ attack: 2500, defense: 0, badge: { kind: 'rank', value: 4 } })
    expect(nowStat({ attack: 2500, defense: 2000, level: 4 }, api('2500', '2000', null, 'xyz', 4))).toEqual({ attack: 2500, defense: 2000 })
    expect(nowStat({ attack: 2300, defense: 0, level: 0 }, api('2300', null, 2, 'link'))).toEqual({ attack: 2300, defense: null, badge: { kind: 'link', value: 2 } })
    expect(nowStat({ attack: 1800, defense: 1200, level: 4 }, api('1800', '1200', null, 'effect_pendulum', 4))).toEqual({ attack: 1800, defense: 1200 })
    expect(nowStat({ attack: 1800, defense: 1200, level: 4 }, null)).toEqual({ attack: 1800, defense: 1200 })
  })

  it('el mismo mapa si la ficha no cambia (por valor), uno nuevo si cambia', () => {
    const mat = replayMat(createMatState(['a'], [], 1), [{ type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk' }])
    const level = (value: number) => () => ({ attack: 1000, defense: 100, badge: { kind: 'level' as const, value } })
    const first = fieldStatsOf(mat, level(4))

    expect(fieldStatsOf(mat, level(4), first)).toBe(first)
    expect(fieldStatsOf(mat, level(5), first)).not.toBe(first)
    expect(fieldStatsOf(mat, () => ({ attack: 1000, defense: 100, badge: { kind: 'rank', value: 4 } }), first)).not.toBe(first)
    expect(fieldStatsOf(mat, () => ({ attack: 1000, defense: 100 }), first)).not.toBe(first)
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
