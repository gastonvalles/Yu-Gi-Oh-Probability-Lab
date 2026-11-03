import { describe, expect, it } from 'vitest'

import { LANDING_AT } from '../app/use-card-flights'
import { chipFrames, dustFrames, DUST, leaveFrames, liftGlossFrames, liftLabelFrames, liftPathFrames, liftShadowFrames, liftTiltFrames } from '../components/playground/motion-proposal'

// La propuesta de movimiento del playground va entera en el compositor: sus cuadros sólo animan `transform`/`translate`/`scale`/`opacity` (nada de sombra, `filter`, color ni variables).
const COMPOSITOR = new Set(['offset', 'transform', 'translate', 'scale', 'rotate', 'opacity'])
const from = { x: -240, y: 120, scale: 0.875 }
const all = [liftPathFrames(from), liftTiltFrames(), liftGlossFrames(), liftShadowFrames(), liftLabelFrames(), leaveFrames, chipFrames('top'), chipFrames('bottom'), ...DUST.map(dustFrames)]

describe('la propuesta de movimiento', () => {
  it('sólo anima propiedades del compositor', () => {
    for (const frames of all) for (const frame of frames) expect(Object.keys(frame).filter((key) => !COMPOSITOR.has(key))).toEqual([])
  })

  it('la carta sale de donde estaba, toca su casilla en `LANDING_AT` y termina quieta en su lugar', () => {
    const path = liftPathFrames(from)

    expect(path[0]).toEqual({ offset: 0, transform: 'translate(-240px, 120px) scale(0.875)' })
    expect(path.find((frame) => frame.offset === LANDING_AT)?.transform).toBe('translate(0px, 0px) scale(1)')
    expect(path.at(-1)).toEqual({ offset: 1, transform: 'translate(0px, 0px) scale(1)' })
    // Se aplasta después del toque (el golpe) y en el aire va más arriba que la recta (se levanta).
    const scales = path.filter((frame) => Number(frame.offset) > LANDING_AT && Number(frame.offset) < 1).map((frame) => Number(/scale\(([\d.]+)\)/.exec(String(frame.transform))![1]))
    expect(Math.min(...scales)).toBeLessThan(1)
    const middle = path.find((frame) => Number(frame.offset) >= LANDING_AT / 2)!
    expect(Number(/translate\([^,]+, (-?[\d.]+)px/.exec(String(middle.transform))![1])).toBeLessThan(from.y / 2)
  })

  it('quieta, la carta no lleva inclinación, brillo, sombra ni rótulo', () => {
    expect(liftTiltFrames().at(-1)!.transform).toBe('perspective(600px) rotateX(0deg) rotateY(0deg) rotate(0deg)')
    for (const frames of [liftGlossFrames(), liftShadowFrames(), liftLabelFrames()]) expect(frames.at(-1)!.opacity).toBe(0)
  })
})
