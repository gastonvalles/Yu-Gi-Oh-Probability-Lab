// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAIN_LINK_MS, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { loc } from './support/auto-session-fake'
import { core, handCard, renderAuto } from './support/auto-screen-harness'
import { Harness, render, tap } from './support/practice-mat-harness'

// Escritorio, sólo el duelo automático: el detalle de la izquierda y el panel de la derecha son una sola columna con pestañas «Carta · Cadena · Pasos». La práctica manual sigue con sus dos paneles.

const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [loc(100, L.HAND, 0)], special_summons: [], pos_changes: [], monster_sets: [loc(100, L.HAND, 0)], spell_sets: [], activates: [], to_bp: true, to_ep: true, shuffle: false }
const link = (index: number): ChainStep => ({ kind: 'chain', at: 0, index, link: { card: { side: 'mine', id: 'card-100-1' }, code: 100, mine: true } })

beforeEach(() => {
  const media = window.matchMedia

  window.matchMedia = ((query: string) => ({ ...media(query), matches: query.includes('reduce') || query === '(min-width: 1101px)' })) as typeof window.matchMedia
})

const tab = (name: string) => screen.getByRole('tab', { name })

describe('auto · la columna de escritorio', () => {
  it('es un tablist «Carta · Cadena · Pasos» que abre en los pasos; las flechas, Inicio y Fin cambian de pestaña y sólo se ve la elegida', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    expect(within(screen.getByRole('tablist', { name: 'Panel de la mesa' })).getAllByRole('tab')).toHaveLength(3)
    expect(tab('Pasos')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Pasos' })).toContainElement(screen.getByRole('region', { name: 'Pasos y combos' }))
    // Sin el detalle a la izquierda: el único, en «Carta» (escondida).
    expect(screen.queryByRole('region', { name: 'Detalle de la carta' })).toBeNull()

    fireEvent.keyDown(tab('Pasos'), { key: 'ArrowLeft' })
    expect(tab('Cadena')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Cadena')).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Cadena' })).toHaveTextContent('No hay cadena')
    expect(screen.queryByRole('region', { name: 'Pasos y combos' })).toBeNull()

    fireEvent.keyDown(tab('Cadena'), { key: 'Home' })
    expect(within(screen.getByRole('tabpanel', { name: 'Carta' })).getByRole('region', { name: 'Detalle de la carta' })).toHaveTextContent('Tocá una carta para ver su detalle acá.')
    fireEvent.keyDown(tab('Carta'), { key: 'End' })
    expect(tab('Pasos')).toHaveAttribute('aria-selected', 'true')
  })

  it('tocar una carta pasa a «Carta»: el detalle arriba y su ficha con todas las jugadas al pie; la X la cierra y el detalle queda', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    const panel = screen.getByRole('tabpanel', { name: 'Carta' })
    const sheet = within(panel).getByRole('region', { name: 'Ash Blossom' })

    expect(tab('Carta')).toHaveAttribute('aria-selected', 'true')
    expect(within(sheet).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar'])
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('region', { name: 'Ash Blossom' })).toBeNull()
    expect(within(panel).getByRole('region', { name: 'Detalle de la carta' })).toHaveTextContent('Ash Blossom')
  })

  it('«Cadena» tiene la pila entera (la línea muestra hasta cuatro) y tocar un eslabón lo muestra en «Carta»', () => {
    const fake = renderAuto()

    core(() => fake.set({ chainSteps: [0, 1, 2, 3, 4].map(link) }))
    act(() => vi.advanceTimersByTime(0))
    for (let step = 0; step < 4; step += 1) act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    fireEvent.click(tab('Cadena'))
    const rows = within(screen.getByRole('tabpanel', { name: 'Cadena' })).getAllByRole('button')

    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([5, 4, 3, 2, 1].map((n) => `Eslabón ${n}: Ash Blossom, tuyo. En espera`))
    fireEvent.click(rows[4]!)
    expect(tab('Carta')).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('region', { name: 'Detalle de la carta' })).getByRole('heading', { name: 'Ash Blossom' })).toBeInTheDocument()
  })
})

describe('la práctica manual en escritorio', () => {
  it('conserva sus dos paneles: el detalle a la izquierda y los pasos a la derecha, sin pestañas', () => {
    render(<Harness dock={{ detail: <p>Detalle</p> }} />)

    expect(screen.queryByRole('tablist', { name: 'Panel de la mesa' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Detalle de la carta' })).toHaveTextContent('Detalle')
    expect(screen.getByRole('region', { name: 'Pasos y combos' })).toBeInTheDocument()
  })
})
