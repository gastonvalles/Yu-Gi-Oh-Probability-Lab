// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RoomsApi } from '../app/duel-rooms'
import { ArenaPanel } from '../components/duel/ArenaPanel'
import { REFRESH_MS } from '../components/duel/room-chips'

type Overview = Awaited<ReturnType<RoomsApi['overview']>>

const open: Overview['rooms'][number] = { code: 'K7QF2M9X', host: 'Carla', match: true, siding: true, format: 'tcg', limitMin: 50, createdAt: Date.now() }

/** Un relay que contesta cuando el test lo decide: cada pedido queda esperando hasta `answer`. */
function slowRooms() {
  const pending: Array<(value: Overview) => void> = []
  const overview = vi.fn(() => new Promise<Overview>((resolve) => void pending.push(resolve)))
  const rooms: RoomsApi = { list: async () => (await overview()).rooms, overview, live: async () => true, register: async () => true, unlist: () => undefined }

  return {
    rooms,
    overview,
    answer: (value: Overview = { rooms: [], live: [] }) => pending.shift()?.(value),
  }
}

const arena = () => screen.getByRole('region', { name: 'En la arena ahora' })
const refreshButton = () => within(arena()).getByRole('button', { name: 'Actualizar' })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('la arena del lobby, cargando', () => {
  it('mientras llega la primera respuesta se ve lo que se está haciendo y tres filas vacías con la forma de las de verdad, y al llegar se van', async () => {
    const relay = slowRooms()

    render(<ArenaPanel rooms={relay.rooms} busy={false} deckReady onJoin={vi.fn()} />)

    expect(arena()).toHaveAttribute('aria-busy', 'true')
    expect(within(arena()).getByRole('status')).toHaveTextContent('Mirando quién está…')
    expect(arena().querySelectorAll('li')).toHaveLength(3)
    // Todavía no sabe nada: no dice que no hay salas.
    expect(screen.queryByText(/Todavía no hay salas abiertas/)).not.toBeInTheDocument()

    await act(async () => relay.answer())

    expect(arena()).toHaveAttribute('aria-busy', 'false')
    expect(arena().querySelectorAll('li')).toHaveLength(0)
    expect(screen.getByText(/Todavía no hay salas abiertas/)).toBeInTheDocument()
  })

  it('al tocar «Actualizar» su ícono gira y la lista se atenúa hasta que llega lo nuevo (al menos una vuelta, aunque el relay conteste enseguida), y un segundo toque no pide otra vez', async () => {
    const relay = slowRooms()

    render(<ArenaPanel rooms={relay.rooms} busy={false} deckReady onJoin={vi.fn()} />)
    await act(async () => relay.answer())

    const button = refreshButton()
    const icon = () => button.querySelector('svg')!

    expect(icon()).not.toHaveClass('motion-safe:animate-spin')
    expect(relay.overview).toHaveBeenCalledTimes(1)

    fireEvent.click(button)
    fireEvent.click(button)

    expect(relay.overview).toHaveBeenCalledTimes(2)
    expect(icon()).toHaveClass('motion-safe:animate-spin')
    expect(arena()).toHaveAttribute('aria-busy', 'true')
    // La lista que ya estaba se queda donde está, atenuada.
    expect(screen.getByText(/Todavía no hay salas abiertas/).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true')

    // El relay contesta enseguida, pero el ícono sigue girando hasta completar la vuelta.
    await act(async () => relay.answer({ rooms: [open], live: [] }))
    expect(icon()).toHaveClass('motion-safe:animate-spin')

    await act(async () => void vi.advanceTimersByTime(700))
    expect(icon()).not.toHaveClass('motion-safe:animate-spin')
    expect(arena()).toHaveAttribute('aria-busy', 'false')
    expect(within(arena()).getByText('Carla')).toBeInTheDocument()
  })

  it('el pedido automático de cada 15 segundos es silencioso: no gira ni atenúa nada', async () => {
    const relay = slowRooms()

    render(<ArenaPanel rooms={relay.rooms} busy={false} deckReady onJoin={vi.fn()} />)
    await act(async () => relay.answer({ rooms: [open], live: [] }))

    await act(async () => void vi.advanceTimersByTime(REFRESH_MS))
    expect(relay.overview).toHaveBeenCalledTimes(2)
    expect(refreshButton().querySelector('svg')).not.toHaveClass('motion-safe:animate-spin')
    expect(arena()).toHaveAttribute('aria-busy', 'false')
    expect(within(arena()).getByText('Carla')).toBeInTheDocument()
  })
})
