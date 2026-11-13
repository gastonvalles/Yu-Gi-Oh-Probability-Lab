// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { CHAIN_LINGER_MS, CHAIN_LINK_MS, CHAIN_SOLVE_MS, chainDwell, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION as L } from '../app/auto/protocol'
import type { ReplayChainStep } from '../app/duel-replay'
import { createMatState, type MatAction, type MatPhase } from '../app/practice-mat'
import { comboChainSteps, createSavedCombo, writeSavedCombos } from '../app/saved-combos'
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

  const LONE: ReplayChainStep[] = [
    { at: 1, kind: 'chain', index: 0, link: { code: 102, side: 0, place: [0, L.SZONE, 0] } },
    { at: 1, kind: 'solving', index: 0 },
    { at: 1, kind: 'solved', index: 0 },
    { at: 1, kind: 'end', index: -1 },
  ]
  // Con dos eslabones la cadena dura más que los 1400 entre jugadas: el pedido del paso siguiente llega en el medio y espera.
  const TWO: ReplayChainStep[] = [
    LONE[0]!,
    { at: 1, kind: 'chain', index: 1, link: { code: 101, side: 1 } },
    { at: 1, kind: 'solving', index: 1 },
    { at: 1, kind: 'solved', index: 1 },
    ...LONE.slice(1),
  ]

  it.each([['sola', LONE], ['de dos eslabones', TWO]] as const)('reproduciendo solo un combo con su cadena (%s), el paso siguiente espera a que la cadena se cuente entera y después lo suyo', (_, chain) => {
    const nameOf = (id: string) => CARDS.get(id)?.name ?? id
    const combo = createSavedCombo({ name: 'Imperm', deckName: 'Test', initial: createMatState(['card-102-1', 'card-100-1'], [], 2), actions: [{ type: 'activate', id: 'card-102-1' }, to('battle')], nameOf }, [])
    const steps = comboChainSteps({ chain: [...chain] })
    const told = steps.reduce((sum, _step, i) => sum + chainDwell(steps, i), 0)
    const current = () => screen.getAllByRole('slider')[0]?.getAttribute('aria-valuenow')
    // De a poco: cada mensaje rearma los relojes al dibujarse.
    const walk = (ms: number) => {
      for (let left = ms; left > 0; left -= 50) act(() => vi.advanceTimersByTime(Math.min(50, left)))
    }

    writeSavedCombos([{ ...combo, chain: [...chain] }])
    dueled()
    fireEvent.click(within(panel()).getByRole('radio', { name: /Combos/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Imperm' }))
    act(() => vi.advanceTimersByTime(1400))
    expect(current()).toBe('1')
    expect(scene()).toBe(1)
    // No a los 1400 de siempre: lo que dura la cadena (hasta que se va) y, desde ahí, los 1400.
    walk(told + CHAIN_LINGER_MS + 1400 - 100)
    expect(current()).toBe('1')
    walk(200)
    expect(current()).toBe('2')
  })
})
