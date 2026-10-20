import { describe, expect, it } from 'vitest'

import { COMPACT_FIELD_MEDIA_QUERY, compactDuelFieldStyle } from '../components/probability/compact-field'
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
