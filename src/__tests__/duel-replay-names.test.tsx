// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildDuelReplay } from '../app/duel-replay'
import { encodeReplayLinkPayload } from '../app/duel-replay-share'
import { createMatState } from '../app/practice-mat'
import { ReplaysScreen } from '../components/replays/ReplaysScreen'
import { fetchCardNamesByIds } from '../ygoprodeck'

// La API de cartas, simulada; las transmisiones en vivo no se miran (no son de esta prueba).
vi.mock('../ygoprodeck', () => ({ fetchCardNamesByIds: vi.fn() }))
vi.mock('../app/use-live-streams', () => ({ useLiveStreams: () => ({ status: 'loading' }) }))
const fetchNames = vi.mocked(fetchCardNamesByIds)

// Un duelo corto (como el de `duel-replay-ui`): Ana invoca y coloca; Beto invoca una que muestra.
const deck = Array.from({ length: 20 }, (_, i) => `card-${14558127 + (i % 4)}-${Math.floor(i / 4) + 1}`)
const mine = createMatState(deck, [], 5)
const [h0, h1] = mine.hand as [string, string]
const replay = buildDuelReplay({
  mode: 'link-auto',
  view: 'public',
  players: ['Ana', 'Beto'],
  starter: 0,
  mine: { initial: mine, actions: [{ type: 'phase', phase: 'main1' }, { type: 'place', id: h0, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }, { type: 'place', id: h1, zone: 'st', index: 0, pos: 'set' }] },
  theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [{ action: { type: 'place', id: 'c1', zone: 'mz', index: 1, pos: 'atk', how: 'normal' }, reveal: { c1: 'card-55144522-1' } }] },
  order: ['mine', 'mine', 'mine', 'theirs'],
  life: [{ at: 0, lp: [8000, 8000] }],
  nameOf: () => 'No viaja',
  result: { winner: 0, reason: 'lp' },
})

function openLink(payload: string) {
  const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
  return render(
    <Provider store={store}>
      <ReplaysScreen shared={payload} />
    </Provider>,
  )
}

beforeEach(() => {
  fetchNames.mockReset()
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})
afterEach(cleanup)

describe('un enlace de replay sin nombres', () => {
  it('abre de una con «Carta» y los nombres entran cuando llegan, pedidos por passcode en una sola consulta', async () => {
    let answer: (names: Map<number, string>) => void = () => {}
    fetchNames.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const payload = await encodeReplayLinkPayload(replay)
    expect(payload).not.toContain('No viaja')
    openLink(payload)

    // Abierto antes de que lleguen los nombres: la jugada se ve con «Carta», y el renglón ya tiene su alto.
    const text = await screen.findByTestId('replay-step-text')
    expect(text).toHaveTextContent('Beto: Invocación Normal de Carta')
    // Hasta dos renglones, con el alto de dos reservado: lo que llegue después no mueve el campo.
    expect(text).toHaveClass('min-h-[2lh]', 'line-clamp-2')
    expect(fetchNames).toHaveBeenCalledTimes(1)
    expect(fetchNames.mock.calls[0]![0]).toContain(55144522)

    answer(new Map([[55144522, 'Pot of Greed']]))
    await waitFor(() => expect(screen.getByTestId('replay-step-text')).toHaveTextContent('Beto: Invocación Normal de Pot of Greed'))
    expect(fetchNames).toHaveBeenCalledTimes(1)
  })

  it('sin red queda «Carta» y no se rompe nada', async () => {
    fetchNames.mockRejectedValue(new Error('offline'))
    openLink(await encodeReplayLinkPayload(replay))

    expect(await screen.findByTestId('replay-step-text')).toHaveTextContent('Beto: Invocación Normal de Carta')
    await waitFor(() => expect(fetchNames).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('replay-step')).toHaveTextContent('Jugada 4 de 4 · Ganó Ana')
    expect(screen.getByRole('button', { name: 'Guardar en mis replays' })).toBeEnabled()
  })
})
