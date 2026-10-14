import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { DuelSettings } from './duel-protocol'
import { createParticipantId } from './duel-relay-rules'
import { createDuel, type Duel, type DuelRole, type DuelSnapshot } from './duel-session'
import { createSocketTransport, type SocketStatus, type SocketTransport } from './duel-socket'

/** Cómo se conecta a una sala: por el relay en la app, por una sala en memoria en las pruebas. */
export type DuelConnect = (room: string, participant: string) => SocketTransport

/** La dirección del relay (`VITE_DUEL_RELAY_URL`); sin ella el duelo por enlace no se ofrece. */
export function duelRelayUrl(): string | null {
  return import.meta.env.VITE_DUEL_RELAY_URL?.trim() || null
}

export const connectToRelay =
  (url: string): DuelConnect =>
  (room, participant) =>
    createSocketTransport({ url, room, participant })

interface UseDuelInput {
  /** La sala a la que estar conectado; null = ninguna. */
  room: string | null
  role: DuelRole
  name: string
  settings?: DuelSettings
  connect: DuelConnect
}

const noSubscribe = () => () => {}
const noSnapshot = () => null

/**
 * Un duelo en curso: se conecta a la sala mientras `room` no sea null y se desconecta al cambiar o desmontarse.
 * El nombre y los ajustes se leen al conectar (cambiarlos después no reconecta). `connect` tiene que ser estable.
 */
export function useDuel({ room, role, name, settings, connect }: UseDuelInput): { duel: Duel | null; snapshot: DuelSnapshot | null; status: SocketStatus } {
  const [live, setLive] = useState<{ duel: Duel; transport: SocketTransport } | null>(null)
  const latest = useRef({ name, settings })
  latest.current = { name, settings }

  useEffect(() => {
    if (room === null) {
      return
    }

    const transport = connect(room, createParticipantId())
    const duel = createDuel(transport, { role, ...latest.current })

    setLive({ duel, transport })

    return () => {
      duel.close()
      setLive(null)
    }
  }, [room, role, connect])

  const snapshot = useSyncExternalStore(live ? live.duel.subscribe : noSubscribe, live ? live.duel.getSnapshot : noSnapshot)
  const status = useSyncExternalStore(
    live ? (listener) => live.transport.onStatus(listener) : noSubscribe,
    live ? () => live.transport.status : () => 'closed' as const,
  )

  return { duel: live?.duel ?? null, snapshot, status }
}
