// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import type { CardRef } from '../app/auto/adapter'
import { CHAIN_LINK_MS, CHAIN_SOLVE_MS, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { pos } from './support/auto-session-fake'
import { core, lane, renderAuto } from './support/auto-screen-harness'

// La negación («Sin efecto · por CL2»: en la píldora, en la pila y sobre la carta) y varias obligatorias a la vez (se elige cuál va primero).

const link = (index: number, card: CardRef): ChainStep => ({ kind: 'chain', at: 0, index, link: { card, code: 1, mine: card.side === 'mine', from: L.MZONE } })
const step = (kind: ChainStep['kind'], index: number, by?: number): ChainStep => ({ kind, at: 0, index, ...(by ? { by } : {}) })

describe('auto-screen · la cadena negada', () => {
  it('Maxx C (CL1) queda sin efecto por el CL2 del rival: la píldora, la pila y la carta dicen «Sin efecto · por CL2», sin moverla', () => {
    const fake = renderAuto()
    const cell = () => document.querySelector('[data-card-id="card-200-1"]')!.parentElement!

    core(() => fake.set({ chainSteps: [link(0, { side: 'mine', id: 'card-200-1' }), link(1, { side: 'theirs', id: 'c1' }), step('solving', 1), step('disabled', 0, 2)] }))
    // Los pasos se muestran de a uno, con su ritmo.
    act(() => vi.advanceTimersByTime(0))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    const before = cell().getBoundingClientRect()

    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(within(screen.getByTestId('chain-notice')).getByRole('status')).toHaveTextContent('Sin efecto · por CL2 · CL1 · Vos')
    // Sobre la carta: la insignia tachada y la franja roja con texto blanco; el nombre lo dice.
    expect(cell().querySelector('[data-chain-link]')).toHaveClass('line-through')
    expect(cell().querySelector('[data-chain-void]')).toHaveTextContent('Sin efecto · por CL2')
    expect(cell().querySelector('[data-chain-void]')).toHaveClass('bg-danger', 'text-white', 'pointer-events-none')
    expect(screen.getByRole('button', { name: 'Maxx C, eslabón 1 de la cadena. Sin efecto · por CL2' })).toBeInTheDocument()
    expect(cell().getBoundingClientRect()).toEqual(before)
    // La pila: la fila de la carta negada.
    fireEvent.click(within(screen.getByTestId('chain-notice')).getByRole('button', { name: 'Ver la cadena' }))
    expect(screen.getByRole('button', { name: 'Eslabón 1: Carta, tuyo. Sin efecto · por CL2' })).toBeInTheDocument()
  })

  it('sin `by` (no se sabe quién fue): sólo «Sin efecto», y la marca sin «por»', () => {
    const fake = renderAuto()

    core(() => fake.set({ chainSteps: [link(0, { side: 'mine', id: 'card-200-1' }), step('solving', 0), step('disabled', 0)] }))
    act(() => vi.advanceTimersByTime(0))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(within(screen.getByTestId('chain-notice')).getByRole('status')).toHaveTextContent('Sin efecto · CL1 · Vos')
    expect(document.querySelector('[data-chain-void]')).toHaveTextContent(/^Sin efecto$/)
  })
})

describe('auto-screen · varias obligatorias', () => {
  const FORCED: CoreAsk = {
    type: 'select_chain',
    player: 0,
    spe_count: 2,
    forced: true,
    hint_timing: 0,
    hint_timing_other: 0,
    selects: [
      { ...pos(900, L.HAND, 1, 10), description: '0', client_mode: 0 },
      { ...pos(100, L.HAND, 0, 10), description: '0', client_mode: 0 },
    ],
  }

  it('una banda en el medio: cuál va primero (CL1), la primera ya elegida, sin «No responder»; tocar otra la cambia y la principal la activa', () => {
    const fake = renderAuto()

    core(() => fake.ask(FORCED))
    const band = screen.getByRole('group', { name: 'Tenés que activar estas 2. ¿Cuál va primero (CL1)?' })

    // La línea de «Tenés que activar X: tocala» es para una sola.
    expect(lane()).toBeNull()
    expect(band).toHaveTextContent('Sin «No responder»: son obligatorias.')
    expect(within(band).queryByRole('button', { name: 'No responder' })).toBeNull()
    expect(within(band).getByRole('button', { name: 'Activar Called by the Grave primero' })).toBeEnabled()
    fireEvent.click(within(band).getByRole('option', { name: /Ash Blossom/ }))
    fireEvent.click(within(band).getByRole('button', { name: 'Activar Ash Blossom primero' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: 1 }])
  })

  it('una sola obligatoria: la línea de siempre, sin banda', () => {
    const fake = renderAuto()

    core(() => fake.ask({ ...FORCED, selects: FORCED.selects.slice(0, 1) }))
    expect(lane()).toHaveTextContent('Tenés que activar Called by the Grave: tocala')
    expect(screen.queryByRole('group', { name: /¿Cuál va primero/ })).toBeNull()
  })
})
