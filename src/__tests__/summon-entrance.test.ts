// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ENTRANCE, ENTRANCE_COMMON, ENTRANCE_FIGURE, PENDULUM, UNKNOWN_SUMMON, entranceAllowed, entranceOf, figureAt, figureTime, landingToneOf, type EntranceKind, pendulumAt, pendulumHit, playEntrance, playPendulum, surePendulum } from '../app/summon-entrance'

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

  it('todas las entradas duran lo mismo (el golpe a 1,5 s y el duelo sigue a 2,2 s), más cortas que la más corta de Master Duel, y la figura de cada tipo corre comprimida hasta ese golpe', () => {
    expect(ENTRANCE).toEqual({ hit: 1500, end: 2200 })
    expect(ENTRANCE.end).toBeLessThan(Math.min(...Object.values(ENTRANCE_FIGURE).map((t) => t.end)))
    for (const kind of Object.keys(ENTRANCE_FIGURE) as EntranceKind[]) {
      const ref = ENTRANCE_FIGURE[kind]
      const lead = ENTRANCE.hit - ENTRANCE_COMMON.reveal
      // El golpe de la figura cae en el de todas; lo de antes de la revelación se comprime (nunca se estira) y, desde ahí, va al ritmo de Master Duel.
      expect(figureAt(kind, ref.hit)).toBeCloseTo(ENTRANCE.hit)
      expect(figureAt(kind, ref.hit - ENTRANCE_COMMON.reveal)).toBeCloseTo(lead)
      expect(ref.hit - ENTRANCE_COMMON.reveal).toBeGreaterThan(lead)
      expect(figureAt(kind, ref.hit + 300) - figureAt(kind, ref.hit)).toBeCloseTo(300)
      // El video lee lo mismo al revés.
      for (const ms of [0, 200, lead, 1000, ENTRANCE.hit, ENTRANCE.end]) expect(figureAt(kind, figureTime(kind, ms))).toBeCloseTo(ms)
      // La figura y su segundo tiempo ya entraron cuando aparece la carta, y los materiales llegan antes del golpe.
      expect(figureAt(kind, ref.figure)).toBeLessThan(lead)
      expect(figureAt(kind, ref.accent)).toBeLessThan(lead)
      expect(ref.materials).toBeLessThan(ref.hit)

      // En la mesa: el velo y la carta escondida duran lo mismo en todos los tipos, y ninguna pieza de la figura arranca después del golpe.
      const calls = stubAnimate()
      const card = document.body.appendChild(document.createElement('div'))
      playEntrance({ kind, cell: new DOMRect(100, 500, 48, 70), art: null, materials: 2, hide: [card], field: null, onDone: () => {} })
      expect(calls.find((call) => call.el.className.includes('bg-black opacity-0') && call.el.className.includes('inset-0'))!.options).toMatchObject({ duration: ENTRANCE.end })
      expect(calls.find((call) => call.el === card)!.options).toMatchObject({ duration: ENTRANCE.hit + ENTRANCE_COMMON.settle })
      const stage = document.querySelector('[data-fx="entrance"]')!
      for (const call of calls) if (stage.contains(call.el)) expect(Number(call.options.delay ?? 0)).toBeLessThanOrEqual(ENTRANCE.hit)
      document.body.innerHTML = ''
    }
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
    const master = playEntrance({ kind: 'ritual', cell: new DOMRect(100, 500, 48, 70), art: 'arte.jpg', materials: 4, hide: [card], field: null, onDone })!

    const t = ENTRANCE
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

  it('la Invocación por Péndulo: sólo la que eligió quien juega (en el automático el adaptador la deduce y queda Especial); una sola escena con todas sus cartas, con las piezas de Master Duel a su tiempo', () => {
    expect(landingToneOf({ tone: 'special', pendulum: true }, UNKNOWN_SUMMON)).toBe('pendulum')
    expect(landingToneOf(surePendulum({ tone: 'special' as const, pendulum: true as const }, true), UNKNOWN_SUMMON)).toBe('special')
    expect(entranceOf('pendulum')).toBeNull()

    const calls = stubAnimate()
    const cards = [0, 1, 2].map((index) => ({ cell: new DOMRect(60 + index * 52, 300, 48, 70), art: null, hide: [document.body.appendChild(document.createElement('div'))] }))
    const onDone = vi.fn()
    playPendulum({ cards, field: null, onDone })
    expect(document.querySelectorAll('[data-entrance="pendulum"]')).toHaveLength(1)
    const veil = calls.find((call) => call.el.className.includes('bg-black opacity-0'))!
    // Dura lo mismo que las demás entradas («todos lo mismo»): el velo hasta `ENTRANCE.end` y la primera carta toca en `ENTRANCE.hit`.
    expect(veil.options).toMatchObject({ duration: ENTRANCE.end })
    expect([0, 1, 2].map((index) => pendulumHit(index))).toEqual([1500, 1567, 1634])
    // Como `figureAt`: lo de antes de la bajada se comprime hasta que arranca la caída de las cartas; desde ahí, al ritmo de Master Duel, sin pasar del final.
    const lead = ENTRANCE.hit - ENTRANCE_COMMON.reveal
    expect(pendulumAt(PENDULUM.descent)).toBeCloseTo(lead)
    expect(pendulumAt(PENDULUM.descent) + ENTRANCE_COMMON.reveal).toBeCloseTo(pendulumHit())
    expect(pendulumAt(PENDULUM.descent + 300) - pendulumAt(PENDULUM.descent)).toBeCloseTo(300)
    expect(pendulumAt(PENDULUM.end)).toBe(ENTRANCE.end)
    // Las escalas, la luz y el péndulo, en su lugar comprimido y apagados para el final.
    const paced = (ms: number) => Math.round(pendulumAt(ms))
    expect(calls.some((call) => call.options.delay === paced(PENDULUM.scales) && call.el.className.includes('origin-bottom'))).toBe(true)
    expect(calls.some((call) => call.options.delay === paced(PENDULUM.light) && call.options.duration === Math.round(ENTRANCE.end - pendulumAt(PENDULUM.light)))).toBe(true)
    const scene = document.querySelector('[data-entrance="pendulum"]')!
    for (const call of calls) if (scene.contains(call.el)) expect(Number(call.options.delay ?? 0) + Number(call.options.duration)).toBeLessThanOrEqual(ENTRANCE.end + 1)
    cards.forEach((card, index) => expect(calls.find((call) => call.el === card.hide[0])!.options).toMatchObject({ duration: pendulumHit(index) + ENTRANCE_COMMON.settle }))
    expect(calls.filter((call) => call.el.className.includes('border-white') && call.el.className.includes('border-2') && call.options.delay !== undefined && [1500, 1567, 1634].includes(Number(call.options.delay)))).not.toHaveLength(0)
    // Con cinco cartas, la última toca y se asienta antes de que el duelo siga.
    expect(pendulumHit(4) + ENTRANCE_COMMON.settle).toBeLessThan(ENTRANCE.end)
    // Las cartas bajan derechas (sólo en y) y nada sale del compositor.
    for (const { frames } of calls) for (const frame of frames) {
      expect(Object.keys(frame).filter((key) => !['scale', 'opacity', 'translate', 'rotate', 'offset', 'easing'].includes(key))).toEqual([])
      if (typeof frame.translate === 'string' && frame.translate !== '0px 0px') expect(frame.translate.startsWith('0px ')).toBe(true)
    }
    veil.fire('finish')
    expect(onDone).toHaveBeenCalledTimes(1)
    document.documentElement.setAttribute('data-effects', 'lite')
    expect(playPendulum({ cards, field: null, onDone })).toBeNull()
  })
})
