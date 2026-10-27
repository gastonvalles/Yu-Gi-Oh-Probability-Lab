import { describe, expect, it } from 'vitest'

import { COMPACT_FIELD_MEDIA_QUERY, SHORT_SCREEN_MEDIA_QUERY, compactDuelFieldStyle, mediumDuelFieldStyle } from '../components/probability/compact-field'
import { THEIR_HAND } from '../components/duel/their-hand'

/** Lo que se ve de la mano tuya arriba de la barra de abajo (la barra, 64 px, y la carta entera, 126) y la pantalla de prueba: un celular de 844 px de alto. */
const BELOW_HAND = 64 + 126
const SCREEN = 844

/** Lo que hay arriba del campo: la barra con la línea de jugadas flotando (100 px) y los 8 px que deja la columna; abajo, el campo son siete casillas y seis huecos de 4 px, y la mano se corre 6 px (su margen y su bajada). */
const handTop = (cell: number, rivalRoom: number) => 100 + 8 + rivalRoom + (7 * cell + 24) + 6

describe('el campo del duelo en un celular en vertical', () => {
  it('rige con menos de 640 px de ancho, el corte `sm` de Tailwind', () => {
    expect(COMPACT_FIELD_MEDIA_QUERY).toBe('(max-width: 639.98px)')
  })

  it('en 3D la casilla sale del alto de la pantalla (y nunca pasa del ancho ni baja de 48 px) y la mano del rival se acomoda con ella', () => {
    const style = compactDuelFieldStyle(true) as Record<string, string | number>

    expect(style['--cell-m']).toBe('min(calc((100vw - 1.75rem) / 5), max(3rem, calc((100dvh - 30.9rem) / 5.2)))')
    // Cinco casillas y los cuatro huecos del campo (1 rem), centrado y nunca más ancho que la pantalla.
    expect(style.width).toBe('calc(var(--cell-m) * 5 + 1rem)')
    expect(style.maxWidth).toBe('100%')
    expect(style.marginInline).toBe('auto')
    expect(style.marginTop).toBe('max(0px, calc(10.4rem - 1.8 * var(--cell-m)))')
  })

  it('la fórmula del 3D deja la mano tuya entera arriba de la barra: a 844 px de alto el campo mide 67 px de casilla y la mano empieza a 190 px del borde de abajo', () => {
    const style = compactDuelFieldStyle(true) as Record<string, string>
    const [, chrome, divisor] = (/100dvh - ([\d.]+)rem\) \/ ([\d.]+)\)/.exec(style['--cell-m']!) ?? []).map(Number) as [number, number, number]
    const [, room, shift] = (/calc\(([\d.]+)rem - ([\d.]+) \* var/.exec(style.marginTop!) ?? []).map(Number) as [number, number, number]
    const cell = (SCREEN - chrome * 16) / divisor

    expect(Math.round(cell)).toBe(67)
    expect(Math.round(handTop(cell, room * 16 - shift * cell))).toBe(SCREEN - BELOW_HAND)
  })

  it('de arriba (sin inclinación) la mano del rival conserva su lugar más lo que le tapa la línea de jugadas, y la casilla sale de otra cuenta', () => {
    const style = compactDuelFieldStyle(false) as Record<string, string | number>

    expect(style['--cell-m']).toBe('min(calc((100vw - 1.75rem) / 5), max(3rem, calc((100dvh - 28.1rem) / 7)))')
    expect(style.marginTop).toBe(THEIR_HAND.mobile.room + 20)

    const chrome = Number(/100dvh - ([\d.]+)rem/.exec(style['--cell-m'] as string)![1])
    const cell = (SCREEN - chrome * 16) / 7

    expect(Math.round(handTop(cell, style.marginTop as number))).toBe(SCREEN - BELOW_HAND)
  })
})

describe('el campo de «Jugar solo automático» en el celular, sin la fila de abajo (las vidas en el marcador de la barra)', () => {
  it('lo que no es campo baja a 29,2 rem (3D) y 27 (de arriba): la mano llega al borde de abajo de la columna, sin scroll (medido de 360 × 740 a 430 × 932)', () => {
    const tilted = compactDuelFieldStyle(true, { bottomRow: false }) as Record<string, string | number>
    const flat = compactDuelFieldStyle(false, { bottomRow: false }) as Record<string, string | number>

    expect(tilted['--cell-m']).toBe('min(calc((100vw - 1.75rem) / 5), max(3rem, calc((100dvh - 29.2rem) / 5.2)))')
    expect(tilted.marginTop).toBe('max(0px, calc(10.4rem - 1.8 * var(--cell-m)))')
    // La vista de arriba tiene siete filas: su casilla baja hasta 44 px.
    expect(flat['--cell-m']).toBe('min(calc((100vw - 1.75rem) / 5), max(2.75rem, calc((100dvh - 27rem) / 7)))')
    expect(flat.marginTop).toBe(THEIR_HAND.mobile.room + 20)
  })

  it('en una pantalla baja (menos de 700 px de alto) la casilla baja hasta 36 px (32 de arriba) y la mano del rival, al 72 %, deja 24 px que el campo sube', () => {
    const tilted = compactDuelFieldStyle(true, { bottomRow: false, short: true }) as Record<string, string | number>
    const flat = compactDuelFieldStyle(false, { bottomRow: false, short: true }) as Record<string, string | number>

    expect(SHORT_SCREEN_MEDIA_QUERY).toBe('(max-height: 699.98px)')
    expect(tilted['--cell-m']).toBe('min(calc((100vw - 1.75rem) / 5), max(2.25rem, calc((100dvh - 28rem) / 5.2)))')
    expect(tilted.marginTop).toBe('calc(max(0px, calc(10.4rem - 1.8 * var(--cell-m))) - 1.5rem)')
    expect(flat['--cell-m']).toBe('min(calc((100vw - 1.75rem) / 5), max(2rem, calc((100dvh - 25.8rem) / 7)))')
    expect(flat.marginTop).toBe(THEIR_HAND.mobile.room + 20 - 24)
  })

  it('con la fila de abajo (el duelo por enlace) nada cambia, tampoco en una pantalla baja', () => {
    expect(compactDuelFieldStyle(true, { short: true })).toEqual(compactDuelFieldStyle(true))
    expect(compactDuelFieldStyle(false, { bottomRow: true, short: true })).toEqual(compactDuelFieldStyle(false))
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
})
