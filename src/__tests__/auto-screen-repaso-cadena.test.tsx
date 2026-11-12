// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { CHAIN_LINGER_MS, CHAIN_LINK_MS, CHAIN_SOLVE_MS, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION as L } from '../app/auto/protocol'
import { createMatState, type MatAction, type MatPhase } from '../app/practice-mat'
import { createSavedCombo, writeSavedCombos } from '../app/saved-combos'
import { CARDS, fakeSession, SPOTS } from './support/auto-session-fake'
import { core, renderAuto } from './support/auto-screen-harness'

// El repaso de «Jugar solo»: un paso adelante muestra la cadena de ese paso como en vivo (la escena y los medallones, con su ritmo); saltar la corta; un combo guardado, que no trae
// cadena, muestra la carta grande del centro.

vi.mock('../app/lab-odds-client', () => ({ requestLabOdds: vi.fn(() => new Promise(() => {})) }))

const to = (phase: MatPhase): MatAction => ({ type: 'phase', phase })
const OPENING: MatAction = { type: 'draw', count: 2, ids: ['card-100-1', 'card-900-1'] }
// El paso 3 del repaso (4 jugadas contando la mano de apertura): Called by the Grave y, encadenado, el rival; después la Battle Phase (el último paso es «ahora»: vuelve al duelo).
const ACTIONS: MatAction[] = [OPENING, to('standby'), to('main1'), { type: 'activate', id: 'card-900-1' }, to('battle')]
const STEPS: ChainStep[] = [
  { kind: 'chain', at: 4, index: 0, link: { card: { side: 'mine', id: 'card-900-1' }, code: 900, mine: true, place: { side: 'mine', location: L.SZONE, sequence: 0 } } },
  { kind: 'chain', at: 4, index: 1, link: { card: { side: 'theirs', id: 'c1' }, code: 101, mine: false } },
  { kind: 'solving', at: 4, index: 1 },
  { kind: 'solved', at: 4, index: 1 },
  { kind: 'solving', at: 4, index: 0 },
  { kind: 'solved', at: 4, index: 0 },
  { kind: 'end', at: 4, index: -1 },
]

const scene = () => document.querySelectorAll('[data-chain-card]').length
const medals = () => document.querySelectorAll('[data-chain-medal]').length
const panel = () => screen.getByRole('region', { name: 'Pasos y combos' })
const tapStep = (n: number) => {
  fireEvent.click(within(panel()).getByRole('button', { name: new RegExp(`^${n}`) }))
  act(() => vi.advanceTimersByTime(0))
}

/** El duelo rearmado con la cadena ya contada (la mano de apertura en el deck, como la reparte el núcleo): en vivo no queda nada de ella a la vista. */
function dueled() {
  const fake = renderAuto(fakeSession(SPOTS.map((spot) => (spot.side === 'mine' && spot.location === L.HAND ? { ...spot, location: L.DECK, sequence: 10 + spot.sequence } : spot))))
  const { initial } = fake.getSnapshot()

  core(() => fake.set({ initial: { mine: { ...initial.mine, phase: 'draw' }, theirs: initial.theirs }, mineActions: ACTIONS, chainSteps: STEPS, status: 'ready', replaying: false }))
  act(() => vi.advanceTimersByTime(CHAIN_LINGER_MS))
  expect(scene()).toBe(0)
  return fake
}

describe('auto-screen · la cadena en el repaso', () => {
  it('un paso adelante arma la cadena de ese paso con su ritmo (lo del rival en la misma escena), la resuelve con los medallones y se va', () => {
    dueled()
    tapStep(2)
    expect(scene()).toBe(0)
    tapStep(3)
    expect(scene()).toBe(1)
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    expect(scene()).toBe(2)
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    // Se resuelve del último al primero (el del rival, en la escena: su lado del repaso está vacío): el CL1 espera con su medallón donde se activó, y después late.
    expect(document.querySelector('[data-chain-medal="1"]')).not.toHaveAttribute('data-resolving')
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(document.querySelector('[data-chain-medal="1"]')).toHaveAttribute('data-resolving')
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    act(() => vi.advanceTimersByTime(CHAIN_LINGER_MS))
    expect(scene()).toBe(0)
    expect(medals()).toBe(0)
    expect(screen.queryByTestId('chain-notice')).toBeNull()
  })

  it('saltar pasos corta la escena: hacia atrás o hacia adelante, no sale nada', () => {
    dueled()
    tapStep(2)
    tapStep(3)
    expect(scene()).toBe(1)
    tapStep(1)
    act(() => vi.advanceTimersByTime(CHAIN_LINGER_MS))
    expect(scene()).toBe(0)
    tapStep(3)
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS * 2))
    expect(scene()).toBe(0)
    expect(medals()).toBe(0)
  })

  it('un combo guardado no trae cadena: la carta que se activa sale grande al centro', () => {
    const nameOf = (id: string) => CARDS.get(id)?.name ?? id

    writeSavedCombos([createSavedCombo({ name: 'Imperm', deckName: 'Test', initial: createMatState(['card-102-1', 'card-100-1'], [], 2), actions: [{ type: 'activate', id: 'card-102-1' }], nameOf }, [])])
    dueled()
    fireEvent.click(within(panel()).getByRole('radio', { name: /Combos/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Imperm' }))
    act(() => vi.advanceTimersByTime(1400 + 5))
    expect(document.querySelector('[data-activation][data-kind="activate"]')).not.toBeNull()
    expect(scene()).toBe(0)
  })
})
