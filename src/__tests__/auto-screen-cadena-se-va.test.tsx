// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAIN_ALONE_MS, CHAIN_LINGER_MS, CHAIN_LINK_MS, type ChainStep } from '../app/auto/chain-feed'
import { core, renderAuto } from './support/auto-screen-harness'
import { fakeSession } from './support/auto-session-fake'

// Una activación sola, aunque nadie pueda responder (Gastón: «aun así se muestra la animación»): entra con su «1», va al centro con lo que hizo y se va; 1,2 s y, terminada, lo que
// tarda en irse (`CHAIN_LINGER_MS`). En escritorio el detalle de la izquierda muestra la carta del eslabón.

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') || query.includes('1101'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

const stage = () => screen.queryByTestId('chain-notice')
const pose = () => [...document.querySelectorAll<HTMLElement>('[data-chain-card]')].map((card) => `${card.dataset.chainCard}:${card.dataset.pose}`)

describe('auto-screen · una activación sola', () => {
  it('entra con su «1», se resuelve en el centro, se va a los 1,2 s y la escena se cierra', () => {
    const fake = renderAuto(fakeSession())
    const mine = { card: { side: 'mine' as const, id: 'card-200-1' }, code: 200 }
    const steps: ChainStep[] = [
      { kind: 'chain', at: 0, index: 0, link: { ...mine, mine: true } },
      { kind: 'solving', at: 0, index: 0 },
      { kind: 'solved', at: 0, index: 0 },
      { kind: 'end', at: 0, index: -1 },
    ]

    core(() => fake.set({ chainSteps: steps }))
    act(() => vi.advanceTimersByTime(0))
    expect(pose()).toEqual(['1:slot'])
    expect(within(stage()!).getByRole('status')).toHaveTextContent('Se resuelve del último al primero')
    expect(within(screen.getByRole('region', { name: 'Detalle de la carta', hidden: true })).getByRole('heading', { name: 'Maxx C', hidden: true })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS + 1))
    expect(pose()).toEqual(['1:center'])
    expect(within(stage()!).getByRole('status')).toHaveTextContent('Maxx C: Resuelta')

    act(() => vi.advanceTimersByTime(CHAIN_ALONE_MS - CHAIN_LINK_MS))
    expect(pose()).toEqual(['1:out'])
    act(() => vi.advanceTimersByTime(CHAIN_LINGER_MS - 100))
    expect(stage()).not.toBeNull()
    act(() => vi.advanceTimersByTime(200))
    expect(stage()).toBeNull()
  })
})
