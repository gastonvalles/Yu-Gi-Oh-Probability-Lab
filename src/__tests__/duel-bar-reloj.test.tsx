// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DuelSnapshot } from '../app/duel-session'
import { DuelBar } from '../components/duel/DuelBar'

// El reloj de la ronda lleva su propio segundo (`RoundClock`): cada segundo cambia el número del reloj y la barra (las vidas, el turno, los íconos) no se vuelve a dibujar.

const { barRenders } = vi.hoisted(() => ({ barRenders: { count: 0 } }))

// La hamburguesa se dibuja una vez por cada dibujo de la barra (no es `memo`): cuenta cuántas veces se dibujó la barra.
vi.mock('../components/shell/ShellMenu', () => ({
  ShellMenuButton: () => {
    barRenders.count += 1
    return null
  },
}))

const snapshot = {
  life: { lp: [8000, 8000], log: [], timer: { running: true, startedAt: 0, elapsedMs: 0 } },
  me: 0,
  peerPresent: true,
  peerName: 'Ana',
  settings: { limitMin: 40 },
  conceded: null,
  watchers: 0,
  series: { match: false, game: 1, wins: [0, 0] },
  mine: null,
  theirs: null,
} as unknown as DuelSnapshot

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(0)
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  barRenders.count = 0
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('el reloj de la ronda en la barra del duelo', () => {
  it('cada segundo cambia el reloj y la barra no se vuelve a dibujar', () => {
    render(<DuelBar snapshot={snapshot} status="open" turn="mine" myName="Beto" turnNumber={3} onToggleClock={() => {}} onRematch={() => {}} onLeave={() => {}} onConcede={() => {}} onReconnect={() => {}} />)
    const clock = screen.getByTestId('round-clock')

    expect(clock).toHaveTextContent('40:00')
    const before = barRenders.count

    act(() => vi.advanceTimersByTime(3000))
    expect(clock).toHaveTextContent('39:57')
    expect(screen.getByRole('button', { name: /^Reloj de la ronda: 39:57\./ })).toBeInTheDocument()
    expect(barRenders.count).toBe(before)
  })
})
