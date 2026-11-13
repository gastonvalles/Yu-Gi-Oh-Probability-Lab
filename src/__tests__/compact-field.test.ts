import { describe, expect, it } from 'vitest'

import { COMPACT_FIELD_MEDIA_QUERY, matDuelLayout, phoneDuelLayout } from '../components/probability/compact-field'

/** Lo que la mesa le pasa (`PracticeMat`): la barra (la fila de los íconos con las vidas del rival) y el hueco de la columna, y abajo tu fila con el margen. */
const APP = { bar: 58, bottom: 68 }
const SIZES = [[360, 740], [390, 844], [412, 915], [430, 932], [360, 640]] as const

describe('el duelo en el celular: geometría fija (`phoneDuelLayout`)', () => {
  it('rige con menos de 640 px de ancho, el corte `sm` de Tailwind', () => {
    expect(COMPACT_FIELD_MEDIA_QUERY).toBe('(max-width: 639.98px)')
  })

  it('la casilla sale del ancho, con las siete columnas: 57 px a 390 y 52 a 360 (orillas de 4 px y huecos de 3)', () => {
    expect(phoneDuelLayout(390, 844, { tilted: false, ...APP }).cell).toBeCloseTo(57.13, 2)
    expect(phoneDuelLayout(360, 740, { tilted: false, ...APP }).cell).toBeGreaterThanOrEqual(52)
    // Cinco casillas, los costados (0,6857 cada uno) y seis huecos: el campo entra justo entre las orillas, sin scroll horizontal.
    for (const width of [360, 390, 430]) expect(phoneDuelLayout(width, 844, { tilted: false, ...APP }).fieldWidth).toBeCloseTo(width - 8, 1)
  })

  it('a 390 × 844 las casillas tienen forma de carta (cartas de 54 × 79), tu mano se lleva lo que queda y la del rival es la tuya a 0,8', () => {
    const layout = phoneDuelLayout(390, 844, { tilted: false, ...APP })

    expect(layout.row / layout.cell).toBeGreaterThanOrEqual(1.4)
    expect(layout.card).toBeCloseTo(54, 0)
    expect(layout.cardHeight).toBeCloseTo(79, 0)
    expect(layout.handCard).toBeCloseTo(90, 0)
    expect(layout.rivalCard).toBeCloseTo(layout.handCard * 0.8, 5)
    expect(layout.rivalWidth).toBeCloseTo((390 - 8) * 0.8, 5)
    // Sin línea: del borde de abajo del campo a tu mano, 8 px (el kit pide 40 o menos).
    expect(layout.handTop - layout.lineTop).toBe(8)
  })

  it('una carta en defensa pisa a lo sumo 11 px de cada lado de su casilla (no se achica para entrar)', () => {
    for (const [width, height] of SIZES) {
      const layout = phoneDuelLayout(width, height, { tilted: false, ...APP })

      expect((layout.cardHeight - layout.cell) / 2).toBeLessThanOrEqual(11.01)
      expect(layout.card).toBeLessThanOrEqual(layout.cell - 3 + 1e-9)
    }
  })

  it('en una pantalla baja (360 × 640) tu mano queda en su mínimo y las filas bajan, nunca por debajo de cuadradas', () => {
    const layout = phoneDuelLayout(360, 640, { tilted: false, ...APP })

    expect(layout.handCard).toBe(64)
    expect(layout.row).toBeGreaterThanOrEqual(layout.cell)
    expect(layout.row).toBeLessThan(layout.cell * 1.4612)
    expect(layout.rivalTop).toBeGreaterThan(APP.bar - 1e-6)
  })

  it('en 3D la caja crece hacia arriba lo que la perspectiva baja su borde: lo que se ve queda donde de arriba, y tu mano no se mueve', () => {
    for (const [width, height] of SIZES) {
      const flat = phoneDuelLayout(width, height, { tilted: false, ...APP })
      const tilted = phoneDuelLayout(width, height, { tilted: true, ...APP })

      expect(tilted.drop).toBeGreaterThan(0)
      expect(tilted.fieldHeight).toBeCloseTo(flat.fieldHeight + tilted.drop, 5)
      expect(tilted.fieldTop).toBeCloseTo(flat.fieldTop, 5)
      expect(tilted.fieldBoxTop).toBeCloseTo(flat.fieldTop - tilted.drop, 5)
      expect(tilted.handTop).toBe(flat.handTop)
      expect(tilted.rivalTop).toBeCloseTo(flat.rivalTop, 5)
    }
  })

  it('las piezas van una debajo de la otra sin pisarse, desde la barra hasta el margen de abajo, en todos los tamaños y las dos vistas', () => {
    for (const [width, height] of SIZES) {
      for (const tilted of [false, true]) {
        const layout = phoneDuelLayout(width, height, { tilted, ...APP })

        expect(layout.rivalTop).toBeGreaterThan(APP.bar - 1e-6)
        expect(layout.rivalTop + layout.rivalRoom + layout.rivalGap).toBeCloseTo(layout.fieldTop, 5)
        expect(layout.fieldBoxTop + layout.fieldHeight).toBeCloseTo(layout.lineTop, 5)
        expect(layout.lineTop + layout.gap).toBeCloseTo(layout.handTop, 5)
        expect(layout.bottomTop).toBeCloseTo(height - APP.bottom, 5)
      }
    }
  })
})


describe('la mesa móvil hasta 1100 px, celular y tableta (`matDuelLayout`)', () => {
  it('en el celular es el de siempre, a todo el ancho', () => {
    for (const [width, height] of SIZES) for (const tilted of [false, true]) expect(matDuelLayout(width, height, { tilted, ...APP })).toEqual({ ...phoneDuelLayout(width, height, { tilted, ...APP }), width })
  })

  it('desde 640 px el campo se angosta hasta que sus filas tienen el alto de una carta y entra entero en el alto, con la mano debajo', () => {
    for (const [width, height] of [[768, 1024], [820, 1180], [1024, 768], [1100, 760], [640, 900]] as const) {
      for (const tilted of [false, true]) {
        const layout = matDuelLayout(width, height, { tilted, ...APP })

        expect(layout.width).toBeLessThanOrEqual(width)
        expect(layout.fieldWidth).toBeLessThanOrEqual(layout.width)
        // La casilla tiene forma de carta (la fila, de una carta: más no entra) y el campo no pasa de la altura de la pantalla.
        expect(layout.row).toBeGreaterThanOrEqual(layout.cell * 1.4612 * 0.99)
        expect(layout.bottomTop).toBeCloseTo(height - APP.bottom, 5)
        expect(layout.rivalTop).toBeGreaterThanOrEqual(APP.bar - 1)
      }
    }
  })

  it('en vertical y en 3D, a 768 × 1024, el campo usa casi todo el ancho; en apaisada se angosta, no se sale del alto', () => {
    expect(matDuelLayout(768, 1024, { tilted: true, ...APP }).fieldWidth).toBeGreaterThan(650)
    expect(matDuelLayout(1024, 768, { tilted: true, ...APP }).fieldWidth).toBeLessThan(500)
  })
})
