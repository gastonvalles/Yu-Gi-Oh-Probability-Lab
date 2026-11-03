import { describe, expect, it } from 'vitest'

import { DUST, LANDING_AT, LIFT_PX, dustFrames, liftAt, liftGlossFrames, liftPathFrames, liftShadowFrames, liftTiltFrames } from '../app/card-lift'

// El vuelo en 3D va entero en el compositor: sus cuadros sólo animan `transform`/`translate`/`scale`/`opacity` (nada de sombra, `filter`, color ni variables).
const COMPOSITOR = new Set(['offset', 'transform', 'translate', 'scale', 'rotate', 'opacity'])
const from = { x: -240, y: 120, scale: 0.875 }
const numbers = (frame: Keyframe) => /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(String(frame.transform))!.slice(1).map(Number)

describe('el vuelo en 3D de una carta (`card-lift.ts`)', () => {
  it('sólo anima propiedades del compositor, con los momentos en orden', () => {
    const all = [liftPathFrames(from), liftTiltFrames(), liftTiltFrames(false), liftGlossFrames(), liftShadowFrames(), ...DUST.map(dustFrames)]

    for (const frames of all) for (const frame of frames) expect(Object.keys(frame).filter((key) => !COMPOSITOR.has(key))).toEqual([])
    const offsets = liftPathFrames(from).map((frame) => Number(frame.offset))
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    expect(offsets.length).toBeGreaterThanOrEqual(33)
  })

  it('sale de donde estaba, sube como una parábola (lo más alto a mitad del aire, más grande), toca su casilla en `LANDING_AT` y termina quieta, con su transformación detrás', () => {
    const path = liftPathFrames(from, undefined, LIFT_PX, ' rotate(90deg)')

    expect(path[0]).toEqual({ offset: 0, transform: 'translate(-240px, 120px) scale(0.875) rotate(90deg)' })
    expect(path.find((frame) => frame.offset === LANDING_AT)?.transform).toBe('translate(0px, 0px) scale(1) rotate(90deg)')
    expect(path.at(-1)).toEqual({ offset: 1, transform: 'translate(0px, 0px) scale(1) rotate(90deg)' })
    // A mitad del aire, `LIFT_PX` más arriba que la recta y ×1,18.
    expect(liftAt(LANDING_AT / 2).lift).toBe(1)
    expect(liftAt(LANDING_AT / 2).grow).toBeCloseTo(1.18, 6)
    const middle = path.find((frame) => frame.offset === 0.406)!
    const [, y] = numbers(middle)
    expect(y!).toBeLessThan(120 * (1 - liftAt(0.406).done) - LIFT_PX * 0.9)
    // Después del toque se aplasta (el golpe) y vuelve, sin moverse de su lugar.
    const landed = path.filter((frame) => Number(frame.offset) > LANDING_AT).map(numbers)
    const squash = Math.min(...landed.map(([, , scale]) => scale!))
    expect(squash).toBeLessThan(0.96)
    expect(squash).toBeGreaterThanOrEqual(0.93)
    for (const [x, ly] of landed) expect([x, ly]).toEqual([0, 0])
  })

  it('un fantasma va de un lugar a otro de la capa (las dos puntas en px y su escala)', () => {
    const path = liftPathFrames({ x: 700, y: 350, scale: 1 }, { x: 100, y: 100, scale: 0.5 }, LIFT_PX, ' rotate(180deg)')

    expect(path[0]!.transform).toBe('translate(700px, 350px) scale(1) rotate(180deg)')
    expect(path.at(-1)!.transform).toBe('translate(100px, 100px) scale(0.5) rotate(180deg)')
  })

  it('se inclina sólo en el aire: quieta va plana; en la vista 3D (`pitch` falso) nunca se inclina hacia atrás', () => {
    expect(liftTiltFrames()[0]!.transform).toBe('perspective(600px) rotateX(0deg) rotateY(0deg) rotate(0deg)')
    expect(liftTiltFrames(true, ' rotate(4deg)').at(-1)!.transform).toBe('perspective(600px) rotateX(0deg) rotateY(0deg) rotate(0deg) rotate(4deg)')
    expect(Math.max(...liftTiltFrames().map((frame) => Number(/rotateX\(([\d.]+)deg\)/.exec(String(frame.transform))![1])))).toBeCloseTo(32, 0)
    expect(liftTiltFrames(false).every((frame) => String(frame.transform).includes('rotateX(0deg)'))).toBe(true)
  })

  it('quieta, sin brillo ni sombra; el polvo se apaga solo', () => {
    for (const frames of [liftGlossFrames(), liftShadowFrames()]) {
      expect(frames[0]!.opacity).toBe(0)
      expect(frames.at(-1)!.opacity).toBe(0)
    }
    for (const frames of DUST.map(dustFrames)) expect(frames.at(-1)!.opacity).toBe(0)
  })
})
