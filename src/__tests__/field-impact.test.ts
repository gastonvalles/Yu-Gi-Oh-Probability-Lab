// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { arrivals, settleShake, shakeField, shakeOf } from '../app/field-impact'
import type { MatState } from '../app/practice-mat'

const state = (over: Partial<MatState>): MatState => ({ ...({ deck: [], extra: [], hand: [], gy: [], banished: [], mz: [null, null, null, null, null], emz: [null, null], st: [null, null, null, null, null], field: null } as unknown as MatState), ...over })

describe('el impacto en la mesa (field-impact)', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-effects')
    vi.restoreAllMocks()
  })

  it('la escala de la sacudida: nada, leve o fuerte según el golpe', () => {
    expect(shakeOf({ landing: 'normal' })).toBe('light')
    expect(shakeOf({ landing: 'special' })).toBe('light')
    expect(['fusion', 'synchro', 'xyz', 'link'].map((landing) => shakeOf({ landing: landing as 'xyz' }))).toEqual(['strong', 'strong', 'strong', 'strong'])
    expect(shakeOf({ attack: 'card' })).toBe('light')
    expect(shakeOf({ attack: 'direct' })).toBe('strong')
    expect(shakeOf({ arrival: 'extra' })).toBe('strong')
  })

  it('la sacudida mueve sólo `translate`, a lo sumo 5 px, y termina exacta en su lugar; con «Livianos» no se sacude', () => {
    const field = document.createElement('div')
    const animate = vi.fn(() => ({ addEventListener: vi.fn() }) as unknown as Animation)
    Object.assign(field, { animate, getAnimations: () => [] })

    shakeField(field, 'strong', 120)
    const [frames, options] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions]
    expect(frames.every((frame) => Object.keys(frame).filter((key) => key !== 'easing').join() === 'translate')).toBe(true)
    expect(Math.max(...frames.flatMap((frame) => String(frame.translate).split(' ').map((px) => Math.abs(parseFloat(px)))))).toBe(5)
    expect([frames[0]!.translate, frames.at(-1)!.translate]).toEqual(['0px 0px', '0px 0px'])
    expect(options).toMatchObject({ delay: 120, id: 'field-shake' })
    expect(field.hasAttribute('data-shaking')).toBe(true)

    expect(shakeField(field, 'none')).toBeNull()
    document.documentElement.setAttribute('data-effects', 'lite')
    expect(shakeField(field, 'light')).toBeNull()
    expect(animate).toHaveBeenCalledTimes(1)
  })

  it('antes de medir, la sacudida en curso se termina', () => {
    const root = document.createElement('section')
    const field = document.createElement('div')
    const finish = vi.fn()
    field.dataset.shaking = ''
    Object.assign(field, { getAnimations: () => [{ id: 'field-shake', finish }, { id: 'otra', finish }] })
    root.append(field)

    settleShake(root)
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('lo que llegó a una zona de monstruo boca arriba (del Extra o de otro lado); lo que se movió en el campo o se colocó, no', () => {
    const before = state({ extra: ['x1'], hand: ['h1', 'h2'], mz: [{ id: 'm1', pos: 'atk', counters: 0, materials: [] }, null, null, null, null] })
    const after = state({
      mz: [null, { id: 'm1', pos: 'atk', counters: 0, materials: [] }, { id: 'h1', pos: 'atk', counters: 0, materials: [] }, { id: 'h2', pos: 'set', counters: 0, materials: [] }, null],
      emz: [{ id: 'x1', pos: 'atk', counters: 0, materials: [] }, null],
    })

    expect(arrivals(before, after)).toEqual([
      { id: 'h1', spot: 'mz', index: 2, from: 'other' },
      { id: 'x1', spot: 'emz', index: 0, from: 'extra' },
    ])
  })
})
