// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LifeTile } from '../components/duel/DuelBar'
import { EASE_OUT } from '../app/motion'

// jsdom no trae las animaciones de la Web Animations API: se mockean en el elemento, con quién las pidió y lo que ya corre en la casilla.
const proto = Element.prototype as unknown as Record<string, unknown>
const originalMatchMedia = window.matchMedia
let pedidas: Array<{ casilla: Element; options: KeyframeAnimationOptions; cancel: ReturnType<typeof vi.fn> }> = []
let enCurso: Array<{ id: string }> = []

beforeEach(() => {
  pedidas = []
  enCurso = []
  vi.stubGlobal('KeyframeEffect', class { get composite() { return 'replace' } })
  proto.animate = function (this: Element, _frames: unknown, options: KeyframeAnimationOptions) {
    const cancel = vi.fn()
    pedidas.push({ casilla: this, options, cancel })
    return { cancel } as unknown as Animation
  }
  proto.getAnimations = () => enCurso
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete proto.animate
  delete proto.getAnimations
  window.matchMedia = originalMatchMedia
})

const tile = (life: number) => <LifeTile name="Ana" life={life} mine />

describe('la casilla de vidas se sacude al bajar, como en el impacto', () => {
  it('al bajar la vida, la casilla se sacude sin espera y con su id de vidas (360 ms, cuadros del impacto)', () => {
    const view = render(tile(8000))
    expect(pedidas).toHaveLength(0)

    view.rerender(tile(7000))
    expect(pedidas).toHaveLength(1)
    expect(pedidas[0]!.casilla).toBe(view.container.querySelector('[data-lp="mine"]'))
    expect(pedidas[0]!.options).toEqual({ id: 'life', duration: 360, delay: 0, easing: EASE_OUT })
  })

  it('al subir la vida no se sacude', () => {
    const view = render(tile(8000))

    view.rerender(tile(9000))
    expect(pedidas).toHaveLength(0)
  })

  it('si un ataque ya sacude la casilla, la baja no suma otra sacudida (nunca dos a la vez)', () => {
    enCurso = [{ id: 'strike' }]
    const view = render(tile(8000))

    view.rerender(tile(7000))
    expect(pedidas).toHaveLength(0)
  })

  it('al desmontarse corta su sacudida', () => {
    const view = render(tile(8000))

    view.rerender(tile(7000))
    const { cancel } = pedidas[0]!
    view.unmount()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('pidiendo menos movimiento la casilla no se sacude', () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') })) as typeof window.matchMedia
    const view = render(tile(8000))

    view.rerender(tile(7000))
    expect(pedidas).toHaveLength(0)
  })
})
