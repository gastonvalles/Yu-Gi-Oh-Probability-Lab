// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import type { CardRef } from '../app/auto/adapter'
import { CHAIN_LINK_MS, CHAIN_SOLVE_MS, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { pos } from './support/auto-session-fake'
import { core, handCard, lane, renderAuto } from './support/auto-screen-harness'

// La negación («Sin efecto · por CL2» en la pila y en el nombre de la carta, también en la píldora, sin nombres; la carta, gris y latiendo) y varias obligatorias a la vez (se elige cuál va primero).

const link = (index: number, card: CardRef, from: number = L.MZONE): ChainStep => ({ kind: 'chain', at: 0, index, link: { card, code: 1, mine: card.side === 'mine', from } })
const step = (kind: ChainStep['kind'], index: number, by?: number): ChainStep => ({ kind, at: 0, index, ...(by ? { by } : {}) })
const grayed = () => [...document.querySelectorAll('.grayscale')]

describe('auto-screen · la cadena negada', () => {
  it('Maxx C (CL1) queda sin efecto por el CL2 del rival: la píldora, la pila y el nombre dicen «Sin efecto · por CL2», la carta se ve gris y latiendo, sin moverla, y se va con el aviso', () => {
    const fake = renderAuto()
    const cell = () => document.querySelector('[data-card-id="card-200-1"]')!.parentElement!
    const chain = [link(0, { side: 'mine', id: 'card-200-1' }), link(1, { side: 'theirs', id: 'c1' }), step('solving', 1), step('disabled', 0, 2)]

    core(() => fake.set({ chainSteps: chain }))
    // Los pasos se muestran de a uno, con su ritmo.
    act(() => vi.advanceTimersByTime(0))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    const before = cell().getBoundingClientRect()
    expect(grayed()).toEqual([])

    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(within(screen.getByTestId('chain-notice')).getByRole('status')).toHaveTextContent('Cadena · 2 · Resuelve CL2Sin efecto · por CL2')
    // Sobre la carta: la insignia tachada y el arte gris y latiendo (sólo sin movimiento reducido), sin franja encima; el nombre lo dice.
    expect(cell().querySelector('[data-chain-link]')).toHaveClass('line-through')
    expect(cell().querySelector('[data-chain-link]')).toHaveAttribute('data-chain-void', '2')
    const art = cell().querySelector('[data-card-id] > .grayscale')

    expect(art).toHaveClass('grayscale', 'motion-safe:animate-fx-void')
    expect(art).not.toHaveClass('animate-fx-void')
    expect(grayed()).toEqual([art])
    expect(cell()).not.toHaveTextContent('Sin efecto')
    expect(screen.getByRole('button', { name: 'Maxx C, eslabón 1 de la cadena. Sin efecto · por CL2' })).toBeInTheDocument()
    expect(cell().getBoundingClientRect()).toEqual(before)
    // La pila: la fila de la carta negada.
    fireEvent.click(within(screen.getByTestId('chain-notice')).getByRole('button', { name: 'Ver la cadena' }))
    expect(screen.getByRole('button', { name: 'Eslabón 1: Carta, tuyo. Sin efecto · por CL2' })).toBeInTheDocument()
  })

  it('negada desde la mano o en el Cementerio: el arte de esa carta, gris (sin `by`, el nombre dice sólo «Negada»); se va con el aviso', () => {
    const fake = renderAuto()
    const chain = [link(0, { side: 'mine', id: 'card-100-1' }, L.HAND), link(1, { side: 'mine', id: 'card-400-1' }, L.GRAVE), step('negated', 1), step('negated', 0)]

    core(() => fake.set({ chainSteps: chain }))
    act(() => vi.advanceTimersByTime(0))
    for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(handCard('Ash Blossom, eslabón 1 de la cadena, activada desde la mano. Negada').querySelector('.grayscale')).toHaveClass('motion-safe:animate-fx-void')
    expect(screen.getByRole('button', { name: 'GY: 1, eslabón 2 de la cadena. Negada' }).querySelector('.grayscale')).toHaveClass('motion-safe:animate-fx-void')
    expect(grayed()).toHaveLength(2)

    // Termina la cadena: el gris se va con el aviso y la insignia.
    core(() => fake.set({ chainSteps: [...chain, step('end', -1)] }))
    for (let i = 0; i < 12; i += 1) act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(screen.queryByTestId('chain-notice')).toBeNull()
    expect(grayed()).toEqual([])
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

  it('una banda en el medio: cuál va primero (CL1), la primera ya elegida, sin «No responder»; tocar otra la cambia y la principal la activa con su número («Activar como CL1»)', () => {
    const fake = renderAuto()

    core(() => fake.ask(FORCED))
    const band = screen.getByRole('group', { name: 'Tenés que activar estas 2. ¿Cuál va primero (CL1)?' })

    // La línea de «Tenés que activar la carta que brilla: tocala» es para una sola.
    expect(lane()).toBeNull()
    expect(band).toHaveTextContent('Sin «No responder»: son obligatorias.')
    expect(within(band).queryByRole('button', { name: 'No responder' })).toBeNull()
    expect(within(band).getByRole('button', { name: 'Activar como CL1' })).toBeEnabled()
    fireEvent.click(within(band).getByRole('option', { name: /Ash Blossom/ }))
    fireEvent.click(within(band).getByRole('button', { name: 'Activar como CL1' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: 1 }])
  })

  it('una obligatoria de una carta del rival (la ofrece la pregunta): va en la banda con de dónde es, late en su campo y tocarla la activa', () => {
    const fake = renderAuto()
    const rival = { ...pos(700, L.MZONE, 0, 1, 1), description: '0', client_mode: 1 }

    core(() => fake.ask({ ...FORCED, selects: [FORCED.selects[0]!, rival] }))
    const band = screen.getByRole('group', { name: 'Tenés que activar estas 2. ¿Cuál va primero (CL1)?' })

    expect(within(band).getByRole('option', { name: /Blue-Eyes White Dragon/ })).toHaveTextContent('Rival, Campo')
    fireEvent.click(within(band).getByRole('option', { name: /Blue-Eyes White Dragon/ }))
    fireEvent.click(within(band).getByRole('button', { name: 'Activar como CL1' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: 1 }])

    // Sola: la banda lo dice igual (puede no estar a la vista) y tocarla en su campo también la activa.
    core(() => fake.ask({ ...FORCED, selects: [rival] }))
    expect(screen.getByRole('group', { name: 'Tenés que activar la carta que brilla: tocala' })).toBeInTheDocument()
    expect(document.querySelector('[data-attack-target="true"]')?.getAttribute('data-rival-card-id')).toBe('c1')
    fireEvent.click(screen.getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: 1 }, { type: 'select_chain', index: 0 }])
  })

  it('una sola obligatoria: la línea de siempre, sin banda', () => {
    const fake = renderAuto()

    core(() => fake.ask({ ...FORCED, selects: FORCED.selects.slice(0, 1) }))
    expect(lane()).toHaveTextContent('Tenés que activar la carta que brilla: tocala')
    expect(screen.queryByRole('group', { name: /¿Cuál va primero/ })).toBeNull()
  })
})
