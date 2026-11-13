// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L } from '../app/auto/protocol'
import { createMatState, type MatAction } from '../app/practice-mat'
import { createSavedCombo, writeSavedCombos } from '../app/saved-combos'
import { CARDS, fakeSession, SPOTS } from './support/auto-session-fake'
import { core, renderAuto } from './support/auto-screen-harness'

// Repasar un combo grabado en «Jugar solo automático» que le dio una carta al rival: su campo se ve con esa carta, en el paso en que la recibe.

vi.mock('../app/lab-odds-client', () => ({ requestLabOdds: vi.fn(() => new Promise(() => {})) }))

const nameOf = (id: string) => CARDS.get(id)?.name ?? id
const GIVE: MatAction = { type: 'give', id: 'card-101-1', auto: true }
const given = () => document.querySelector('[data-rival-card-id="f.card-101-1"]')
const panel = () => screen.getByRole('region', { name: 'Pasos y combos' })

function dueled() {
  const fake = renderAuto(fakeSession(SPOTS.map((spot) => (spot.side === 'mine' && spot.location === L.HAND ? { ...spot, location: L.DECK, sequence: 10 + spot.sequence } : spot))))
  const { initial } = fake.getSnapshot()

  core(() => fake.set({ initial: { mine: { ...initial.mine, phase: 'main1' }, theirs: initial.theirs }, mineActions: [], status: 'ready', replaying: false }))
  return fake
}

describe('auto-screen · el combo con el campo del rival', () => {
  it('la carta que le diste aparece en su zona en el paso en que la toma, boca arriba con su arte; un combo sin rival deja su lado vacío', () => {
    const theirs = { initial: createMatState(['c1', 'c2'], [], 0), reveal: {}, steps: [[1, { type: 'take', id: 'f.card-101-1', zone: 'mz', index: 2, pos: 'atk' }]] as [number, MatAction][] }
    writeSavedCombos([
      createSavedCombo({ name: 'Kaiju', deckName: 'Test', initial: createMatState(['card-101-1', 'card-100-1'], [], 2), actions: [GIVE], nameOf, auto: true, extras: { theirs } }, []),
      createSavedCombo({ name: 'Sin rival', deckName: 'Test', initial: createMatState(['card-101-1', 'card-100-1'], [], 2), actions: [GIVE], nameOf }, []),
    ])
    dueled()
    fireEvent.click(within(panel()).getByRole('radio', { name: /Combos/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Kaiju' }))
    expect(given()).toBeNull()
    act(() => vi.advanceTimersByTime(1400 + 5))
    expect(given()).not.toBeNull()
    // Boca arriba: con el arte de tu carta (no el dorso), en su Zona de monstruo 3.
    expect(given()!.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/101.jpg'))
    expect(given()!.querySelector('img')).toHaveAttribute('alt', 'Rival, Zona de monstruo 3')

    fireEvent.click(screen.getByRole('button', { name: 'Volver al duelo' }))
    fireEvent.click(within(panel()).getByRole('radio', { name: /Combos/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Sin rival' }))
    act(() => vi.advanceTimersByTime(1400 + 5))
    expect(given()).toBeNull()
  })

  it('con la cadena guardada, el paso de la activación arma la escena de la cadena (como en vivo y en el replay de un duelo); sin ella, la carta grande', () => {
    const chain = [
      { at: 1, kind: 'chain' as const, index: 0, link: { code: 102, side: 0 as const, place: [0, L.SZONE, 0] as [0, number, number] } },
      { at: 1, kind: 'solving' as const, index: 0 },
      { at: 1, kind: 'solved' as const, index: 0 },
      { at: 1, kind: 'end' as const, index: -1 },
    ]
    writeSavedCombos([createSavedCombo({ name: 'Imperm', deckName: 'Test', initial: createMatState(['card-102-1', 'card-100-1'], [], 2), actions: [{ type: 'activate', id: 'card-102-1' }], nameOf, auto: true, extras: { chain } }, [])])
    dueled()
    fireEvent.click(within(panel()).getByRole('radio', { name: /Combos/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Imperm' }))
    expect(document.querySelectorAll('[data-chain-card]')).toHaveLength(0)
    act(() => vi.advanceTimersByTime(1400 + 5))
    expect(document.querySelectorAll('[data-chain-card]')).toHaveLength(1)
  })
})
