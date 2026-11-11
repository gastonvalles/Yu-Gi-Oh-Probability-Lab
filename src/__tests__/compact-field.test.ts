import { describe, expect, it } from 'vitest'

import { COMPACT_FIELD_MEDIA_QUERY, mediumDuelFieldStyle, phoneDuelLayout } from '../components/probability/compact-field'
import { THEIR_HAND } from '../components/duel/their-hand'

/** Lo que la mesa le pasa hoy (`PracticeMat`): la barra con el marcador y el hueco de la columna, el lugar de la mano del rival (su caja y 14 px) y el margen de abajo. */
const APP = { bar: 110, rival: THEIR_HAND.mobile.room + 14, bottom: 8 }
const round = (layout: ReturnType<typeof phoneDuelLayout>) => Object.fromEntries(Object.entries(layout).map(([key, value]) => [key, Math.round(value * 10) / 10]))

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

  it('a 390 × 844, de arriba: el campo en y = 226, la línea de 96 px pegada a él, el aire que sobra antes de tu mano y tu mano hasta el margen de abajo', () => {
    expect(round(phoneDuelLayout(390, 844, { tilted: false, ...APP }))).toMatchObject({ fieldTop: 226, fieldBoxTop: 226, fieldHeight: 297.7, lineTop: 523.7, lineHeight: 96, air: 11.9, handTop: 631.6, handHeight: 204.4, handCard: 119.4, bottomTop: 836 })
  })

  it('en 3D la perspectiva baja el borde de arriba del campo (23 px a 390): se le quita al lugar de la mano del rival, el campo se ve donde de arriba y la línea gana ese aire; tu mano no se mueve', () => {
    const flat = phoneDuelLayout(390, 844, { tilted: false, ...APP })
    const tilted = phoneDuelLayout(390, 844, { tilted: true, ...APP })

    expect(tilted.drop).toBeCloseTo(22.7, 1)
    expect(tilted.fieldTop).toBe(flat.fieldTop)
    expect(tilted.fieldBoxTop).toBeCloseTo(flat.fieldTop - tilted.drop, 5)
    expect(tilted.handTop).toBe(flat.handTop)
    expect(tilted.air).toBeCloseTo(flat.air + tilted.drop, 5)
  })

  it('en una pantalla chica la línea no baja de 56 px: tu mano se achica (360 × 740 de arriba) y a 430 × 932 lo que sobra queda entre la línea y tu mano', () => {
    expect(round(phoneDuelLayout(360, 740, { tilted: false, ...APP }))).toMatchObject({ lineHeight: 56, air: 0, handCard: 99.8, handTop: 556.1 })
    expect(round(phoneDuelLayout(360, 740, { tilted: true, ...APP }))).toMatchObject({ handCard: 110, air: 0 })
    expect(round(phoneDuelLayout(430, 932, { tilted: false, ...APP }))).toMatchObject({ lineHeight: 96, handCard: 131.9 })
    expect(phoneDuelLayout(430, 932, { tilted: false, ...APP }).air).toBeGreaterThan(50)
  })

  it('las piezas van una debajo de la otra sin pisarse y la última termina en el margen de abajo, en todos los tamaños y las dos vistas', () => {
    for (const [width, height] of [[360, 740], [390, 844], [412, 915], [430, 932]] as const) {
      for (const tilted of [false, true]) {
        const layout = phoneDuelLayout(width, height, { tilted, ...APP })

        expect(layout.fieldBoxTop + layout.fieldHeight).toBeCloseTo(layout.lineTop, 5)
        expect(layout.lineTop + layout.lineHeight + layout.air).toBeCloseTo(layout.handTop, 5)
        expect(layout.air).toBeGreaterThanOrEqual(0)
        expect(layout.bottomTop).toBeCloseTo(height - APP.bottom, 5)
      }
    }
  })
})

/** De 640 a 1100 px lo que no es campo suma 421 px (las barras, tu mano y sus márgenes; ver `mediumDuelFieldStyle`); el campo son cinco filas de casillas y cuatro huecos de 4 px. */
const MEDIUM_CHROME = 421

/** Lo que mide la columna con la casilla que da la fórmula para ese alto (y el lugar de la mano del rival que queda). */
function mediumColumn(tilted: boolean, height: number) {
  const style = mediumDuelFieldStyle(tilted) as Record<string, string | number>
  const [, chrome, divisor] = (/100dvh - ([\d.]+)rem\) \/ (\d+)\)/.exec(style['--cell-m'] as string) ?? []).map(Number) as [number, number, number]
  const cell = Math.max(56, (height - chrome * 16) / divisor)
  const shift = /calc\(([\d.]+)rem - 2 \* var/.exec(String(style.marginTop))
  const top = shift ? Number(shift[1]) * 16 - 2 * cell : (style.marginTop as number)

  return { cell, total: MEDIUM_CHROME + top + 5 * cell + 16 }
}

describe('el campo del duelo de 640 a 1100 px (tablet, ventana angosta)', () => {
  it('la casilla sale del ancho y del alto (nunca menos de 56 px) y el campo se centra', () => {
    const tilted = mediumDuelFieldStyle(true) as Record<string, string | number>
    const flat = mediumDuelFieldStyle(false) as Record<string, string | number>

    expect(tilted['--cell-m']).toBe('min(calc((100% - 1.5rem) / 6.3714), max(3.5rem, calc((100dvh - 37rem) / 3)))')
    expect(tilted.width).toBe('calc(var(--cell-m) * 6.3714 + 1.5rem)')
    expect(tilted.marginInline).toBe('auto')
    expect(tilted.marginTop).toBe('calc(9.5rem - 2 * var(--cell-m))')
    expect(flat['--cell-m']).toBe('min(calc((100% - 1.5rem) / 6.3714), max(3.5rem, calc((100dvh - 34rem) / 5)))')
    expect(flat.marginTop).toBe(THEIR_HAND.mobile.room)
  })

  it('el campo y tu mano entran en la pantalla: en 3D a 1100 × 760 (antes el campo terminaba en y = 1097) y de arriba a 900 de alto', () => {
    expect(mediumColumn(true, 760)).toEqual({ cell: 56, total: 757 })
    expect(mediumColumn(false, 900).total).toBeLessThanOrEqual(900)
  })

  it('sin la fila de abajo («Jugar solo automático» con el marcador arriba) lo que no es campo baja de 37 a 30,5 rem en 3D y de 34 a 27,5 de arriba: la casilla crece con el alto que se libera', () => {
    const tilted = mediumDuelFieldStyle(true, false) as Record<string, string | number>
    const flat = mediumDuelFieldStyle(false, false) as Record<string, string | number>

    expect(tilted['--cell-m']).toBe('min(calc((100% - 1.5rem) / 6.3714), max(3.5rem, calc((100dvh - 30.5rem) / 3)))')
    // De arriba la casilla baja hasta 52 px: a 900 × 700 la columna no scrollea.
    expect(flat['--cell-m']).toBe('min(calc((100% - 1.5rem) / 6.3714), max(3.25rem, calc((100dvh - 27.5rem) / 5)))')
    expect(tilted).toMatchObject({ width: 'calc(var(--cell-m) * 6.3714 + 1.5rem)', marginTop: 'calc(9.5rem - 2 * var(--cell-m))' })
  })

  it('con el marcador de 44 px (el duelo por enlace) suma 4 px: 30,75 rem en 3D (a 1100 × 760 la columna scrolleaba 1 px); con la fila de abajo, nada', () => {
    expect((mediumDuelFieldStyle(true, false, true) as Record<string, string>)['--cell-m']).toContain('calc((100dvh - 30.75rem) / 3)')
    expect((mediumDuelFieldStyle(false, false, true) as Record<string, string>)['--cell-m']).toContain('calc((100dvh - 27.75rem) / 5)')
    expect(mediumDuelFieldStyle(true, true, true)).toEqual(mediumDuelFieldStyle(true))
  })
})
