// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ARRIVAL, HIT_MS, PUNCH, SACRIFICE, SECOND_AT, WAVE_FROM, WAVE_HOLD, WAVE_MS, arrivalRingAt, arrivalRingFrames, arriveAt, arrivals, chargeOn, punchAt, punchFrames, ringAt, sacrificeAt, settleShake, shakeField, shakeOf } from '../app/field-impact'
import { EASE_ASENTAR, EASE_GOLPE } from '../app/motion'
import { FLIGHT_MS } from '../app/use-card-flights'
import { TOKEN_KIND, type MatState } from '../app/practice-mat'
import { arrivalToneOf, landingToneOf, type SummonCard } from '../app/summon-entrance'

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

  describe('el golpe («puñetazo» de Master Duel) y la carga del ataque', () => {
    /** jsdom no anima: cada `animate` se anota con su elemento. */
    function stubAnimate() {
      const calls: Array<{ el: Element; frames: Keyframe[]; options: KeyframeAnimationOptions }> = []
      Element.prototype.animate = function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
        calls.push({ el: this, frames: frames as Keyframe[], options: options as KeyframeAnimationOptions })
        return { addEventListener: vi.fn(), cancel: vi.fn() } as unknown as Animation
      }
      return calls
    }
    const classOf = (call: { el: Element }) => (typeof call.el.className === 'string' ? call.el.className : '')

    afterEach(() => {
      document.body.innerHTML = ''
      delete (Element.prototype as Partial<Element>).animate
    })

    it('la curva: pico al 9 % (subiendo con `--ease-golpe`), se asienta al 70 % y termina en la mitad; el alfa, plena hasta el 55 %', () => {
      expect(punchFrames(1)).toEqual([
        { scale: `${PUNCH.from}`, opacity: 0, easing: EASE_GOLPE },
        { scale: '1', opacity: 1, offset: PUNCH.peak, easing: EASE_ASENTAR },
        { scale: `${PUNCH.mid}`, opacity: 1, offset: PUNCH.hold },
        { scale: `${PUNCH.to}`, opacity: 0 },
      ])
      expect(PUNCH).toMatchObject({ from: 0.2, peak: 0.09, mid: 0.7, hold: 0.55, to: 0.5 })
      // `punchAt` (el video) dice lo mismo en cada cuadro clave.
      expect(punchAt(0)).toEqual({ scale: 0.2, alpha: 0 })
      expect(punchAt(PUNCH.peak)).toEqual({ scale: 1, alpha: 1 })
      expect(punchAt(PUNCH.hold).scale).toBeCloseTo(0.7)
      expect(punchAt(PUNCH.hold).alpha).toBe(1)
      expect(punchAt(1)).toEqual({ scale: 0.5, alpha: 0 })
      // A los 50 ms ya está en el pico (de 560).
      expect(HIT_MS * PUNCH.peak).toBeCloseTo(50, 0)
    })

    it('un ataque a una carta: aro dorado con su gemela oscura, destello aditivo sobre una gemela negra y, 200 ms después, el polvo y las líneas; sin onda de pantalla', () => {
      const calls = stubAnimate()
      ringAt(100, 200, 300)

      const ring = calls.find((call) => classOf(call).includes('border-fx-destello'))!
      expect(classOf(ring)).toContain('outline-black/40')
      expect(ring.frames).toEqual(punchFrames(1))
      expect(ring.options).toMatchObject({ duration: HIT_MS, delay: 300 })
      const flash = calls.find((call) => classOf(call).includes('mix-blend-plus-lighter'))!
      expect(classOf(flash)).toContain('from-fx-destello')
      expect(calls.some((call) => classOf(call).includes('via-black/40'))).toBe(true)
      const second = calls.filter((call) => call.options.delay === 300 + SECOND_AT)
      expect(second).toHaveLength(2)
      expect(calls.some((call) => call.el.getAttribute('data-fx') === 'wave')).toBe(false)
      // Nada fuera del compositor.
      for (const { frames } of calls) for (const frame of frames) expect(Object.keys(frame).filter((key) => !['scale', 'opacity', 'translate', 'offset', 'easing'].includes(key))).toEqual([])
    })

    it('el golpe fuerte suma la onda que cruza la pantalla: lineal de 18 % a 100 % en 300 ms, con el alfa plena hasta los 165 ms', () => {
      const calls = stubAnimate()
      ringAt(100, 200, 300, { strong: true })

      const wave = calls.find((call) => call.el.getAttribute('data-fx') === 'wave')!
      expect(wave.options).toMatchObject({ duration: WAVE_MS, delay: 300 })
      expect(wave.options.easing).toBeUndefined()
      expect(wave.frames[0]).toEqual({ scale: `${WAVE_FROM}`, opacity: 1 })
      expect(wave.frames[1]).toMatchObject({ opacity: 1, offset: WAVE_HOLD })
      expect(wave.frames.at(-1)).toEqual({ scale: '1', opacity: 0 })
      expect(WAVE_MS * WAVE_HOLD).toBeCloseTo(165)
    })

    it('con «Livianos» queda sólo el aro con su curva; con movimiento reducido, nada', () => {
      const calls = stubAnimate()
      document.documentElement.setAttribute('data-effects', 'lite')
      ringAt(0, 0, 0, { strong: true })
      expect(calls).toHaveLength(1)
      expect(classOf(calls[0]!)).toContain('border-fx-destello')
      calls.length = 0
      arriveAt(0, 0, 0, { tone: 'xyz', strong: true })
      expect(calls).toHaveLength(1)
      expect(classOf(calls[0]!)).toContain('border-fx-xyz')

      calls.length = 0
      document.documentElement.removeAttribute('data-effects')
      const matchMedia = window.matchMedia
      window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') })) as typeof window.matchMedia
      ringAt(0, 0, 0, { strong: true })
      arriveAt(0, 0, 0, { strong: true })
      chargeOn(document.body.appendChild(document.createElement('div')), 10, 0, 300)
      window.matchMedia = matchMedia
      expect(calls).toHaveLength(0)
    })

    it('la llegada al campo (Master Duel): el anillo del color de su tipo, de 1,7 a 3,5 cartas en 144 ms y a 4,2 en 1 s, plena hasta los 200 ms; la cruz y el brillo; la fuerte, tres anillos ×1,5 y la onda', () => {
      const calls = stubAnimate()
      arriveAt(100, 200, 410, { tone: 'tribute', unit: 50 })

      const rings = calls.filter((call) => classOf(call).includes('border-fx-sacrificio') && classOf(call).includes('border-2'))
      expect(rings).toHaveLength(1)
      expect((rings[0]!.el as HTMLElement).style.width).toBe('210px')
      expect(rings[0]!.options).toMatchObject({ duration: ARRIVAL.ms, delay: 410 })
      expect(rings[0]!.frames).toEqual(arrivalRingFrames())
      expect(arrivalRingAt(ARRIVAL.ring.fastAt).scale * ARRIVAL.ring.to).toBeCloseTo(3.5)
      expect(arrivalRingAt(0.2).alpha).toBe(1)
      expect(arrivalRingAt(1)).toEqual({ scale: 1, alpha: 0 })
      expect(calls.some((call) => classOf(call).includes('from-fx-sacrificio/60'))).toBe(true)
      expect(calls.filter((call) => call.el.querySelectorAll('.bg-fx-sacrificio').length === 4)).toHaveLength(1)
      // Nada fuera del compositor.
      for (const { frames } of calls) for (const frame of frames) expect(Object.keys(frame).filter((key) => !['scale', 'opacity', 'offset', 'easing'].includes(key))).toEqual([])

      calls.length = 0
      arriveAt(0, 0, 0, { tone: 'link', strong: true, unit: 50 })
      const strong = calls.filter((call) => classOf(call).includes('border-fx-enlace') && classOf(call).includes('border-2'))
      expect(strong.map((call) => call.options.delay)).toEqual([0, 100, 200])
      expect((strong[0]!.el as HTMLElement).style.width).toBe('315px')
      expect(calls.some((call) => classOf(call).includes('border-3') && classOf(call).includes('border-fx-enlace'))).toBe(true)
    })

    it('el tipo de la llegada: el de la jugada, Ritual si sale de la mano, Sacrificio si lo dice o es una Normal de Nivel 5 o más', () => {
      const card = (over: Partial<SummonCard['kind']> = {}, ritual = false): SummonCard => ({ kind: { ...TOKEN_KIND, ...over }, ritual })
      expect(landingToneOf({ tone: 'xyz' }, card())).toBe('xyz')
      expect(landingToneOf({ tone: 'special', hand: true }, card({}, true))).toBe('ritual')
      expect(landingToneOf({ tone: 'special' }, card({}, true))).toBe('special')
      expect(landingToneOf({ tone: 'normal', tribute: true }, card())).toBe('tribute')
      expect(landingToneOf({ tone: 'normal', hand: true }, card({ level: 7 }))).toBe('tribute')
      expect(landingToneOf({ tone: 'normal', hand: true }, card({ level: 4 }))).toBe('special')
      expect(arrivalToneOf({ from: 'extra' }, card({ synchro: true }))).toBe('synchro')
      expect(arrivalToneOf({ from: 'other', hand: true }, card({}, true))).toBe('ritual')
    })

    it('el Sacrificio: el disco violeta de 1,2 cartas, el círculo de 1,7 que crece de 44 % a 100 % en 200 ms y la columna, dentro del vuelo al Cementerio; con «Livianos», sólo el círculo', () => {
      const calls = stubAnimate()
      sacrificeAt(100, 200, 50)

      const maru = calls.find((call) => classOf(call).includes('border-white'))!
      expect((maru.el as HTMLElement).style.width).toBe('85px')
      expect(maru.frames[0]).toEqual({ scale: '0.44', opacity: 1 })
      expect(maru.frames[1]).toMatchObject({ scale: '1', offset: Math.round((200 / SACRIFICE.ms) * 1000) / 1000 })
      const disc = calls.find((call) => classOf(call).includes('from-fx-material-brillo'))!
      expect((disc.el as HTMLElement).style.width).toBe('60px')
      expect(calls.some((call) => classOf(call).includes('bg-linear-to-b'))).toBe(true)
      // No alarga el duelo: todo termina antes de que la carta llegue al Cementerio.
      expect(Math.max(...calls.map((call) => Number(call.options.duration) + Number(call.options.delay ?? 0)))).toBeLessThanOrEqual(FLIGHT_MS)
      for (const { frames } of calls) for (const frame of frames) expect(Object.keys(frame).filter((key) => !['scale', 'opacity', 'offset', 'easing'].includes(key))).toEqual([])

      calls.length = 0
      document.documentElement.setAttribute('data-effects', 'lite')
      sacrificeAt(0, 0, 50)
      expect(calls).toHaveLength(1)
      expect(classOf(calls[0]!)).toContain('border-white')
    })

    it('la carga: la carta que ataca brilla dorada (opaca hasta la mitad) y el polvo converge, siguiendo la embestida; con «Livianos», sin polvo', () => {
      const calls = stubAnimate()
      const card = document.body.appendChild(document.createElement('div'))
      card.getBoundingClientRect = () => ({ left: 10, top: 20, width: 48, height: 70 }) as DOMRect

      chargeOn(card, 28, 0, 300)
      const follow = calls.find((call) => call.el.getAttribute('data-fx') === 'charge')!
      expect(follow.frames).toEqual([{ translate: '0px 0px', easing: expect.any(String) }, { translate: '28px 0px' }])
      expect(follow.options).toMatchObject({ duration: 300 })
      const glow = calls.find((call) => classOf(call).includes('border-fx-destello'))!
      expect((glow.el as HTMLElement).style.width).toBe(`${Math.round(48 * 1.22)}px`)
      expect(glow.frames).toEqual([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }])
      const dust = calls.filter((call) => call.frames[0]?.translate && call.el.getAttribute('data-fx') !== 'charge')
      expect(dust.length).toBeGreaterThan(3)
      for (const { frames } of dust) expect(frames.at(-1)!.translate).toBe('0px 0px')

      calls.length = 0
      document.documentElement.setAttribute('data-effects', 'lite')
      chargeOn(card, 28, 0, 300)
      expect(calls).toHaveLength(2)
    })
  })

  it('lo que llegó a una zona de monstruo boca arriba (del Extra o de otro lado); lo que se movió en el campo o se colocó, no', () => {
    const before = state({ extra: ['x1'], hand: ['h1', 'h2'], mz: [{ id: 'm1', pos: 'atk', counters: 0, materials: [] }, null, null, null, null] })
    const after = state({
      mz: [null, { id: 'm1', pos: 'atk', counters: 0, materials: [] }, { id: 'h1', pos: 'atk', counters: 0, materials: [] }, { id: 'h2', pos: 'set', counters: 0, materials: [] }, null],
      emz: [{ id: 'x1', pos: 'atk', counters: 0, materials: [] }, null],
    })

    expect(arrivals(before, after)).toEqual([
      { id: 'h1', spot: 'mz', index: 2, from: 'other', hand: true },
      { id: 'x1', spot: 'emz', index: 0, from: 'extra' },
    ])
  })
})
