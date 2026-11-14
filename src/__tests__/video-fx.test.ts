// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { HITSTOP_MS } from '../app/card-weight'
import { FLASH_MS, HIT_MS, RING_MS, SECOND_AT, SECOND_MS, SHAKES } from '../app/field-impact'
import { DELTA_MS, lifeCountMs } from '../app/life-effects'
import { DEAL_LAND_AT, FIRST_DEAL_MS, NEXT_DEAL_MS } from '../app/deal-flight'
import { DECK_SHUFFLE_MS, HAND_SHUFFLE_MS } from '../app/shuffle-fx'
import { FLIGHT_MS, FLIGHT_STAGGER_MS, LANDING_AT, flightMs as mesaFlightMs } from '../app/use-card-flights'
import { PHASE_BAND_MS, TURN_BAND_MS } from '../components/duel/PhaseBand'
import { IMPACT_MS } from '../components/probability/AttackFx'
import { SPOTLIGHT_TRAVEL_MS, STAGE_TONE as MESA_STAGE_TONE } from '../components/probability/MatFx'
import { flightMs, IMPACT, impactOverlays, lifeMs, MESA, RIFFLE, STAGE_TONE } from '../components/replays/video/video-fx'

// El video copia los tiempos y los colores de la mesa (para no cargarla con React): que sigan siendo los mismos.
describe('el video anima con los tiempos y los colores de la mesa', () => {
  it('vuelos, carta grande, banda de fase, barajado, ataque y vidas', () => {
    expect(MESA).toMatchObject({ flight: FLIGHT_MS, stagger: FLIGHT_STAGGER_MS, landingAt: LANDING_AT, travel: SPOTLIGHT_TRAVEL_MS, shuffle: DECK_SHUFFLE_MS, handShuffle: HAND_SHUFFLE_MS, firstDeal: FIRST_DEAL_MS, nextDeal: NEXT_DEAL_MS, dealLandAt: DEAL_LAND_AT, impact: IMPACT_MS, delta: DELTA_MS, banner: PHASE_BAND_MS, turnBanner: TURN_BAND_MS })
    // Los planes del riffle (copiados de `shuffle-fx.ts`, que no los exporta): que sumen lo mismo que su barajado.
    for (const [plan, total] of [[RIFFLE.deck, DECK_SHUFFLE_MS], [RIFFLE.hand, HAND_SHUFFLE_MS]] as const) expect(plan.openFrom + plan.openSpan + plan.open).toBe(total)
    for (const distance of [0, 120, 300, 600, 900]) expect(flightMs(distance)).toBe(mesaFlightMs(distance))
    for (const delta of [0, -500, 2000, -8000, 12000]) expect(lifeMs(delta)).toBe(lifeCountMs(delta))
  })

  it('el color de la carta grande y del destello de cada jugada', () => {
    expect(STAGE_TONE).toEqual(MESA_STAGE_TONE)
  })

  it('el impacto (`field-impact.ts`): los tiempos del aro, del destello y de la pausa del golpe, sus medidas y la sacudida', () => {
    expect(MESA).toMatchObject({ ring: RING_MS, flash: FLASH_MS, hitstop: HITSTOP_MS })
    expect(IMPACT.shakes).toEqual(SHAKES)
    // Las medidas y los cuadros van en las clases y en `animate` de la mesa: que sigan diciendo lo mismo.
    const source = readFileSync(join(process.cwd(), 'src/app/field-impact.ts'), 'utf8')
    const { ring, flash } = IMPACT
    expect(source).toContain(`size-${ring.size / 4} rounded-full border-${ring.border} border-fx-energia`)
    expect(source).toContain(`{ scale: '${ring.from}', opacity: ${ring.alpha} }, { scale: '${ring.to}', opacity: 0 }`)
    expect(source).toContain(`size-${flash.size / 4} rounded-full bg-radial from-fx-destello/${flash.alpha * 100} to-transparent to-${flash.stop * 100}%`)
    expect(source).toContain(`{ scale: '${flash.from}', opacity: 0 }, { opacity: 1, offset: ${flash.peak} }, { scale: '${flash.to}', opacity: 0 }`)
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
    const theme = { fx: { destello: '#ffcf4a', energia: '#2ee6ff' } } as unknown as Parameters<typeof impactOverlays>[4]
    const light = impactOverlays(10, 10, 'light', 1, theme, 1000, 1050, 1.25, true)
    const strong = impactOverlays(10, 10, 'strong', 1, theme, 1000, 1050, 1.25, true)
    const summon = impactOverlays(10, 10, 'light', 1, theme, 1000, 1000, 1.25)
    const impact = (list: typeof light) => list.find((overlay) => overlay.kind === 'impact')!

    // Lo que dura: el golpe hasta que se apaga la segunda onda (a los 200 ms, `SECOND_MS`), a 1,25×.
    expect(impact(light).duration).toBeCloseTo(Math.max(HIT_MS, SECOND_AT + SECOND_MS) / 1.25)
    expect(impact(strong).duration).toBe(impact(light).duration)
    expect(impact(summon).duration).toBeCloseTo(Math.max(RING_MS, FLASH_MS) / 1.25)
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
})
