// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import type { CardRef } from '../app/auto/adapter'
import { CHAIN_LINK_MS, CHAIN_SOLVE_MS, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION as L } from '../app/auto/protocol'
import { core, handCard, renderAuto } from './support/auto-screen-harness'

// Los medallones de la cadena, sólo al resolver y en el lugar donde se activó cada eslabón (la casilla, la mano, la pila), del color de quien lo activó; el que se resuelve late y se
// van del último al primero. Mientras se arma, lo dice la escena (y el nombre de cada carta).

const link = (index: number, card: CardRef, location: number, sequence = 0): ChainStep => ({ kind: 'chain', at: 0, index, link: { card, code: 1, mine: card.side === 'mine', from: location, place: { side: card.side, location, sequence } } })
const step = (kind: ChainStep['kind'], index: number): ChainStep => ({ kind, at: 0, index })
const badges = () => [...document.querySelectorAll<HTMLElement>('[data-chain-link]')].map((badge) => `${badge.dataset.chainLink}:${badge.dataset.chainOwner}`)
const resolving = () => document.querySelector('[data-chain-medal][data-resolving]')?.getAttribute('data-chain-medal') ?? null

describe('auto-screen · los medallones de la cadena', () => {
  it('al resolver, cada eslabón lleva su medallón donde se activó (campo, mano y Cementerio, de los dos lados); se van del último al primero', () => {
    const fake = renderAuto()
    const chain = [
      link(0, { side: 'mine', id: 'card-200-1' }, L.MZONE, 0),
      link(1, { side: 'theirs', id: 'c1' }, L.MZONE, 0),
      link(2, { side: 'mine', id: 'card-100-1' }, L.HAND),
      link(3, { side: 'mine', id: 'card-400-1' }, L.GRAVE),
    ]

    core(() => fake.set({ chainSteps: chain }))
    // El aviso suma un eslabón por vez, a su ritmo. Mientras se arma, sin medallones (lo dice la escena); el nombre de cada carta, sí.
    for (let i = 0; i < chain.length; i += 1) act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    expect(badges()).toEqual([])
    expect(screen.getByRole('button', { name: 'Maxx C, eslabón 1 de la cadena' })).toBeInTheDocument()
    expect(handCard('Ash Blossom, eslabón 3 de la cadena, activada desde la mano')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GY: 1, eslabón 4 de la cadena' })).toBeInTheDocument()

    // Se resuelve, del último al primero: el medallón del que se resuelve late y, al empezar el siguiente, se va.
    core(() => fake.set({ chainSteps: [...chain, step('solving', 3), step('solved', 3), step('solving', 2), step('solved', 2), step('solving', 1), step('solved', 1), step('solving', 0), step('solved', 0), step('end', -1)] }))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    // En su lugar: la casilla del campo, la mano (sobre la mano) y la pila; sin atajar toques ni leerse.
    expect(badges().sort()).toEqual(['1:mine', '2:theirs', '3:mine', '4:mine'])
    const medalAt = (selector: string) => document.querySelector(selector)?.querySelector('[data-chain-link]')?.getAttribute('data-chain-link')
    expect(medalAt('[data-drop="mz:0"]')).toBe('1')
    expect(medalAt('[aria-label="Mano"] [data-hand-links]') ?? medalAt('[data-hand-links]')).toBe('3')
    expect(medalAt('[data-drop="gy"]')).toBe('4')
    expect(document.querySelector('[data-rival-card-id="c1"]')!.closest('[data-rival-drop], [role="group"]')!.querySelector('[data-chain-link]')).toHaveTextContent('2')
    expect(document.querySelector('[data-drop="mz:0"] [data-chain-link]')).toHaveClass('pointer-events-none', 'inset-0')
    expect(document.querySelector('[data-drop="mz:0"] [data-chain-link]')).toHaveAttribute('aria-hidden', 'true')
    const seen: string[] = [`${badges().length}:${resolving()}`]

    for (let i = 0; i < 14; i += 1) {
      act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS / 3))
      const now = `${badges().length}:${resolving() ?? '-'}`

      if (seen.at(-1) !== now) seen.push(now)
    }
    expect(seen).toEqual(['4:4', '3:3', '2:2', '1:1', '0:-'])
    for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(screen.queryByTestId('chain-notice')).toBeNull()
    expect(badges()).toEqual([])
    expect(screen.getByRole('button', { name: 'Maxx C' })).toBeInTheDocument()
  })
})
