// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { LOCATION as L } from '../app/auto/protocol'
import { NO_TALLY, type Tally } from '../app/auto/tally'
import { SPOTS, fakeSession } from './support/auto-session-fake'
import { core, handCard, renderAuto } from './support/auto-screen-harness'

// Lo que cuentan las cartas (`tally.ts`) en la mesa: el número sobre la carta, de los dos lados, y en su nombre; Nibiru, sobre tu mano.
const SHATRANGA = 42410161
const NIBIRU = 27204311
/** Tu Shatranga en tu Mágicas y Trampas 3 (la carta de la mesa falsa es «Called by the Grave»), la del rival en su 2 y Nibiru en tu mano («Ash Blossom»). */
const spots = [
  ...SPOTS.filter((spot) => spot.id !== 'card-900-1' && spot.id !== 'card-100-1'),
  { side: 'mine' as const, id: 'card-900-1', code: SHATRANGA, location: L.SZONE, sequence: 2, pos: 'atk' as const },
  { side: 'mine' as const, id: 'card-100-1', code: NIBIRU, location: L.HAND, sequence: 0 },
  { side: 'theirs' as const, id: 'c2', code: SHATRANGA, location: L.SZONE, sequence: 1, pos: 'atk' as const },
]
const tally = (effects: { mine: number; theirs: number }, summons: { mine: number; theirs: number }): Tally => ({ ...NO_TALLY, turn: { effects, summons }, since: { 'mine card-900-1': 0, 'theirs c2': 0 } })
const chips = () => [...document.querySelectorAll<HTMLElement>('[data-tally]')].map((chip) => `${chip.dataset.tally}${chip.dataset.tallyReached === 'true' ? '!' : ''}`).sort()

describe('auto-screen · lo que cuentan las cartas', () => {
  it('Shatranga lleva el número de los efectos del rival en tu campo y en el suyo (cada una cuenta lo del otro), y Nibiru el de sus Invocaciones en tu mano; en el umbral se marca', () => {
    const fake = renderAuto(fakeSession(spots))

    core(() => fake.set({ overlay: { ...fake.getSnapshot().overlay, tally: tally({ mine: 1, theirs: 3 }, { mine: 0, theirs: 2 }) } }))
    // Tu Shatranga: 3 efectos del rival; la suya: 1 tuyo; Nibiru: 2 Invocaciones del rival.
    expect(chips()).toEqual(['1', '2', '3'])
    expect(screen.getByRole('button', { name: 'Called by the Grave. Efectos de monstruo del rival este turno: 3 de 5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Efectos de monstruo del rival este turno: 1 de 5: marcar$/ })).toBeInTheDocument()
    expect(handCard('Ash Blossom. Invocaciones del rival este turno: 2 (se activa con 5)')).toBeInTheDocument()

    core(() => fake.set({ overlay: { ...fake.getSnapshot().overlay, tally: tally({ mine: 1, theirs: 5 }, { mine: 0, theirs: 6 }) } }))
    expect(chips()).toEqual(['1', '5!', '6!'])
    expect(within(handCard('Ash Blossom. Invocaciones del rival este turno: 6 (se activa con 5)')).getByText('6')).toHaveAttribute('data-tally-reached', 'true')

    // Sin nada que contar (el turno nuevo), la carta sigue con su 0.
    core(() => fake.set({ overlay: { ...fake.getSnapshot().overlay, tally: tally({ mine: 0, theirs: 0 }, { mine: 0, theirs: 0 }) } }))
    expect(chips()).toEqual(['0', '0', '0'])
  })

  it('una carta que no cuenta nada no lleva número', () => {
    const fake = renderAuto()

    core(() => fake.set({ overlay: { ...fake.getSnapshot().overlay, tally: tally({ mine: 2, theirs: 2 }, { mine: 2, theirs: 2 }) } }))
    expect(chips()).toEqual([])
  })
})
