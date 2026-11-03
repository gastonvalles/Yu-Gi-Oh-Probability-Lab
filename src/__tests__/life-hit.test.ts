import { describe, expect, it } from 'vitest'

import { CRITICAL_FRAMES, CRITICAL_LP, FADE_FRAMES, FLASH_FRAMES, PUNCH_FRAMES, RISE_FRAMES, isCritical, playCritical, playLifeChange } from '../app/life-hit'

// El golpe de vidas va entero en el compositor: sólo `scale`/`translate`/`opacity` (nada de color, sombra, `filter` ni variables).
const COMPOSITOR = new Set(['offset', 'transform', 'translate', 'scale', 'rotate', 'opacity'])

/** Un elemento de mentira que anota qué se le animó. */
const piece = (name: string, log: string[]) => ({ animate: (_frames: Keyframe[], options: KeyframeAnimationOptions) => (log.push(`${name}:${String(options.duration)}`), { addEventListener() {}, cancel() {} }) }) as unknown as HTMLElement

describe('el golpe de vidas', () => {
  it('sólo anima propiedades del compositor', () => {
    for (const frames of [PUNCH_FRAMES, FLASH_FRAMES, RISE_FRAMES, FADE_FRAMES, CRITICAL_FRAMES]) for (const frame of frames) expect(Object.keys(frame).filter((key) => !COMPOSITOR.has(key))).toEqual([])
  })

  it('el crítico va de 2000 a 1: no en 2001 ni en 0', () => {
    expect(CRITICAL_LP).toBe(2000)
    expect([2001, 2000, 1, 0].map(isCritical)).toEqual([false, true, true, false])
  })

  it('al bajar se infla el número, se enciende el fogonazo y sube el «−N»; al subir, sólo el fogonazo y el «+N»; con movimiento reducido, sólo el «±N»', () => {
    const run = (delta: number, reduced: boolean) => {
      const log: string[] = []

      playLifeChange({ punch: piece('punch', log), flash: piece('flash', log), floater: piece('floater', log) }, delta, reduced)
      return log
    }

    expect(run(-1000, false)).toEqual(['punch:440', 'flash:700', 'floater:1200'])
    expect(run(500, false)).toEqual(['flash:900', 'floater:1600'])
    expect(run(-1000, true)).toEqual(['floater:1600'])
    expect(run(0, false)).toEqual([])
  })

  it('sin Web Animations no hace nada, y el latido no corre con movimiento reducido', () => {
    const bare = {} as HTMLElement

    expect(playLifeChange({ punch: bare, flash: bare, floater: bare }, -1000, false)).toEqual([])
    expect(playCritical(piece('glow', []), true)).toBeNull()
    expect(playCritical(bare, false)).toBeNull()
  })
})
