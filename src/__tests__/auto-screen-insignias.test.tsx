// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import type { CardRef } from '../app/auto/adapter'
import { CHAIN_LINK_MS, CHAIN_SOLVE_MS, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION as L } from '../app/auto/protocol'
import { core, handCard, renderAuto } from './support/auto-screen-harness'

// El medallón del eslabón sobre cada carta de la cadena, donde se activó: en el campo, en la mano y en una pila; del color de quien la activó. Al resolver, el que se resuelve late y se van del último al primero.

const link = (index: number, card: CardRef, from: number): ChainStep => ({ kind: 'chain', at: 0, index, link: { card, code: 1, mine: card.side === 'mine', from } })
const step = (kind: ChainStep['kind'], index: number): ChainStep => ({ kind, at: 0, index })
const badges = () => [...document.querySelectorAll<HTMLElement>('[data-chain-link]')].map((badge) => `${badge.dataset.chainLink}:${badge.dataset.chainOwner}`)
const resolving = () => document.querySelector('[data-chain-medal][data-resolving]')?.getAttribute('data-chain-medal') ?? null

describe('auto-screen · el medallón del eslabón sobre las cartas', () => {
  it('cada carta de la cadena lleva su medallón (campo, mano y Cementerio, de los dos lados), su nombre lo dice y se van del último al primero', () => {
    const fake = renderAuto()
    const chain = [
      link(0, { side: 'mine', id: 'card-200-1' }, L.MZONE),
      link(1, { side: 'theirs', id: 'c1' }, L.MZONE),
      link(2, { side: 'mine', id: 'card-100-1' }, L.HAND),
      link(3, { side: 'mine', id: 'card-400-1' }, L.GRAVE),
    ]

    core(() => fake.set({ chainSteps: chain }))
    // El aviso suma un eslabón por vez, a su ritmo.
    for (let i = 0; i < chain.length; i += 1) act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))

    expect(badges().sort()).toEqual(['1:mine', '2:theirs', '3:mine', '4:mine'])
    // Pegada a su carta (en su casilla, no adentro de la carta, que recorta), sin tocarse ni leerse: lo que se lee es el nombre.
    const field = document.querySelector('[data-card-id="card-200-1"]')!.parentElement!

    expect(field.querySelector('[data-chain-link]')).toHaveTextContent('1')
    expect(field.querySelector('[data-chain-link]')).toHaveClass('pointer-events-none', 'inset-0')
    expect(field.querySelector('[data-chain-link]')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('[data-rival-card-id="c1"]')!.parentElement!.querySelector('[data-chain-link]')).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: 'Maxx C, eslabón 1 de la cadena' })).toBeInTheDocument()
    expect(handCard('Ash Blossom, eslabón 3 de la cadena, activada desde la mano')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GY: 1, eslabón 4 de la cadena' })).toBeInTheDocument()

    // Se resuelve, del último al primero: la escena en grande no está; el medallón del que se resuelve late y, al empezar el siguiente, se va.
    core(() => fake.set({ chainSteps: [...chain, step('solving', 3), step('solved', 3), step('solving', 2), step('solved', 2), step('solving', 1), step('solved', 1), step('solving', 0), step('solved', 0), step('end', -1)] }))
    const seen: string[] = []

    for (let i = 0; i < 14; i += 1) {
      act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS / 3))
      if (document.querySelector('[data-chain-stage]')) seen.push('escena')
      const now = `${badges().length}:${resolving() ?? '-'}`

      if (seen.at(-1) !== now) seen.push(now)
    }
    // La escena sigue con el último eslabón su rato (`CHAIN_LINK_MS`) y, al empezar a resolverse, se va entera.
    expect(seen).toEqual(['escena', '4:-', '4:4', '3:3', '2:2', '1:1', '0:-'])
    for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(screen.queryByTestId('chain-notice')).toBeNull()
    expect(badges()).toEqual([])
    expect(screen.getByRole('button', { name: 'Maxx C' })).toBeInTheDocument()
  })
})
