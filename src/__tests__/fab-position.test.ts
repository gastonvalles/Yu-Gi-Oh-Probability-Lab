import { describe, expect, it } from 'vitest'

import { clampFabPosition, defaultFabPosition, isFabDrag, snapFabToEdge } from '../app/fab-position'

const MOBILE = { width: 390, height: 844, size: 56, bottomInset: 70, leftInset: 0, margin: 12 }
/** Escritorio: el menú lateral (abierto) a la izquierda y el pie abajo. */
const DESKTOP = { width: 1600, height: 900, size: 56, bottomInset: 64, leftInset: 240, margin: 12 }

describe('botón flotante', () => {
  it('arranca abajo a la derecha, sobre la barra inferior', () => {
    expect(defaultFabPosition(MOBILE)).toEqual({ x: 390 - 56 - 12, y: 844 - 56 - 12 - 70 })
  })

  it('la mascota arranca abajo a la izquierda', () => {
    expect(defaultFabPosition(MOBILE, 'left')).toEqual({ x: 12, y: 844 - 56 - 12 - 70 })
  })

  it('nunca sale de la pantalla ni se mete en la barra', () => {
    expect(clampFabPosition({ x: -50, y: 2000 }, MOBILE)).toEqual({ x: 12, y: 844 - 56 - 12 - 70 })
  })

  it('al soltarlo se pega al borde más cercano', () => {
    expect(snapFabToEdge({ x: 100, y: 300 }, MOBILE)).toEqual({ x: 12, y: 300 })
    expect(snapFabToEdge({ x: 250, y: 300 }, MOBILE)).toEqual({ x: 390 - 56 - 12, y: 300 })
  })

  it('en escritorio deja libres el menú lateral y el pie: nace al lado y arriba de ellos, y no se lleva encima', () => {
    expect(defaultFabPosition(DESKTOP)).toEqual({ x: 1600 - 56 - 12, y: 900 - 56 - 12 - 64 })
    expect(defaultFabPosition(DESKTOP, 'left')).toEqual({ x: 240 + 12, y: 900 - 56 - 12 - 64 })
    // Una posición guardada sobre el menú (de antes de que existiera) se corre a la zona libre.
    expect(clampFabPosition({ x: 12, y: 800 }, DESKTOP)).toEqual({ x: 252, y: 900 - 56 - 12 - 64 })
    expect(snapFabToEdge({ x: 300, y: 300 }, DESKTOP)).toEqual({ x: 252, y: 300 })
  })

  it('un toque sin moverse no es arrastre', () => {
    expect(isFabDrag({ x: 10, y: 10 }, { x: 13, y: 12 })).toBe(false)
    expect(isFabDrag({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(true)
  })
})
