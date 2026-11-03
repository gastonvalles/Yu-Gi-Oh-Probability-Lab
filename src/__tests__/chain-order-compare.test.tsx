// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import { ChainOrderCompare, type ChainOrderScenario } from '../components/auto/ChainOrderCompare'

// Dos órdenes de la misma cadena: el veredicto escrito (no sólo el color), la pila en el orden en que se resuelve y el nombre entero de cada eslabón.

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const VEILER = { name: 'Effect Veiler', art: null, effect: 'Niega los efectos de 1 monstruo' }
const RIVAL = { name: 'Monstruo de ejemplo', art: null, effect: 'Efecto Rápido: añade 1 carta' }
const SCENARIOS: ChainOrderScenario[] = [
  {
    letter: 'A',
    title: 'Esperá',
    good: true,
    links: [
      { number: 1, who: 'Rival', mine: false, ...RIVAL, state: 'disabled', by: 2 },
      { number: 2, who: 'Vos', mine: true, ...VEILER, state: 'solved' },
    ],
  },
  {
    letter: 'B',
    title: 'No dispares primero',
    good: false,
    links: [
      { number: 1, who: 'Vos', mine: true, ...VEILER, state: 'solved', outcome: { label: 'Llega tarde', tone: 'warning' }, idle: true },
      { number: 2, who: 'Rival', mine: false, ...RIVAL, state: 'solved', outcome: { label: 'Añade 1 carta', tone: 'success' } },
    ],
  },
]

describe('ChainOrderCompare', () => {
  it('dice cada veredicto con texto, apila en el orden en que se resuelve y nombra entero cada eslabón', () => {
    render(
      <Provider store={store}>
        <ChainOrderCompare scenarios={SCENARIOS} />
      </Provider>,
    )

    const good = screen.getByRole('region', { name: 'A · Esperá. Sale bien' })
    const bad = screen.getByRole('region', { name: 'B · No dispares primero. Sale mal' })
    expect(within(good).getByText('Sale bien')).toBeInTheDocument()
    expect(within(bad).getByText('Sale mal')).toBeInTheDocument()

    // El último eslabón arriba: CL2 resuelve primero.
    const order = (region: HTMLElement) => within(region).getAllByRole('listitem').map((item) => item.querySelector('.sr-only')?.textContent)
    expect(order(good)).toEqual(['Eslabón 2: Effect Veiler, tuyo. Resuelta', 'Eslabón 1: Monstruo de ejemplo, del rival. Sin efecto · por CL2'])
    expect(order(bad)).toEqual(['Eslabón 2: Monstruo de ejemplo, del rival. Añade 1 carta', 'Eslabón 1: Effect Veiler, tuyo. Llega tarde'])
    // La línea del efecto se ve (sólo en esta pieza).
    expect(within(good).getByText('Efecto Rápido: añade 1 carta')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Repetir' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })
})
