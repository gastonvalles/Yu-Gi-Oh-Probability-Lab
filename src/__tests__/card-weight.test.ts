import { describe, expect, it } from 'vitest'

import { LIFT_SCALE, TILT_MAX, pushWeight, stepWeight, tiltOf, weightAt } from '../app/card-weight'

describe('la carta con peso (card-weight)', () => {
  it('se inclina hacia donde va el dedo, con tope, y se endereza sola cuando el dedo se frena', () => {
    const weight = weightAt(0, 0, 0)

    // Rápido hacia la derecha y hacia arriba: gira de costado (rotateY > 0) y se echa hacia atrás (rotateX > 0), sin pasar el tope.
    for (let frame = 1; frame <= 20; frame += 1) {
      pushWeight(weight, frame * 30, -frame * 30, frame * 16)
      stepWeight(weight, LIFT_SCALE, false)
    }
    expect(weight.ry).toBeGreaterThan(TILT_MAX * 0.9)
    expect(weight.ry).toBeLessThanOrEqual(TILT_MAX)
    expect(weight.rx).toBeGreaterThan(TILT_MAX * 0.9)
    expect(weight.scale).toBeCloseTo(LIFT_SCALE, 2)

    // Sin movimientos nuevos, en medio segundo queda casi derecha.
    for (let frame = 0; frame < 30; frame += 1) stepWeight(weight, LIFT_SCALE, false)
    expect(Math.abs(weight.ry)).toBeLessThan(1)
    expect(Math.abs(weight.rx)).toBeLessThan(1)
  })

  it('crece de a poco (amortiguado) hasta el 115 %, y con movimiento reducido ni se inclina ni crece de a poco', () => {
    const weight = weightAt(0, 0, 0)

    stepWeight(weight, LIFT_SCALE, false)
    expect(weight.scale).toBeGreaterThan(1)
    expect(weight.scale).toBeLessThan(LIFT_SCALE)

    const reduced = weightAt(0, 0, 0)
    pushWeight(reduced, 300, 0, 16)
    stepWeight(reduced, LIFT_SCALE, true)
    expect([reduced.rx, reduced.ry, reduced.scale]).toEqual([0, 0, LIFT_SCALE])
    expect(tiltOf(reduced, 4, 900)).toBe('perspective(900px) rotateX(4deg) rotateY(0deg) scale(1.15)')
  })
})
