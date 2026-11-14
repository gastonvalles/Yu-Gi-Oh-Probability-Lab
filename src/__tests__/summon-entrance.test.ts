// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ENTRANCE, ENTRANCE_COMMON, entranceAllowed, entranceCost, entranceOf, entranceTiming, playEntrance } from '../app/summon-entrance'

/** jsdom no anima: cada `animate` se anota con su elemento y devuelve una animación que se termina a mano. */
function stubAnimate() {
  const calls: Array<{ el: Element; frames: Keyframe[]; options: KeyframeAnimationOptions; fire: (type: string) => void }> = []
  Element.prototype.animate = function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    const listeners: Record<string, Array<() => void>> = {}
    const call = { el: this, frames: frames as Keyframe[], options: options as KeyframeAnimationOptions, fire: (type: string) => listeners[type]?.forEach((listener) => listener()) }
    calls.push(call)
    return { addEventListener: (type: string, listener: () => void) => (listeners[type] = [...(listeners[type] ?? []), listener]), cancel: () => call.fire('cancel') } as unknown as Animation
  }
  return calls
}

describe('la entrada larga de la invocación (Master Duel)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-effects')
    delete (Element.prototype as Partial<Element>).animate
  })

  it('los tiempos de Master Duel por tipo: el golpe fuerte y cuándo sigue el duelo; Sincronía y Ritual con su corta', () => {
    expect(Object.fromEntries(Object.entries(ENTRANCE).map(([kind, t]) => [kind, [t.hit, t.end]]))).toEqual({ fusion: [1817, 2583], xyz: [2683, 3467], link: [3633, 4117], synchro: [4083, 4600], ritual: [4700, 5200] })
    expect([entranceTiming('synchro', true).hit, entranceTiming('synchro', true).end]).toEqual([2750, 3483])
    expect([entranceTiming('ritual', true).hit, entranceTiming('ritual', true).end]).toEqual([2367, 2833])
    // Fusión, Xyz y Enlace no tienen corta: piden la larga.
    expect(entranceTiming('xyz', true)).toBe(entranceTiming('xyz'))
    for (const t of [...Object.values(ENTRANCE), ENTRANCE.synchro.short!, ENTRANCE.ritual.short!]) {
      // La revelación arranca 850 ms antes del golpe y el duelo sigue de medio segundo a 0,8 s después.
      expect(t.hit - ENTRANCE_COMMON.reveal).toBeGreaterThan(t.figure)
      expect(t.end - t.hit).toBeGreaterThanOrEqual(466)
      expect(t.end - t.hit).toBeLessThanOrEqual(784)
      // Los materiales llegan antes del golpe (en la Fusión, como en Master Duel, se cruzan con la revelación).
      expect(t.materials).toBeLessThan(t.hit)
    }
    // Lo que suma a la Invocación de siempre (que ya esperaba el vuelo hasta tocar, 408 ms).
    expect(entranceCost('fusion', 408)).toBe(2175)
  })

  it('sólo lo del Extra Deck con su mecánica y el Ritual llevan entrada; con «Livianos» o movimiento reducido, no va', () => {
    expect(['special', 'tribute', 'fusion', 'synchro', 'xyz', 'link', 'ritual'].map((tone) => entranceOf(tone as 'xyz'))).toEqual([null, null, 'fusion', 'synchro', 'xyz', 'link', 'ritual'])
    stubAnimate()
    expect(entranceAllowed()).toBe(true)
    document.documentElement.setAttribute('data-effects', 'lite')
    expect(entranceAllowed()).toBe(false)
    expect(playEntrance({ kind: 'xyz', cell: new DOMRect(0, 0, 48, 70), art: null, materials: 2, hide: [], field: null, onDone: () => {} })).toBeNull()
    document.documentElement.removeAttribute('data-effects')
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') })) as typeof window.matchMedia
    expect(entranceAllowed()).toBe(false)
    window.matchMedia = matchMedia
  })

  it('el velo manda: dura hasta que el duelo sigue y su final avisa (`onDone`) y saca la capa; la carta de verdad no se ve hasta el golpe; todo en el compositor', () => {
    const calls = stubAnimate()
    const card = document.body.appendChild(document.createElement('div'))
    const onDone = vi.fn()
    const master = playEntrance({ kind: 'ritual', short: true, cell: new DOMRect(100, 500, 48, 70), art: 'arte.jpg', materials: 4, hide: [card], field: null, onDone })!

    const t = ENTRANCE.ritual.short!
    const veil = calls.find((call) => call.el.className.includes('bg-black opacity-0') && call.el.className.includes('inset-0'))!
    expect(veil.options).toMatchObject({ duration: t.end })
    expect(veil.frames[1]).toMatchObject({ opacity: ENTRANCE_COMMON.veil })
    expect(calls.find((call) => call.el === card)!.options).toMatchObject({ duration: t.hit + ENTRANCE_COMMON.settle })
    // Cuatro materiales que convergen, la carta con su arte y el golpe a su tiempo.
    expect(calls.filter((call) => call.el.className.includes('h-10 w-7'))).toHaveLength(4)
    expect(document.querySelector('[data-fx="entrance"] img')?.getAttribute('src')).toBe('arte.jpg')
    expect(calls.some((call) => call.options.delay === t.hit && call.el.className.includes('border-fx-ritual'))).toBe(true)
    for (const { frames } of calls) for (const frame of frames) expect(Object.keys(frame).filter((key) => !['scale', 'opacity', 'translate', 'rotate', 'offset', 'easing'].includes(key))).toEqual([])

    expect(onDone).not.toHaveBeenCalled()
    veil.fire('finish')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-fx="entrance"]')).toBeNull()
    // Cortarla (saltar, deshacer) también avisa, una sola vez.
    master.cancel()
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
