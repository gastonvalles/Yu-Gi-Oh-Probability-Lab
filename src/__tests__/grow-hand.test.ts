import { describe, expect, it } from 'vitest'

import { CARD_ASPECT } from '../app/deck-image-layout'
import { growHand, handFloor, handInset } from '../app/practice-hand-layout'

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

describe('handInset', () => {
  it('tu mano queda entre tus dos pilas de abajo como se ven (en 3D se abren más que su caja), con aire', () => {
    // 1101 × 800 en 3D sin Pasos: la caja de la mano de 300 a 910, el Extra a 227–305 y el Deck a 861–942.
    expect(handInset({ left: 300, right: 910 }, [{ left: 861, right: 942 }, { left: 227, right: 305 }], 8)).toBe(57)
    // Pilas adentro de la caja de un solo lado: manda el lado que más entra (la mano sigue centrada).
    expect(handInset({ left: 300, right: 910 }, [{ left: 200, right: 290 }, { left: 880, right: 960 }], 8)).toBe(38)
  })

  it('sin las dos pilas, no se aparta', () => {
    expect(handInset({ left: 0, right: 600 }, [undefined, { left: 500, right: 580 }], 8)).toBe(0)
    expect(handInset({ left: 0, right: 600 }, [], 8)).toBe(0)
  })

  it('crece sólo hasta arriba de tu chapa o de un botón que le quede debajo, no de lo que está a los costados', () => {
    const span = { left: 485, right: 1021 }

    // 1440 × 900 con Pasos: tu chapa (412–517) asoma debajo del costado de la mano; los botones (998–1094) también.
    expect(handFloor(900, span, [{ left: 412, right: 517, top: 830 }, { left: 998, right: 1042, top: 848 }], 8)).toBe(822)
    expect(handFloor(900, span, [{ left: 300, right: 480, top: 830 }], 8)).toBe(900)
  })
})
