// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SpectatorEnd } from '../app/duel-spectator'
import { TURN_BANNER_MS, TurnOrderBanner, WATCH_NEXT_MS, WATCH_RETURN_MS, WatchResultBanner } from '../components/duel/DuelBanner'
import { DuelMedal } from '../components/duel/DuelMedal'

afterEach(() => vi.useRealTimers())

const names = (player: 0 | 1) => (player === 0 ? 'Ana' : 'Beto')
const end = (patch: Partial<SpectatorEnd> = {}): SpectatorEnd => ({ winner: 0, reason: 'life', loser: 1, match: false, wins: [0, 0], over: true, matchWinner: null, ...patch })

describe('la medalla 3D', () => {
  it('es una pila de discos con grosor, con la cara de adelante y la de atrás, y su color dice qué pasó', () => {
    const { container } = render(<DuelMedal tone="win" icon="trophy" />)
    const medal = container.querySelector<HTMLElement>('[data-medal="win"]')!

    // Siete discos de grosor + el frente y el dorso (que ocultan su revés).
    expect(medal.querySelectorAll('.medal-rim')).toHaveLength(9)
    expect(medal.querySelectorAll('[class*="backface-visibility"]')).toHaveLength(2)
    expect(medal.style.getPropertyValue('--medal-rgb')).toBe('var(--info-rgb)')
    // Ganar lleva rayos; perder, grieta; el turno, un número.
    expect(medal.querySelector('.medal-rays')).not.toBeNull()
    expect(render(<DuelMedal tone="lose" icon="flag" />).container.querySelector('[data-medal="lose"] path')).not.toBeNull()
    expect(render(<DuelMedal tone="first" numeral="1" />).container.querySelector('[data-medal="first"]')).toHaveTextContent('1')
    expect(render(<DuelMedal tone="second" numeral="2" />).container.querySelector('[data-medal="second"]')).toHaveTextContent('2')
  })

  it('todo lo que se mueve se apaga con prefers-reduced-motion', () => {
    const { container } = render(<DuelMedal tone="win" icon="trophy" />)

    for (const animated of container.querySelectorAll('[class*="animate-"]')) {
      expect(animated.className).toMatch(/motion-reduce:(animate-none|hidden)/)
    }
  })
})

describe('el cartel del comienzo', () => {
  it('dice si vas primero o segundo y, segundo, quién empieza; se va solo a los pocos segundos', () => {
    vi.useFakeTimers()
    const done = vi.fn()
    const view = render(<TurnOrderBanner first={false} rival="Ana" onDone={done} />)

    expect(screen.getByRole('heading', { name: 'Vas segundo' })).toBeInTheDocument()
    expect(screen.getByText('Empieza Ana. Tu turno viene después.')).toBeInTheDocument()
    expect(view.container.querySelector('[data-medal="second"]')).toHaveTextContent('2')

    act(() => {
      vi.advanceTimersByTime(TURN_BANNER_MS - 1)
    })
    expect(done).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(done).toHaveBeenCalledTimes(1)

    view.rerender(<TurnOrderBanner first rival="Ana" onDone={done} />)
    expect(screen.getByRole('heading', { name: 'Vas primero' })).toBeInTheDocument()
    expect(view.container.querySelector('[data-medal="first"]')).toHaveTextContent('1')
  })
})

describe('el cartel del final para quien mira', () => {
  it('un duelo suelto: quién ganó y por qué, y vuelve solo al inicio (o ya, con el botón)', () => {
    vi.useFakeTimers()
    const leave = vi.fn()
    const close = vi.fn()

    render(<WatchResultBanner end={end({ reason: 'conceded' })} nameOf={names} onLeave={leave} onClose={close} />)

    const dialog = screen.getByRole('dialog', { name: 'Ganó Ana' })
    expect(within(dialog).getByText('Beto se rindió.')).toBeInTheDocument()
    expect(dialog.querySelector('[data-medal="win"]')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(WATCH_RETURN_MS - 1)
    })
    expect(leave).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver al inicio' }))
    expect(leave).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(5)
    })
    expect(leave).toHaveBeenCalledTimes(2)
    expect(close).not.toHaveBeenCalled()
  })

  it('el empate no tiene ganador ni por qué rendirse: los dos se quedaron sin puntos', () => {
    render(<WatchResultBanner end={end({ winner: null, loser: null, reason: 'draw' })} nameOf={names} onLeave={() => {}} onClose={() => {}} />)

    const dialog = screen.getByRole('dialog', { name: 'Empate' })
    expect(within(dialog).getByText('Los dos se quedaron sin puntos de vida a la vez.')).toBeInTheDocument()
    expect(dialog.querySelector('[data-medal="draw"]')).not.toBeNull()
  })

  it('un duelo de un Match que sigue: dice el marcador, no vuelve al inicio y se cierra solo para seguir mirando', () => {
    vi.useFakeTimers()
    const leave = vi.fn()
    const close = vi.fn()

    render(<WatchResultBanner end={end({ match: true, wins: [1, 0], over: false })} nameOf={names} onLeave={leave} onClose={close} />)

    const dialog = screen.getByRole('dialog', { name: 'Ganó Ana' })
    expect(within(dialog).getByText('Beto se quedó sin puntos de vida. Match 1–0. El Match sigue.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Volver al inicio' })).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(WATCH_NEXT_MS + 5)
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(leave).not.toHaveBeenCalled()
  })

  it('el duelo que define el Match lo dice con el Match y sí vuelve al inicio', () => {
    render(<WatchResultBanner end={end({ match: true, wins: [2, 1], matchWinner: 0 })} nameOf={names} onLeave={() => {}} onClose={() => {}} />)

    const dialog = screen.getByRole('dialog', { name: 'Ganó Ana el Match' })
    expect(within(dialog).getByText('Beto se quedó sin puntos de vida. Match 2–1.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Volver al inicio' })).toBeInTheDocument()
  })
})
