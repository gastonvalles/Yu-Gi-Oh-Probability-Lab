// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { extractRoomCode } from '../app/duel-link'
import type { SocketStatus, SocketTransport } from '../app/duel-socket'
import type { DuelConnect } from '../app/use-duel'
import { DuelScreen } from '../components/duel/DuelScreen'
import { createMemoryRoom, type MemoryEnd, type MemoryRoom } from './support/memory-room'

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

/** Cada pantalla en su propio contenedor: las dos conviven en el mismo documento, como dos pestañas. */
const render = (ui: ReactElement): RenderResult => renderBare(<Provider store={store}>{ui}</Provider>, { container: document.body.appendChild(document.createElement('div')) })

const asSocket = (end: MemoryEnd): SocketTransport =>
  Object.assign(end, {
    status: 'open' as SocketStatus,
    onStatus: (listener: (status: SocketStatus) => void) => {
      listener('open')
      return () => {}
    },
  })

const mainIds = Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`)
const extraIds = ['card-9001-1']
const cardsById = new Map([...mainIds, ...extraIds].map((id) => [id, { name: `Carta ${id}`, apiCard: null }]))

let memory: MemoryRoom
let connect: DuelConnect

const screenProps = (overrides: Partial<Parameters<typeof DuelScreen>[0]> = {}) => ({ handSize: 5, mainIds, extraIds, cardsById, deckName: 'Mi deck', connect, ...overrides })
const flush = () => act(() => memory.flush())
const click = (view: RenderResult, name: string | RegExp, role: 'button' | 'menuitem' = 'button') => fireEvent.click(within(view.container).getByRole(role, { name }))
const typeInto = (view: RenderResult, label: string, value: string) => fireEvent.change(within(view.container).getByLabelText(label), { target: { value } })

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(cleanup)

describe('la pantalla del duelo', () => {
  it('sin cartas suficientes en el Main avisa y no deja crear ni unirse', () => {
    const view = render(<DuelScreen {...screenProps({ mainIds: mainIds.slice(0, 3) })} />)

    expect(within(view.container).getByText(/Armá primero tu deck/)).toBeInTheDocument()
    expect(within(view.container).getByRole('button', { name: 'Crear un duelo' })).toBeDisabled()

    typeInto(view, 'Enlace o código', 'K7QF2M9X')
    expect(within(view.container).getByRole('button', { name: 'Unirme' })).toBeDisabled()
  })

  it('crear un duelo pone el código en la dirección y muestra el enlace para el rival', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    click(view, 'Crear un duelo')

    const room = extractRoomCode(window.location.hash)
    expect(room).not.toBeNull()
    expect(within(view.container).getByTestId('duel-link')).toHaveTextContent(`#duel?room=${room}`)
    expect(within(view.container).getByText('Esperando a tu rival…')).toBeInTheDocument()
    expect(within(view.container).getByRole('button', { name: 'Repartir mi mano' })).toBeDisabled()
  })

  it('unirse con algo que no es un código lo dice y no entra a ninguna sala', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    typeInto(view, 'Enlace o código', 'hola')
    click(view, 'Unirme')

    expect(within(view.container).getByRole('alert')).toHaveTextContent('Ese no parece un código de duelo')
    expect(window.location.hash).toBe('#duel')
  })

  it('una sala llena se dice y deja salir', () => {
    window.history.replaceState(null, '', '#duel?room=K7QF2M9X')
    const full: SocketTransport = {
      status: 'full',
      onStatus: (listener) => {
        listener('full')
        return () => {}
      },
      send: () => {},
      onMessage: () => () => {},
      onPeer: (listener) => {
        listener(false)
        return () => {}
      },
      close: () => {},
    }
    const view = render(<DuelScreen {...screenProps({ connect: () => full })} />)

    expect(within(view.container).getByText('Esa sala ya tiene dos jugadores.')).toBeInTheDocument()
    click(view, 'Salir')
    expect(within(view.container).getByRole('button', { name: 'Crear un duelo' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#duel')
  })

  it('dos jugadores: uno crea, el otro pega el enlace, cada uno reparte su mano y se ven los puntos de vida del otro', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    click(host, 'Crear un duelo')
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''

    // Otra pestaña: sin sala en la dirección, pega el enlace.
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    typeInto(guest, 'Enlace o código', link)
    click(guest, 'Unirme')
    flush()

    expect(within(host.container).getByText('Beto está en la sala.')).toBeInTheDocument()
    expect(within(guest.container).getByText('Ana está en la sala.')).toBeInTheDocument()
    expect(within(guest.container).queryByTestId('duel-link')).not.toBeInTheDocument()

    click(host, 'Repartir mi mano')
    flush()
    expect(within(host.container).getByText('Esperando que tu rival reparta su mano…')).toBeInTheDocument()

    click(guest, 'Repartir mi mano')
    flush()

    // Ya hay mesa: la mano del rival se cuenta sin verse, y de quién es el turno lo ven igual los dos.
    expect(within(host.container).getByLabelText('Mano del rival: 5')).toBeInTheDocument()
    expect(within(guest.container).getByLabelText('Mano del rival: 5')).toBeInTheDocument()
    expect(within(host.container).getByText('Tu turno')).toBeInTheDocument()
    expect(within(guest.container).getByText('Turno de Ana')).toBeInTheDocument()

    // El anfitrión pierde 1000: el invitado lo ve en la tarjeta del rival.
    click(host, /Cambiar mis puntos de vida/)
    fireEvent.click(screen.getByRole('button', { name: '−1000' }))
    flush()

    expect(within(host.container).getByRole('button', { name: /Puntos de vida de Ana: 7\D?000/ })).toBeInTheDocument()
    expect(within(guest.container).getByRole('group', { name: /Puntos de vida de Ana: 7\D?000/ })).toBeInTheDocument()
  })

  it('salir del duelo pide confirmación y vuelve al lobby', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    click(host, 'Crear un duelo')
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)

    typeInto(guest, 'Enlace o código', link)
    click(guest, 'Unirme')
    flush()
    click(host, 'Repartir mi mano')
    click(guest, 'Repartir mi mano')
    flush()

    click(guest, 'Salir del duelo')
    // Confirmar es otra acción, en un diálogo: cancelar no saca a nadie.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(within(guest.container).getByRole('button', { name: 'Salir del duelo' })).toBeInTheDocument()

    click(guest, 'Salir del duelo')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir del duelo' }))
    expect(within(guest.container).getByRole('button', { name: 'Crear un duelo' })).toBeInTheDocument()
  })
})
