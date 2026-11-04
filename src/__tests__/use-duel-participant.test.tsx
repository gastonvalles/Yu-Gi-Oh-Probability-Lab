// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDuel, useSpectator } from '../app/use-duel'
import { asSocket, asSpectatorSocket } from './support/duel-screen-harness'
import { createMemoryRoom } from './support/memory-room'

afterEach(cleanup)

// En desarrollo StrictMode corre el efecto dos veces: la segunda conexión tiene que ser la misma persona (el relay la toma como reemplazo) y no un tercero que encuentra la sala «completa».
describe('quién soy en la sala: uno por montaje', () => {
  it('el jugador se vuelve a conectar con el mismo pid aunque el efecto corra dos veces', () => {
    const memory = createMemoryRoom()
    const connect = vi.fn((_room: string, _participant: string) => asSocket(memory.join()))
    const { result, unmount } = renderHook(() => useDuel({ room: 'ABCDEFGH', role: 'guest', name: 'Beto', connect }), { wrapper: StrictMode })

    expect(connect.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(new Set(connect.mock.calls.map(([, participant]) => participant)).size).toBe(1)
    expect(result.current.duel).not.toBeNull()
    unmount()
  })

  it('el espectador también', () => {
    const memory = createMemoryRoom()
    const connect = vi.fn((_room: string, _participant: string) => asSpectatorSocket(memory.spectate()))
    renderHook(() => useSpectator({ room: 'ABCDEFGH', connect }), { wrapper: StrictMode })

    expect(connect.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(new Set(connect.mock.calls.map(([, participant]) => participant)).size).toBe(1)
  })

  it('otro montaje (otra pestaña) es otra persona', () => {
    const memory = createMemoryRoom()
    const connect = vi.fn((_room: string, _participant: string) => asSocket(memory.join()))
    renderHook(() => useDuel({ room: 'ABCDEFGH', role: 'host', name: 'Ana', connect }))
    renderHook(() => useDuel({ room: 'ABCDEFGH', role: 'guest', name: 'Beto', connect }))

    expect(connect.mock.calls[0]![1]).not.toBe(connect.mock.calls[1]![1])
  })
})
