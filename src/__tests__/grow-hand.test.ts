import { describe, expect, it } from 'vitest'

import { CARD_ASPECT } from '../app/deck-image-layout'
import { growHand } from '../app/practice-hand-layout'

// La mano del duelo automático de escritorio crece con el alto libre debajo de ella (medido a 1920 × 900: 31 px), hasta una casilla y lo que da el ancho; lo que suma es su margen negativo.
describe('growHand', () => {
  it('crece con el alto que sobra debajo y suma justo ese alto', () => {
    const grown = growHand({ base: 80, below: 31, cell: 106, width: 714, slots: 5 })

    expect(grown.cardWidth).toBe(Math.floor(80 + 31 / CARD_ASPECT))
    expect(grown.extra).toBeLessThanOrEqual(31)
  })

  it('sin alto libre (o con menos de nada) queda como siempre', () => {
    expect(growHand({ base: 80, below: 0, cell: 100, width: 682, slots: 5 })).toEqual({ cardWidth: 80, extra: 0 })
    expect(growHand({ base: 80, below: -12, cell: 100, width: 682, slots: 5 })).toEqual({ cardWidth: 80, extra: 0 })
  })

  it('nunca más que una casilla ni que lo que da el ancho de la mano', () => {
    expect(growHand({ base: 80, below: 400, cell: 96, width: 2000, slots: 5 }).cardWidth).toBe(96)
    expect(growHand({ base: 80, below: 400, cell: 200, width: 240, slots: 5 }).cardWidth).toBe(75)
  })

  it('sin medir todavía (ancho o casilla en 0), la de siempre', () => {
    expect(growHand({ base: 80, below: 50, cell: 0, width: 700, slots: 5 })).toEqual({ cardWidth: 80, extra: 0 })
    expect(growHand({ base: 80, below: 50, cell: 100, width: 0, slots: 5 })).toEqual({ cardWidth: 80, extra: 0 })
  })
})
