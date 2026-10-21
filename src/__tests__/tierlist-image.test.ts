import { describe, expect, it } from 'vitest'

import { computeTierImageLayout } from '../app/tierlist-image'

describe('dónde va cada fila en la imagen de la tier list', () => {
  it('todas miden al menos una carta de alto aunque estén vacías, van una abajo de otra y no se pisan', () => {
    const layout = computeTierImageLayout([0, 0, 0])

    expect(layout.rows).toHaveLength(3)
    expect(layout.rows[0]?.height).toBe(layout.rows[1]?.height)

    for (let index = 1; index < layout.rows.length; index += 1) {
      const previous = layout.rows[index - 1]
      const current = layout.rows[index]

      expect((current?.top ?? 0) >= (previous?.top ?? 0) + (previous?.height ?? 0)).toBe(true)
    }

    const last = layout.rows.at(-1)

    expect(layout.height).toBeGreaterThan((last?.top ?? 0) + (last?.height ?? 0))
  })

  it('sin encabezado: la primera fila arranca en el margen de arriba (24 px, donde iba el título)', () => {
    expect(computeTierImageLayout([1]).rows[0]?.top).toBe(24)
  })

  it('una fila con más cartas de las que entran en un renglón crece un renglón por cada tanda', () => {
    const perRow = computeTierImageLayout([0]).rows[0]?.perRow ?? 0
    const one = computeTierImageLayout([perRow]).rows[0]?.height ?? 0
    const two = computeTierImageLayout([perRow + 1]).rows[0]?.height ?? 0
    const three = computeTierImageLayout([perRow * 2 + 1]).rows[0]?.height ?? 0

    expect(perRow).toBeGreaterThanOrEqual(8)
    expect(two).toBeGreaterThan(one)
    expect(three - two).toBe(two - one)
  })

  it('la imagen mide lo mismo de ancho sea cual sea la lista y crece a lo alto con las filas', () => {
    const few = computeTierImageLayout([1, 1])
    const many = computeTierImageLayout([1, 1, 1, 1, 1, 1, 1])

    expect(few.width).toBe(many.width)
    expect(many.height).toBeGreaterThan(few.height)
  })
})
