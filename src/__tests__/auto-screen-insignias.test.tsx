// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import type { CardRef } from '../app/auto/adapter'
import { CHAIN_LINK_MS, CHAIN_SOLVE_MS, type ChainStep } from '../app/auto/chain-feed'
import { LOCATION as L } from '../app/auto/protocol'
import { core, handCard, renderAuto } from './support/auto-screen-harness'

// La insignia del eslabón («CL1», «CL2»…) sobre cada carta de la cadena, donde esté: en el campo, en la mano y en una pila; del color de quien la activó, y se va con el aviso de la cadena.

const link = (index: number, card: CardRef, from: number): ChainStep => ({ kind: 'chain', at: 0, index, link: { card, code: 1, mine: card.side === 'mine', from } })
const step = (kind: ChainStep['kind'], index: number): ChainStep => ({ kind, at: 0, index })
const badges = () => [...document.querySelectorAll<HTMLElement>('[data-chain-link]')].map((badge) => `${badge.textContent}:${badge.dataset.chainOwner}`)

describe('auto-screen · la insignia del eslabón sobre las cartas', () => {
  it('cada carta de la cadena lleva su CLn pegado (campo, mano y Cementerio, de los dos lados), su nombre lo dice y se va con el aviso', () => {
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

    expect(badges().sort()).toEqual(['CL1:mine', 'CL2:theirs', 'CL3:mine', 'CL4:mine'])
    // Pegada a su carta (en su casilla, no adentro de la carta, que recorta), sin tocarse ni leerse: lo que se lee es el nombre.
    const field = document.querySelector('[data-card-id="card-200-1"]')!.parentElement!

    expect(field.querySelector('[data-chain-link]')).toHaveTextContent('CL1')
    expect(field.querySelector('[data-chain-link]')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('[data-rival-card-id="c1"]')!.parentElement!.querySelector('[data-chain-link]')).toHaveTextContent('CL2')
    expect(screen.getByRole('button', { name: 'Maxx C, eslabón 1 de la cadena' })).toBeInTheDocument()
    expect(handCard('Ash Blossom, eslabón 3 de la cadena, activada desde la mano')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GY: 1, eslabón 4 de la cadena' })).toBeInTheDocument()

    // Se resuelve y termina: la insignia sigue mientras se ve el aviso y se va con él.
    core(() => fake.set({ chainSteps: [...chain, step('solving', 3), step('solved', 3), step('solving', 2), step('solved', 2), step('solving', 1), step('solved', 1), step('solving', 0), step('solved', 0), step('end', -1)] }))
    act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(badges()).toHaveLength(4)
    for (let i = 0; i < 12; i += 1) act(() => vi.advanceTimersByTime(CHAIN_SOLVE_MS))
    expect(screen.queryByTestId('chain-notice')).toBeNull()
    expect(badges()).toEqual([])
    expect(screen.getByRole('button', { name: 'Maxx C' })).toBeInTheDocument()
  })
})
