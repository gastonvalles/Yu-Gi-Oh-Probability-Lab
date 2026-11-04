// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAIN_LINGER_MS, CHAIN_LINK_MS, type ChainStep } from '../app/auto/chain-feed'
import { core, renderAuto } from './support/auto-screen-harness'
import { fakeSession } from './support/auto-session-fake'

// La pila de la cadena en escritorio, ya resuelta: se va sola a los `CHAIN_LINGER_MS` (Gastón: «si ya se resolvió, ¿por qué queda flotando?»). Tocar un eslabón le da otro rato desde el
// toque y nada más; sólo «Cómo se resuelve» abierto la retiene.

beforeEach(() => {
  // Desde 1101 px (escritorio): ahí la pila es el cartel con su flecha y su ⓘ. El movimiento reducido sigue, como en el resto de las pruebas de pantalla.
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') || query.includes('1101'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

const notice = () => screen.queryByTestId('chain-notice')

/** Tu Maxx C en una cadena de un solo eslabón, ya resuelta y con la pila a la vista (el aviso se muestra de a un paso: pasó `CHAIN_LINK_MS`). */
function resolvedChain() {
  const fake = renderAuto(fakeSession())
  const mine = { card: { side: 'mine' as const, id: 'card-200-1' }, code: 200 }
  const steps: ChainStep[] = [
    { kind: 'chain', at: 0, index: 0, link: { ...mine, mine: true } },
    { kind: 'solving', at: 0, index: 0 },
    { kind: 'solved', at: 0, index: 0 },
    { kind: 'end', at: 0, index: -1 },
  ]

  core(() => fake.set({ chainSteps: steps }))
  // Primero se ve armarse y resolverse; pasado `CHAIN_LINK_MS`, resuelta y terminada (cada paso en su turno, con los efectos de React de por medio).
  act(() => vi.advanceTimersByTime(0))
  act(() => vi.advanceTimersByTime(CHAIN_LINK_MS + 1))
  expect(within(notice()!).getByRole('button', { name: 'Eslabón 1: Maxx C, tuyo. Resuelta' })).toBeInTheDocument()
}

describe('auto-screen · la pila de la cadena resuelta, en escritorio', () => {
  it('se va sola a los CHAIN_LINGER_MS de terminar', () => {
    resolvedChain()
    act(() => vi.advanceTimersByTime(CHAIN_LINGER_MS - 200))
    expect(notice()).not.toBeNull()
    act(() => vi.advanceTimersByTime(400))
    expect(notice()).toBeNull()
  })

  it('tocar un eslabón le da otro rato desde el toque, pero no la deja flotando', () => {
    resolvedChain()
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.click(within(notice()!).getByRole('button', { name: 'Eslabón 1: Maxx C, tuyo. Resuelta' }))
    // Ya pasó el rato de la cadena sola (CHAIN_LINGER_MS desde que terminó), pero el toque volvió a contar.
    act(() => vi.advanceTimersByTime(CHAIN_LINGER_MS - 500))
    expect(notice()).not.toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(notice()).toBeNull()
  })

  it('«Cómo se resuelve» abierto la retiene y, al cerrarlo, se va', () => {
    resolvedChain()
    fireEvent.click(within(notice()!).getByRole('button', { name: 'Cómo se resuelve una cadena' }))
    expect(screen.getByRole('dialog', { name: 'Cómo se resuelve' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(CHAIN_LINGER_MS * 3))
    expect(notice()).not.toBeNull()
    expect(screen.getByRole('dialog', { name: 'Cómo se resuelve' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => vi.advanceTimersByTime(CHAIN_LINGER_MS + 500))
    expect(screen.queryByRole('dialog', { name: 'Cómo se resuelve' })).toBeNull()
    expect(notice()).toBeNull()
  })
})
