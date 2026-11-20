// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HITSTOP_MS } from '../app/card-weight'
import { ACTIVATE_GLOW, ARRIVAL, ARRIVAL_CLASS, HIT_MS, LEAVE, PILE_POP, SACRIFICE, SECOND_AT, SECOND_MS, SHAKES, activateAt, leaveAt } from '../app/field-impact'
import { EASE_OUT, bezierEase } from '../app/motion'
import { FX_RGB } from '../components/probability/practice-styles'
import { DELTA_MS, lifeCountMs } from '../app/life-effects'
import { DEAL_LAND_AT, DEAL_MS, FIRST_DEAL_MS, NEXT_DEAL_MS } from '../app/deal-flight'
import { buildDuelReplay } from '../app/duel-replay'
import { createMatState } from '../app/practice-mat'
import { ENTRANCE, ENTRANCE_COMMON, PENDULUM, pendulumAt, pendulumHit, playPendulum } from '../app/summon-entrance'
import { pendulumFrame } from '../components/replays/video/video-entrance'
import { replayScenes } from '../components/replays/video/video-scene'
import { DECK_SHUFFLE_MS, HAND_SHUFFLE_MS } from '../app/shuffle-fx'
import { FLIGHT_MS, FLIGHT_STAGGER_MS, LANDING_AT, flightMs as mesaFlightMs, popPile } from '../app/use-card-flights'
import { PHASE_BAND_MS, TURN_BAND_MS } from '../components/duel/PhaseBand'
import { IMPACT_MS } from '../components/probability/AttackFx'
import { SPOTLIGHT_TRAVEL_MS, STAGE_TONE as MESA_STAGE_TONE } from '../components/probability/MatFx'
import { dealOverlays, dealtKeys, flightMs, glowOverlay, IMPACT, impactOverlays, leaveOverlay, lifeMs, MESA, popOverlay, RIFFLE, sacrificeOverlay, STAGE_TONE } from '../components/replays/video/video-fx'
import { fakeAssets } from './support/video-fakes'

// El video copia los tiempos y los colores de la mesa (para no cargarla con React): que sigan siendo los mismos.
describe('el video anima con los tiempos y los colores de la mesa', () => {
  it('vuelos, carta grande, banda de fase, barajado, ataque y vidas', () => {
    expect(MESA).toMatchObject({ flight: FLIGHT_MS, stagger: FLIGHT_STAGGER_MS, landingAt: LANDING_AT, travel: SPOTLIGHT_TRAVEL_MS, shuffle: DECK_SHUFFLE_MS, handShuffle: HAND_SHUFFLE_MS, firstDeal: FIRST_DEAL_MS, nextDeal: NEXT_DEAL_MS, deal: DEAL_MS, dealLandAt: DEAL_LAND_AT, impact: IMPACT_MS, delta: DELTA_MS, banner: PHASE_BAND_MS, turnBanner: TURN_BAND_MS })
    // Los planes del riffle (copiados de `shuffle-fx.ts`, que no los exporta): que sumen lo mismo que su barajado.
    for (const [plan, total] of [[RIFFLE.deck, DECK_SHUFFLE_MS], [RIFFLE.hand, HAND_SHUFFLE_MS]] as const) expect(plan.openFrom + plan.openSpan + plan.open).toBe(total)
    for (const distance of [0, 120, 300, 600, 900]) expect(flightMs(distance)).toBe(mesaFlightMs(distance))
    for (const delta of [0, -500, 2000, -8000, 12000]) expect(lifeMs(delta)).toBe(lifeCountMs(delta))
  })

  it('el color de la carta grande y del destello de cada jugada', () => {
    expect(STAGE_TONE).toEqual(MESA_STAGE_TONE)
  })

  it('el impacto (`field-impact.ts`): los tiempos del aro, del destello y de la pausa del golpe, sus medidas y la sacudida', () => {
    expect(MESA).toMatchObject({ hitstop: HITSTOP_MS })
    expect(IMPACT.shakes).toEqual(SHAKES)
    // Las medidas y los cuadros van en las clases y en `animate` de la mesa: que sigan diciendo lo mismo.
    const source = readFileSync(join(process.cwd(), 'src/app/field-impact.ts'), 'utf8')
    // La llegada (`arriveAt`): el aro de 2 px con su gemela de 2 px y la onda de 3 (el video las dibuja con esos anchos); cada color sale de su token.
    expect(source).toContain(`rounded-full border-2 outline-2 outline-black/40`)
    expect(source).toContain(`rounded-full border-3 outline-3 outline-black/40`)
    const draw = readFileSync(join(process.cwd(), 'src/components/replays/video/video-draw.ts'), 'utf8')
    for (const [tone, classes] of Object.entries(ARRIVAL_CLASS)) expect(draw).toContain(`${tone}: v('--color-${classes.ring.slice('border-'.length)}')`)
    // El golpe (`ringAt` con `hit`) y la onda de pantalla: sus medidas en las clases de la mesa.
    const { hit, wave } = IMPACT
    expect(source).toContain(`size-${hit.ring.size / 4} rounded-full border-${hit.ring.border} border-fx-destello outline-${hit.ring.twin} outline-black/40`)
    expect(source).toContain(`size-${hit.flash.size / 4} rounded-full bg-radial from-fx-destello/${hit.flash.alpha * 100} to-transparent to-${hit.flash.stop * 100}%`)
    expect(source).toContain(`size-${hit.flash.twin / 4} rounded-full bg-radial from-transparent from-${hit.flash.hole * 100}% via-black/40 via-50% to-transparent to-${hit.flash.stop * 100}%`)
    expect(source).toContain(`rounded-full border-${wave.border} border-fx-destello outline-${wave.twin} outline-black/40`)
    expect(source).toContain(`h-${hit.lines.width / 4} w-${hit.lines.length / 4} origin-left bg-fx-destello`)
    expect(source).toContain(`size-${hit.dust.size / 4} rounded-full bg-fx-destello`)
    expect(source).toContain(`border-${IMPACT.charge.border} border-fx-destello bg-fx-destello/${IMPACT.charge.alpha * 100}`)
  })

  it('el golpe en el lienzo: aro dorado con la curva «puñetazo» y su gemela, la segunda onda 200 ms después y, si es fuerte, la onda que cruza la pantalla; al ritmo del video', () => {
    const theme = { fx: { destello: '#ffcf4a', energia: '#2ee6ff', llegada: { special: '#ffc58d', xyz: '#ffc95d' } } } as unknown as Parameters<typeof impactOverlays>[4]
    const light = impactOverlays(10, 10, 'light', 1, theme, 1000, 1050, 1.25, true)
    const strong = impactOverlays(10, 10, 'strong', 1, theme, 1000, 1050, 1.25, true)
    const summon = impactOverlays(10, 10, 'light', 1, theme, 1000, 1000, 1.25)
    const impact = (list: typeof light) => list.find((overlay) => overlay.kind === 'impact')!

    // Lo que dura: el golpe hasta que se apaga la segunda onda (a los 200 ms, `SECOND_MS`), a 1,25×.
    expect(impact(light).duration).toBeCloseTo(Math.max(HIT_MS, SECOND_AT + SECOND_MS) / 1.25)
    expect(impact(strong).duration).toBe(impact(light).duration)
    // La llegada dura lo que su anillo (1 s); la fuerte, con sus tres anillos cada 100 ms.
    expect(impact(summon).duration).toBeCloseTo(ARRIVAL.ms / 1.25)
    const xyz = impact(impactOverlays(10, 10, 'strong', 1, theme, 1000, 1000, 1.25, false, 'xyz'))
    expect(xyz.duration).toBeCloseTo((ARRIVAL.ms + 200) / 1.25)
    // Se dibuja sin romperse en cualquier momento (un lienzo de mentira anota los colores).
    const strokes: string[] = []
    const ctx = new Proxy({ canvas: { width: 720, height: 1280 }, createRadialGradient: () => ({ addColorStop: () => {} }) } as Record<string, unknown>, {
      get: (target, key) => (key in target ? target[key as string] : () => {}),
      set: (target, key, value) => {
        if (key === 'strokeStyle') strokes.push(String(value))
        target[key as string] = value
        return true
      },
    })
    for (const p of [0, 0.05, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) impact(strong).draw(ctx as never, p)
    expect(strokes).toContain('#ffcf4a')
    expect(strokes).toContain('rgb(0 0 0 / 0.4)')
    expect(strokes).not.toContain('#2ee6ff')
  })

  it('el Sacrificio en el lienzo: los tiempos de la mesa (`SACRIFICE`), al ritmo del video, con el violeta y el círculo blanco en cada casilla que se deja', () => {
    const overlay = sacrificeOverlay([{ x: 10, y: 10 }, { x: 80, y: 10 }], 48, fakeAssets.theme, 500, 1.25)
    expect(overlay).toMatchObject({ kind: 'sacrifice', start: 500 })
    expect(overlay.duration).toBeCloseTo(SACRIFICE.ms / 1.25)
    expect(SACRIFICE.ms).toBeLessThanOrEqual(FLIGHT_MS)
    const styles: string[] = []
    const ctx = new Proxy({ canvas: { width: 720, height: 1280 }, createRadialGradient: () => ({ addColorStop: (_: number, color: string) => styles.push(color) }) } as Record<string, unknown>, {
      get: (target, key) => (key in target ? target[key as string] : () => {}),
      set: (target, key, value) => {
        if (key === 'strokeStyle' || key === 'fillStyle') styles.push(String(value))
        target[key as string] = value
        return true
      },
    })
    for (const p of [0, 0.2, 0.44, 0.6, 1]) overlay.draw(ctx as never, p)
    expect(styles).toContain(fakeAssets.theme.fx.material)
    expect(styles).toContain(fakeAssets.theme.fx.llegada.pendulum)
  })

  it('el reparto al empezar: las dos manos, cada una desde su deck que se baraja, con los tiempos de la mesa', () => {
    const deck = (prefix: string) => Array.from({ length: 20 }, (_, i) => `${prefix}${i + 1}`)
    const replay = buildDuelReplay({ mode: 'link', view: 'public', players: ['Ana', 'Beto'], starter: 0, mine: { initial: createMatState(deck('card-14558127-'), [], 5), actions: [] }, theirs: { initial: createMatState(deck('c'), [], 5), acts: [] }, order: [], life: [{ at: 0, lp: [8000, 8000] }], nameOf: () => undefined })
    const [scene] = [...replayScenes(replay, 720)]
    const assets = { ...fakeAssets, back: {} as never }
    const overlays = dealOverlays(scene!, assets, 1)
    expect(overlays.map((overlay) => overlay.kind)).toEqual(['shuffle', 'deal', 'shuffle', 'deal'])
    expect(overlays[3]!.hides).toEqual(dealtKeys(scene!, [1]))
    expect(overlays[3]!.hides).toHaveLength(5)
    expect(overlays[1]!.duration).toBe(FIRST_DEAL_MS + 4 * NEXT_DEAL_MS + DEAL_MS)
    // El combo (un solo jugador) reparte sólo la suya; la primera mano del automático, desde su robo.
    expect(dealOverlays(scene!, assets, 1, [0]).map((overlay) => overlay.kind)).toEqual(['shuffle', 'deal'])
    expect(dealOverlays(scene!, assets, 1.25, [1], 900).every((overlay) => overlay.start === 900)).toBe(true)
  })

  it('la escena del Péndulo: cada pieza del video entra y se va cuando la anima la mesa (`playPendulum`), y cada carta toca en su golpe', () => {
    // La mesa en jsdom: cada `animate` se anota con su elemento y sus tiempos.
    const calls: Array<{ el: Element; options: KeyframeAnimationOptions }> = []
    Element.prototype.animate = function (this: Element, _frames: unknown, options?: number | KeyframeAnimationOptions) {
      calls.push({ el: this, options: options as KeyframeAnimationOptions })
      return { addEventListener: () => {}, cancel: () => {} } as unknown as Animation
    }
    const cards = [0, 1, 2].map((index) => ({ cell: new DOMRect(60 + index * 52, 300, 48, 70), art: null, hide: [] }))
    playPendulum({ cards, field: null, onDone: () => {} })
    delete (Element.prototype as Partial<Element>).animate
    document.body.innerHTML = ''
    const span = (match: (el: Element) => boolean) => {
      const { delay, duration } = calls.find((call) => match(call.el))!.options
      return [Number(delay ?? 0), Number(delay ?? 0) + Number(duration)] as const
    }
    const frame = (ms: number) => pendulumFrame(ms, cards.length)
    // El péndulo y la luz: apagados antes de su tramo, a la vista en el medio y apagados al final (la mesa redondea a ms enteros).
    const swing = span((el) => el.className.includes('top-1/12'))
    expect(swing[0]).toBe(Math.round(pendulumAt(PENDULUM.swing)))
    expect([frame(swing[0] - 2).swing.alpha, frame((swing[0] + swing[1]) / 2).swing.alpha]).toEqual([0, 1])
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => Math.abs(frame(swing[0] + ((swing[1] - swing[0]) * i) / 50).swing.deg)))).toBeLessThanOrEqual(18)
    const light = span((el) => el.className.includes('origin-top bg-linear-to-b'))
    expect([frame(light[0] - 2).light.alpha, frame((light[0] + light[1]) / 2).light.alpha]).toEqual([0, 0.85])
    // Las escalas suben en su tramo (de 0 a todo el alto) y se quedan hasta el final.
    const bar = span((el) => el.className.includes('origin-bottom'))
    expect(frame(bar[0] - 2).scales.alpha).toBe(0)
    expect(frame(bar[0] + 1).scales.rise).toBeLessThan(0.1)
    expect(frame(bar[1] + 2).scales.rise).toBe(1)
    expect(frame(ENTRANCE.end - 300).scales.alpha).toBe(1)
    // Las cartas: cada una aparece cuando la mesa la suelta y toca su casilla, aplastada, en su golpe (`pendulumHit`); asentada, de su tamaño.
    const paths = calls.filter((call) => (call.el as HTMLElement).style?.left && call.el.className.includes('absolute opacity-0'))
    paths.forEach((path, index) => {
      expect(Number(path.options.delay)).toBe(pendulumHit(index) - ENTRANCE_COMMON.reveal)
      expect(frame(Number(path.options.delay) - 1).cards[index]!.alpha).toBe(0)
      expect(frame(Number(path.options.delay) + 1).cards[index]!.alpha).toBeGreaterThan(0)
      expect(frame(pendulumHit(index)).cards[index]).toMatchObject({ drop: 0, scale: ENTRANCE_COMMON.squash })
      expect(frame(pendulumHit(index) + ENTRANCE_COMMON.settle).cards[index]).toMatchObject({ alpha: 1, drop: 0, scale: 1 })
    })
    expect(paths).toHaveLength(3)
    // El velo, el de toda entrada.
    expect([frame(0).veil, frame(ENTRANCE_COMMON.veilIn).veil, frame(ENTRANCE.end).veil]).toEqual([0, ENTRANCE_COMMON.veil, 0])
  })
})

// El resplandor al activar, la onda al destruir o desterrar y el rebote de la pila: el video los dibuja leyendo lo que la mesa anima de verdad (`activateAt`, `leaveAt`, `popPile`), cuadro a cuadro.
describe('el video dibuja las piezas nuevas de la mesa con sus tiempos y sus colores', () => {
  const calls: Array<{ el: HTMLElement; frames: Keyframe[]; options: KeyframeAnimationOptions }> = []

  beforeEach(() => {
    calls.length = 0
    Element.prototype.animate = function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
      calls.push({ el: this as HTMLElement, frames: frames as Keyframe[], options: options as KeyframeAnimationOptions })
      return { addEventListener: vi.fn(), cancel: vi.fn() } as unknown as Animation
    }
  })
  afterEach(() => {
    document.body.innerHTML = ''
    delete (Element.prototype as Partial<Element>).animate
  })

  /** El valor de `key` a `p` (0 a 1) en los cuadros de la mesa: lineal entre los cuadros que lo traen (los del medio llevan su `offset`). */
  const valueAt = (frames: Keyframe[], key: string, p: number) => {
    const known = frames.flatMap((frame, index) => (frame[key] === undefined ? [] : [{ at: frame.offset ?? index / (frames.length - 1), value: Number(frame[key]) }]))
    const after = known.findIndex((frame) => frame.at >= p)
    if (after <= 0) return known[Math.max(0, after)]!.value
    const [a, b] = [known[after - 1]!, known[after]!]
    return a.value + ((b.value - a.value) * (p - a.at)) / (b.at - a.at)
  }

  /** Un lienzo que anota lo que se le pide: el alfa de cada relleno o trazo, los colores, los radios de los arcos y las copias de sí mismo. */
  const probe = () => {
    const log = { alpha: [] as number[], stops: [] as string[], strokes: [] as string[], radii: [] as number[], copies: [] as number[][] }
    const state: Record<string, unknown> = {
      canvas: { width: 720, height: 1280 },
      globalAlpha: 1,
      createRadialGradient: () => ({ addColorStop: (_: number, color: string) => log.stops.push(color) }),
      fill: () => log.alpha.push(Number(state.globalAlpha)),
      stroke: () => {
        log.alpha.push(Number(state.globalAlpha))
        log.strokes.push(String(state.strokeStyle))
      },
      arc: (_x: number, _y: number, radius: number) => log.radii.push(radius),
      drawImage: (...args: unknown[]) => log.copies.push(args.slice(1) as number[]),
    }
    const ctx = new Proxy(state, { get: (target, key) => (key in target ? target[key as string] : () => {}), set: (target, key, value) => ((target[key as string] = value), true) })
    return { ctx: ctx as never, log }
  }

  it('activar: el resplandor sube, queda pleno, baja y se apaga como el `opacity` de la mesa, a su tamaño y en el cian de la energía, en los 950 ms de la activación', () => {
    const cell = document.body.appendChild(document.createElement('div'))
    cell.getBoundingClientRect = () => ({ left: 10, top: 20, width: 50, height: 70 }) as DOMRect
    activateAt(cell, 0, null)
    const glow = calls.find((call) => call.el.className.includes('from-fx-energia'))!
    const overlay = glowOverlay({ x: 10, y: 20, w: 50, h: 70 }, fakeAssets.theme, 700, 1.25)
    expect(overlay).toMatchObject({ kind: 'glow', start: 700 })
    expect(overlay.duration).toBeCloseTo(ACTIVATE_GLOW.ms / 1.25)
    expect(glow.options.duration).toBe(ACTIVATE_GLOW.ms)
    // Termina con la carta grande de la activación (`MESA.stage`): no pasa de ahí.
    expect(ACTIVATE_GLOW.ms).toBeLessThanOrEqual(MESA.stage)
    expect(readFileSync(join(process.cwd(), 'src/app/field-impact.ts'), 'utf8')).toContain(`from-fx-energia/${ACTIVATE_GLOW.alpha * 100} to-transparent to-70%`)
    for (const ms of [0, 70, 140, 300, 630, 700, 770, 860, 949]) {
      const { ctx, log } = probe()
      overlay.draw(ctx, ms / ACTIVATE_GLOW.ms)
      const opacity = valueAt(glow.frames, 'opacity', ms / ACTIVATE_GLOW.ms)
      if (opacity === 0) expect(log.alpha).toEqual([])
      else expect(log.alpha[0]).toBeCloseTo(ACTIVATE_GLOW.alpha * opacity, 2)
      if (opacity > 0) {
        // Su tamaño (el ancho de la capa de la mesa) y su color.
        expect(log.radii[0]).toBeCloseTo(parseFloat(glow.el.style.width) / 2)
        expect(log.stops[0]).toBe(fakeAssets.theme.fx.energia)
      }
    }
  })

  it('destruir o desterrar: la onda crece lineal como la `scale` de la mesa, con su alfa, del color que la mesa le pone (cian lo destruido, ámbar el destierro) y en 500 ms', () => {
    for (const rgb of [FX_RGB.cyan, FX_RGB.amber]) {
      calls.length = 0
      leaveAt(100, 100, 48, rgb)
      const wave = calls.find((call) => call.el.className.includes('--fx-rgb'))!
      expect((wave.el.parentElement as HTMLElement).style.getPropertyValue('--fx-rgb')).toBe(rgb)
      const overlay = leaveOverlay(100, 100, 48, rgb, 900, 1.25)
      expect(overlay).toMatchObject({ kind: 'leave', start: 900 })
      expect(overlay.duration).toBeCloseTo(LEAVE.ms / 1.25)
      expect(wave.options.duration).toBe(LEAVE.ms)
      for (const ms of [0, 15, LEAVE.peak * LEAVE.ms, 100, 250, 400, 499]) {
        const { ctx, log } = probe()
        overlay.draw(ctx, ms / LEAVE.ms)
        // Los arcos de `twinRing`: la gemela oscura y, después, el aro de color (el de la mesa mide su `width` de ancho).
        expect(log.radii.at(-1)).toBeCloseTo((parseFloat(wave.el.style.width) / 2) * valueAt(wave.frames, 'scale', ms / LEAVE.ms), 1)
        expect(log.alpha[0]).toBeCloseTo(valueAt(wave.frames, 'opacity', ms / LEAVE.ms), 2)
        expect(log.strokes).toContain(`rgb(${rgb} / 1)`)
      }
    }
    // En una pantalla chica no pasa de su diagonal, como la mesa.
    const { ctx, log } = probe()
    leaveOverlay(0, 0, 400, FX_RGB.cyan, 0, 1).draw(ctx, 1)
    expect(log.radii.at(-1)).toBeCloseTo(Math.hypot(720, 1280) / 2)
  })

  it('la pila que suelta una carta: se vuelve a pintar de 1 a 1,1 y de vuelta en 80 ms, con la curva y los cuadros de la mesa; antes y después, nada', () => {
    const pile = document.body.appendChild(document.createElement('div'))
    popPile(pile)
    const [pop] = calls
    expect(pop!.options).toMatchObject({ duration: PILE_POP.ms, easing: EASE_OUT })
    expect(pop!.frames.map((frame) => frame.scale)).toEqual(['1', `${PILE_POP.scale}`, '1'])
    const rect = { x: 40, y: 600, w: 80, h: 116 }
    const overlay = popOverlay(rect, 1500, 2)
    expect(overlay).toMatchObject({ kind: 'pop', start: 1500 })
    expect(overlay.duration).toBeCloseTo(PILE_POP.ms / 2)
    const ease = bezierEase(EASE_OUT)
    for (const ms of [0, 8, 16, 24, 40, 56, 72, 80]) {
      const { ctx, log } = probe()
      overlay.draw(ctx, ms / PILE_POP.ms)
      const scale = valueAt(pop!.frames, 'scale', ease(ms / PILE_POP.ms))
      if (scale <= 1.0001) expect(log.copies).toEqual([])
      else {
        // Copia la casilla entera, agrandada desde su centro.
        const [sx, sy, sw, sh, dx, dy, dw, dh] = log.copies[0]!
        expect([sx, sy, sw, sh]).toEqual([rect.x, rect.y, rect.w, rect.h])
        expect(dw! / rect.w).toBeCloseTo(scale, 3)
        expect(dh! / rect.h).toBeCloseTo(scale, 3)
        expect([dx! + dw! / 2, dy! + dh! / 2]).toEqual([rect.x + rect.w / 2, rect.y + rect.h / 2])
      }
    }
  })
})
