import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { DuelSettings } from './duel-protocol'
import { createParticipantId } from './duel-relay-rules'
import { readAutoEndSave, readDuelSave, writeDuelRecord, writeDuelSave } from './duel-save'
import { createDuel, type Duel, type DuelRole, type DuelSnapshot } from './duel-session'
import { createSpectator, type Spectator, type SpectatorSnapshot } from './duel-spectator'
import { createSocketTransport, type SocketStatus, type SocketTransport, type SpectatorSocket } from './duel-socket'

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

/** Cómo se conecta un espectador a una sala: igual, pero mirando. */
export type SpectatorConnect = (room: string, participant: string) => SpectatorSocket

export const connectSpectatorToRelay =
  (url: string): SpectatorConnect =>
  (room, participant) =>
    createSocketTransport({ url, room, participant, role: 'spectator' })

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
 * Lo propio del duelo (mi mesa, mis vidas, el reloj) se guarda en la pestaña a cada cambio y, al volver a entrar a la misma sala con el mismo rol (una recarga), se sigue desde ahí.
 * `transport` es la conexión (null junto con `duel`): por ella viaja también el duelo automático de una sala con reglas automáticas.
 */
export function useDuel({ room, role, name, settings, connect }: UseDuelInput): { duel: Duel | null; snapshot: DuelSnapshot | null; status: SocketStatus; transport: SocketTransport | null } {
  const [live, setLive] = useState<{ duel: Duel; transport: SocketTransport } | null>(null)
  const latest = useRef({ name, settings })
  latest.current = { name, settings }

  useEffect(() => {
    if (room === null) {
      return
    }

    const transport = connect(room, createParticipantId())
    const ended = readAutoEndSave(room, role)
    const duel = createDuel(transport, { role, ...latest.current, restore: readDuelSave(room, role) ?? undefined, ...(ended ? { ended } : {}) })
    let saved = duel.getSnapshot()
    const stopSaving = duel.subscribe(() => {
      // Sólo cuando algo de lo guardado cambió (las jugadas, las vidas o el reloj, la mesa de arranque): el chat y los avisos no pasan por acá.
      const now = duel.getSnapshot()

      // El registro del replay va aparte: cambia con cada jugada del rival, y lo mío no se reescribe por eso.
      if (now.record !== saved.record) writeDuelRecord(room, now)

      if (now.actions !== saved.actions || now.life !== saved.life || now.initial !== saved.initial || now.conceded !== saved.conceded || now.rematch.mine !== saved.rematch.mine) {
        writeDuelSave(room, now)
      }

      saved = now
    })

    setLive({ duel, transport })

    return () => {
      stopSaving()
      duel.close()
      setLive(null)
    }
  }, [room, role, connect])

  const snapshot = useSyncExternalStore(live ? live.duel.subscribe : noSubscribe, live ? live.duel.getSnapshot : noSnapshot)
  const status = useSyncExternalStore(
    live ? (listener) => live.transport.onStatus(listener) : noSubscribe,
    live ? () => live.transport.status : () => 'closed' as const,
  )

  return { duel: live?.duel ?? null, snapshot, status, transport: live?.transport ?? null }
}

/** Un duelo mirado como espectador: se conecta a la sala mientras `room` no sea null y se desconecta al cambiar o desmontarse. `connect` tiene que ser estable. */
export function useSpectator({ room, connect }: { room: string | null; connect: SpectatorConnect }): { spectator: Spectator | null; snapshot: SpectatorSnapshot | null; status: SocketStatus } {
  const [live, setLive] = useState<{ spectator: Spectator; transport: SpectatorSocket } | null>(null)

  useEffect(() => {
    if (room === null) {
      return
    }

    const transport = connect(room, createParticipantId())
    const spectator = createSpectator(transport)

    setLive({ spectator, transport })

    return () => {
      spectator.close()
      setLive(null)
    }
  }, [room, connect])

  const snapshot = useSyncExternalStore(live ? live.spectator.subscribe : noSubscribe, live ? live.spectator.getSnapshot : noSnapshot)
  const status = useSyncExternalStore(
    live ? (listener) => live.transport.onStatus(listener) : noSubscribe,
    live ? () => live.transport.status : () => 'closed' as const,
  )

  return { spectator: live?.spectator ?? null, snapshot, status }
}
