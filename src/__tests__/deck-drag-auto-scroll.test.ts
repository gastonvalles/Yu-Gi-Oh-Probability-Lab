import { describe, expect, it } from 'vitest'

import { getAutoScrollStep } from '../app/use-deck-pointer-drag'

describe('getAutoScrollStep', () => {
  it('no scrollea lejos de los bordes', () => {
    expect(getAutoScrollStep(400, 0, 800)).toBe(0)
  })

  it('scrollea hacia arriba cerca del borde superior y más rápido cuanto más cerca', () => {
    const near = getAutoScrollStep(60, 0, 800)
    const edge = getAutoScrollStep(0, 0, 800)

    expect(near).toBeLessThan(0)
    expect(edge).toBeLessThan(near)
  })

  it('scrollea hacia abajo cerca del borde inferior', () => {
    expect(getAutoScrollStep(790, 0, 800)).toBeGreaterThan(0)
  })
})
