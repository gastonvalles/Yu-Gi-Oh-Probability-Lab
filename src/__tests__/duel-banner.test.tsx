// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SpectatorEnd } from '../app/duel-spectator'
import { ResultHero, TURN_BANNER_MS, TurnOrderBanner, WATCH_NEXT_MS, WATCH_RETURN_MS, WatchResultBanner } from '../components/duel/DuelBanner'
import { DuelMedal } from '../components/duel/DuelMedal'

afterEach(() => vi.useRealTimers())

const names = (player: 0 | 1) => (player === 0 ? 'Ana' : 'Beto')
const end = (patch: Partial<SpectatorEnd> = {}): SpectatorEnd => ({ winner: 0, reason: 'life', loser: 1, match: false, wins: [0, 0], over: true, matchWinner: null, ...patch })

describe('la placa', () => {
  it('es un cuadrado plano con su aro, sin capas 3D, rayos ni grieta, y su color dice quién empieza (carbón sobre lavanda)', () => {
    const { container } = render(<DuelMedal tone="second" numeral="2" />)
    const plate = container.querySelector<HTMLElement>('[data-medal="second"]')!

    expect(plate).toHaveClass('bg-accent', 'text-accent-foreground', 'outline-4')
    expect(plate.className).not.toMatch(/rounded|gradient|blur|perspective|preserve-3d/)
    // Una sola pieza adentro: el número (antes, nueve discos, rayos y brillo).
    expect(plate.children).toHaveLength(1)
    expect(render(<DuelMedal tone="first" numeral="1" />).container.querySelector('[data-medal="first"]')).toHaveClass('bg-primary')
    expect(render(<DuelMedal tone="first" numeral="1" />).container.querySelector('[data-medal="first"]')).toHaveTextContent('1')
    expect(render(<DuelMedal tone="second" numeral="2" />).container.querySelector('[data-medal="second"]')).toHaveTextContent('2')
  })

  it('entra una vez, nada en bucle, y se apaga con prefers-reduced-motion', () => {
    const { container } = render(<DuelMedal tone="first" numeral="1" />)

    for (const animated of container.querySelectorAll('[class*="animate-"]')) {
      expect(animated.className).toMatch(/motion-reduce:animate-none/)
    }
    const css = readFileSync(path.resolve(__dirname, '..', 'index.css'), 'utf8')
    expect(/--animate-plate-in:([^;]+);/.exec(css)![1]).not.toMatch(/infinite/)
    expect(css).not.toMatch(/medal-|confetti/)
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
    expect(within(dialog).getByText('Ganó Ana. Beto se rindió.')).toBeInTheDocument()
    // Sin placa: el color del resultado va en la palabra, «Victoria» (quién ganó, en la línea de abajo).
    expect(dialog.querySelector('[data-result-word]')).toHaveTextContent(/^Victoria$/)
    expect(dialog).toHaveAttribute('data-tone', 'win')
    expect(dialog.querySelector('[data-medal]')).toBeNull()

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
    expect(dialog).toHaveAttribute('data-tone', 'draw')
  })

  it('un duelo de un Match que sigue: dice el marcador, no vuelve al inicio y se cierra solo para seguir mirando', () => {
    vi.useFakeTimers()
    const leave = vi.fn()
    const close = vi.fn()

    render(<WatchResultBanner end={end({ match: true, wins: [1, 0], over: false })} nameOf={names} onLeave={leave} onClose={close} />)

    const dialog = screen.getByRole('dialog', { name: 'Ganó Ana' })
    expect(within(dialog).getByText('Ganó Ana. Beto se quedó sin puntos de vida. Match 1–0. El Match sigue.')).toBeInTheDocument()
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
    expect(within(dialog).getByText('Ganó Ana el Match. Beto se quedó sin puntos de vida. Match 2–1.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Volver al inicio' })).toBeInTheDocument()
  })
})

describe('el final del duelo', () => {
  it('un solo bloque al medio, sin velo ni hoja ni marcador: la palabra, el porqué y los botones chicos (dos por fila; si son impares, el último de lado a lado)', () => {
    const hide = vi.fn()
    const { container } = render(
      <ResultHero
        tone="lose"
        title="Perdiste"
        reason="Te quedaste sin puntos de vida."
        onHide={hide}
        actions={
          <>
            <button type="button">Guardar replay</button>
            <button type="button">Ver el replay</button>
          </>
        }
        primary={<button type="button">Jugar otra vez</button>}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Perdiste' })
    const word = container.querySelector('[data-result-word]')!
    const block = container.querySelector('[data-result-block]')!

    // El nombre del cartel sigue siendo cómo te fue; a la vista, la palabra (en su color, itálica y en mayúsculas), oculta al lector (no la oye dos veces).
    expect(dialog).toHaveAttribute('data-tone', 'lose')
    expect(dialog).toHaveClass('place-items-center')
    expect(word).toHaveAttribute('aria-hidden', 'true')
    expect(word).toHaveTextContent(/^Derrota$/)
    expect(word.querySelector('p')).toHaveClass('text-danger-soft', 'italic', 'uppercase', 'whitespace-nowrap')
    expect(block).toContainElement(word as HTMLElement)
    expect(within(dialog).getByRole('status')).toHaveTextContent('Te quedaste sin puntos de vida.')
    // El campo se ve: ni velo que tape todo ni hoja opaca; tampoco el marcador de vidas.
    expect(dialog.querySelector('.bg-card-background, .animate-sheet-up')).toBeNull()
    expect([...dialog.children].some((n) => n.className.includes('inset-0') && /\bbg-background\//.test(n.className))).toBe(false)
    // TI-249: el bloque es una banda de lado a lado, opaca y recta («un fondo horizontal con la X arriba a la derecha»), con la ✕ en su esquina y los botones en un renglón.
    expect(block.querySelector('[data-result-band]')).toHaveClass('inset-0', 'bg-background/95')
    expect(within(dialog).getByRole('button', { name: 'Ver el campo' })).toHaveClass('absolute', 'right-1', 'top-1')
    expect(container.querySelector('[data-result-block] .grid-cols-2')).toHaveClass('whitespace-nowrap')
    expect(dialog.querySelector('[data-score]')).toBeNull()
    expect(dialog).not.toHaveTextContent(/\d+\s*a\s*\d+/)
    // Tres botones: dos en la fila y el tercero (la principal) de lado a lado.
    const cells = [...container.querySelectorAll('[data-result-block] .grid-cols-2 > div')]
    expect(cells).toHaveLength(3)
    expect(cells[2]).toHaveClass('col-span-2')
    expect(cells[0]).not.toHaveClass('col-span-2')
    // La ✕ esconde el cartel (el campo queda solo), no sale del duelo.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ver el campo' }))
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('«Victoria» y «Empate» con su color', () => {
    const win = render(<ResultHero tone="win" title="¡Ganaste!" reason="Rival se rindió." />).container.querySelector('[data-result-word] p')
    const draw = render(<ResultHero tone="draw" title="Empate" reason="Los dos se quedaron sin puntos de vida." />).container.querySelector('[data-result-word] p')

    expect(win).toHaveTextContent(/^Victoria$/)
    expect(win).toHaveClass('text-info')
    expect(draw).toHaveTextContent(/^Empate$/)
    expect(draw).toHaveClass('text-accent')
  })
})
