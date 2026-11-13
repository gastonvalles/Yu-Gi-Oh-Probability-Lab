import { describe, expect, it } from 'vitest'

import { BURST, CUT, SPARK, atlasOf, burstsOf, durationOf, restOf } from '../app/flipbooks'
import { createMatState, type MatState, type Placed } from '../app/practice-mat'

const placed = (id: string): Placed => ({ id, pos: 'atk', counters: 0, materials: [] })
const mat = (patch: Partial<MatState>): MatState => ({ ...createMatState([], [], 0), ...patch })

describe('los flipbooks de «Impacto Ligero»', () => {
  it('de 8 a 12 cuadros, a 30 por segundo (menos de medio segundo), con los colores de los efectos y en reposo en su cuadro vacío', () => {
    for (const book of [SPARK, CUT, BURST]) {
      expect(book.frames).toBeGreaterThanOrEqual(8)
      expect(book.frames).toBeLessThanOrEqual(12)
      expect(durationOf(book)).toBeLessThanOrEqual(400)
      const tones = new Set(Array.from({ length: book.frames }, (_, index) => book.draw(index).map((shape) => shape.className)).flat())
      for (const tone of tones) expect(tone).toMatch(/^(stroke|fill)-(white|fx-(destello|energia|impacto))( (stroke|fill)-(white|fx-(destello|energia|impacto)))?$/)
    }
    expect(restOf(SPARK)).toBe(`${(-100 * 10) / 11}% 0`)
    // Cada tira es una sola imagen (el atlas), con los colores escritos (una imagen no lee las clases) y armada una vez.
    const atlas = decodeURIComponent(atlasOf(BURST))
    expect(atlas).toMatch(/^data:image\/svg\+xml,<svg xmlns=/)
    expect(atlas).not.toContain('class=')
    expect(atlas).toContain('stroke="')
    expect(atlas.match(/<g /g)).toHaveLength(12)
    expect(atlasOf(BURST)).toBe(atlasOf(BURST))
  })

  it('el estallido: el monstruo que se va del campo al Cementerio, no los materiales de una invocación ni una Mágica que se resolvió; hasta tres', () => {
    const before = mat({ mz: [placed('a'), placed('b'), null, null, null], st: [placed('s'), null, null, null, null], extra: ['x'] })

    expect(burstsOf(before, mat({ mz: [null, placed('b'), null, null, null], st: before.st, gy: ['a'], extra: ['x'] }))).toEqual(['a'])
    // Una Mágica que se resuelve se va al Cementerio: no estalla.
    expect(burstsOf(before, mat({ mz: before.mz, gy: ['s'], extra: ['x'] }))).toEqual([])
    // Los materiales de una Invocación por Enlace (llega uno del Extra): no estallan.
    expect(burstsOf(before, mat({ mz: [null, null, null, null, null], emz: [placed('x'), null], st: before.st, gy: ['a', 'b'] }))).toEqual([])
    // Al destierro, tampoco.
    expect(burstsOf(before, mat({ mz: [null, placed('b'), null, null, null], st: before.st, banished: ['a'], extra: ['x'] }))).toEqual([])
    const crowd = mat({ mz: [placed('a'), placed('b'), placed('c'), placed('d'), null] })
    expect(burstsOf(crowd, mat({ gy: ['a', 'b', 'c', 'd'] }))).toHaveLength(3)
  })
})
