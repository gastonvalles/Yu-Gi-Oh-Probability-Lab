// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DELTA_MS, lifeCountMs } from '../app/life-effects'
import { DEAL_LAND_AT, FIRST_DEAL_MS, NEXT_DEAL_MS } from '../app/deal-flight'
import { DECK_SHUFFLE_MS, HAND_SHUFFLE_MS } from '../app/shuffle-fx'
import { FLIGHT_MS, FLIGHT_STAGGER_MS, LANDING_AT, flightMs as mesaFlightMs } from '../app/use-card-flights'
import { IMPACT_MS } from '../components/probability/AttackFx'
import { SPOTLIGHT_TRAVEL_MS, STAGE_TONE as MESA_STAGE_TONE } from '../components/probability/MatFx'
import { flightMs, lifeMs, MESA, RIFFLE, STAGE_TONE } from '../components/replays/video/video-fx'

// El video copia los tiempos y los colores de la mesa (para no cargarla con React): que sigan siendo los mismos.
describe('el video anima con los tiempos y los colores de la mesa', () => {
  it('vuelos, carta grande, barajado, ataque y vidas', () => {
    expect(MESA).toMatchObject({ flight: FLIGHT_MS, stagger: FLIGHT_STAGGER_MS, landingAt: LANDING_AT, travel: SPOTLIGHT_TRAVEL_MS, shuffle: DECK_SHUFFLE_MS, handShuffle: HAND_SHUFFLE_MS, firstDeal: FIRST_DEAL_MS, nextDeal: NEXT_DEAL_MS, dealLandAt: DEAL_LAND_AT, impact: IMPACT_MS, delta: DELTA_MS })
    // Los planes del riffle (copiados de `shuffle-fx.ts`, que no los exporta): que sumen lo mismo que su barajado.
    for (const [plan, total] of [[RIFFLE.deck, DECK_SHUFFLE_MS], [RIFFLE.hand, HAND_SHUFFLE_MS]] as const) expect(plan.openFrom + plan.openSpan + plan.open).toBe(total)
    for (const distance of [0, 120, 300, 600, 900]) expect(flightMs(distance)).toBe(mesaFlightMs(distance))
    for (const delta of [0, -500, 2000, -8000, 12000]) expect(lifeMs(delta)).toBe(lifeCountMs(delta))
  })

  it('el color de la carta grande y del destello de cada jugada', () => {
    expect(STAGE_TONE).toEqual(MESA_STAGE_TONE)
  })
})
