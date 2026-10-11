import { describe, expect, it } from 'vitest'

import { pushFabApart } from '../app/fab-position'

describe('empujón entre botones flotantes', () => {
  it('no toca al otro si no se enciman', () => {
    expect(pushFabApart({ x: 0, y: 0 }, 56, { x: 200, y: 0 }, 56, 8)).toBeNull()
    // Justo a la distancia mínima tampoco.
    expect(pushFabApart({ x: 0, y: 0 }, 56, { x: 64, y: 0 }, 56, 8)).toBeNull()
  })

  it('corre al otro en la dirección entre los centros hasta dejar el hueco', () => {
    const pushed = pushFabApart({ x: 100, y: 100 }, 56, { x: 120, y: 110 }, 56, 8)!

    expect(Math.hypot(pushed.x - 100, pushed.y - 100)).toBeCloseTo(64, 1)
    expect(pushed.x).toBeGreaterThan(120)
    expect(pushed.y).toBeGreaterThan(110)
  })

  it('si están justo encimados, lo manda para arriba', () => {
    expect(pushFabApart({ x: 50, y: 200 }, 56, { x: 50, y: 200 }, 56, 8)).toEqual({ x: 50, y: 136 })
  })
})
