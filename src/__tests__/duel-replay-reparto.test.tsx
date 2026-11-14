// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render as renderBare, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FIRST_DEAL_MS, NEXT_DEAL_MS } from '../app/deal-flight'
import { buildDuelReplay } from '../app/duel-replay'
import { createMatState, type MatAction } from '../app/practice-mat'
import { DuelReplayScreen } from '../components/replays/DuelReplayScreen'

// El reparto de las manos al abrir un replay por su comienzo, con el ritmo de la mesa (`PracticeMat`): el deck se baraja y sale una carta cada `NEXT_DEAL_MS`.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(<Provider store={store}>{ui}</Provider>)
const deckOf = (prefix: string) => Array.from({ length: 20 }, (_, i) => `${prefix}${i + 1}`)

// Por enlace (manual): las manos ya vienen en la mesa del arranque.
const manual = () => {
  const mine = createMatState(deckOf('card-14558127-'), [], 5)
  return buildDuelReplay({
    mode: 'link',
    view: 'public',
    players: ['Ana', 'Beto'],
    starter: 0,
    mine: { initial: mine, actions: [{ type: 'phase', phase: 'main1' }, { type: 'place', id: mine.hand[0]!, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }] },
    theirs: { initial: createMatState(deckOf('c'), [], 5), acts: [] },
    order: ['mine', 'mine'],
    life: [{ at: 0, lp: [8000, 8000] }],
    nameOf: () => 'Ash Blossom',
  })
}

// El automático arranca con las manos vacías y las reparte con un robo de 5 de cada lado (`adapter.ts`).
const auto = () => {
  const mine = createMatState(deckOf('card-14558127-'), [], 0)
  const theirs = createMatState(deckOf('c'), [], 0)
  const draw = (deck: string[]): MatAction => ({ type: 'draw', count: 5, ids: deck.slice(-5) })
  return buildDuelReplay({
    mode: 'solo-auto',
    view: 'public',
    players: ['Ana', 'Beto'],
    starter: 0,
    mine: { initial: mine, actions: [draw(mine.deck), { type: 'phase', phase: 'main1' }] },
    theirs: { initial: theirs, acts: [{ action: draw(theirs.deck), reveal: {} }] },
    order: ['mine', 'theirs', 'mine'],
    life: [{ at: 0, lp: [8000, 8000] }],
    nameOf: () => 'Ash Blossom',
  })
}

const hand = (name: string) => screen.getByRole('img', { name: new RegExp(`^Mano de ${name}: `) })
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
// Cada carta pide la siguiente al dibujarse: se avanza de a una.
const dealAll = () => {
  advance(FIRST_DEAL_MS)
  for (let card = 1; card < 5; card += 1) advance(NEXT_DEAL_MS)
}
let reduced = false

beforeEach(() => {
  reduced = false
  vi.useFakeTimers()
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('el replay de un duelo reparte las manos al empezar', () => {
  it('abierto por su comienzo, las dos manos salen de a una con el ritmo de la mesa y reproducir espera a que terminen', () => {
    render(<DuelReplayScreen replay={manual()} onClose={() => {}} actions={[]} startAt={0} />)

    expect(hand('Ana')).toHaveAccessibleName('Mano de Ana: 0')
    expect(hand('Beto')).toHaveAccessibleName('Mano de Beto: 0')
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
    advance(FIRST_DEAL_MS)
    expect(hand('Ana')).toHaveAccessibleName('Mano de Ana: 1')
    expect(hand('Beto')).toHaveAccessibleName('Mano de Beto: 1')
    advance(NEXT_DEAL_MS)
    expect(hand('Ana')).toHaveAccessibleName('Mano de Ana: 2')
    // Reproducir no avanza mientras se reparte.
    expect(screen.getByTestId('replay-step')).toHaveTextContent('La mesa al empezar')
    for (let card = 2; card < 5; card += 1) advance(NEXT_DEAL_MS)
    expect(hand('Ana')).toHaveAccessibleName('Mano de Ana: 5')
    expect(hand('Beto')).toHaveAccessibleName('Mano de Beto: 5')
    advance(900)
    expect(screen.getByTestId('replay-step')).toHaveTextContent('Jugada 1 de 2')
  })

  it('con movimiento reducido, abierto en otra jugada o al saltar, las manos aparecen enteras', () => {
    reduced = true
    const { unmount } = render(<DuelReplayScreen replay={manual()} onClose={() => {}} actions={[]} startAt={0} />)
    expect(hand('Ana')).toHaveAccessibleName('Mano de Ana: 5')
    unmount()

    reduced = false
    render(<DuelReplayScreen replay={manual()} onClose={() => {}} actions={[]} startAt={0} />)
    // Saltar en pleno reparto (al final y de vuelta al principio) lo termina: nada se reparte de nuevo.
    advance(FIRST_DEAL_MS)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Línea de tiempo del replay' }), { key: 'End' })
    fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
    expect(hand('Ana')).toHaveAccessibleName('Mano de Ana: 5')
    expect(hand('Beto')).toHaveAccessibleName('Mano de Beto: 5')
  })

  it('abierto en el final, «Ver de nuevo» arranca de cero y reparte otra vez', () => {
    render(<DuelReplayScreen replay={manual()} onClose={() => {}} actions={[]} />)

    expect(hand('Beto')).toHaveAccessibleName('Mano de Beto: 5')
    fireEvent.click(screen.getByRole('button', { name: 'Ver de nuevo' }))
    expect(screen.getByTestId('replay-step')).toHaveTextContent('La mesa al empezar')
    expect(hand('Beto')).toHaveAccessibleName('Mano de Beto: 0')
    dealAll()
    expect(hand('Beto')).toHaveAccessibleName('Mano de Beto: 5')
    expect(screen.getByTestId('replay-step')).toHaveTextContent('La mesa al empezar')
    advance(900)
    expect(screen.getByTestId('replay-step')).toHaveTextContent('Jugada 1 de 2')
  })

  it('en el automático, el robo de 5 de cada lado se reparte (el del otro lado no espera al primero) y la jugada siguiente espera a los dos', () => {
    render(<DuelReplayScreen replay={auto()} onClose={() => {}} actions={[]} startAt={0} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
    advance(900)
    expect(screen.getByTestId('replay-step')).toHaveTextContent('Jugada 1 de 3')
    expect(hand('Ana')).toHaveAccessibleName('Mano de Ana: 0')
    dealAll()
    expect(hand('Ana')).toHaveAccessibleName('Mano de Ana: 5')
    // El robo de Beto llegó mientras se repartía la de Ana.
    expect(screen.getByTestId('replay-step')).toHaveTextContent('Jugada 2 de 3')
    expect(hand('Beto')).toHaveAccessibleName('Mano de Beto: 0')
    dealAll()
    expect(hand('Beto')).toHaveAccessibleName('Mano de Beto: 5')
    expect(screen.getByTestId('replay-step')).toHaveTextContent('Jugada 2 de 3')
    advance(900)
    expect(screen.getByTestId('replay-step')).toHaveTextContent('Jugada 3 de 3')
  })
})
