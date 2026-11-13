import { describe, expect, it } from 'vitest'

import { sweepDirection } from '../app/screen-sweep'

describe('el barrido al cambiar de pantalla', () => {
  const order = ['home', 'deck-builder', 'meta', 'solo']

  it('va hacia adelante o hacia atrás según el orden del menú', () => {
    expect(sweepDirection(order, 'deck-builder', 'solo')).toBe('next')
    expect(sweepDirection(order, 'solo', 'home')).toBe('prev')
  })

  it('sin barrido si es el mismo destino o uno que no está en el menú', () => {
    expect(sweepDirection(order, 'meta', 'meta')).toBeNull()
    expect(sweepDirection(order, 'meta', 'oculto')).toBeNull()
  })
})
