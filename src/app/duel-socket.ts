import { CLOSE_FULL, PING, PONG, SPECTATOR_RESYNC, parseRelayFrame, parseSpectatorText, type ParticipantRole } from './duel-relay-rules'
import type { DuelTransport } from './duel-session'

/**
 * El transporte del duelo por internet: un WebSocket contra el relay (`duel-relay/`) que se reconecta
 * solo. Implementa `DuelTransport`, así que `createDuel` no sabe si habla con el relay o con una sala en
 * memoria.
 *
 * Lo que hace por el camino:
 * - Si se corta, reintenta con espera creciente. El celular bloqueado o en segundo plano deja la conexión
 *   muerta sin avisar: un latido (`ping`/`pong`) la detecta, y al volver a la pestaña o recuperar la red
 *   se reconecta enseguida, sin esperar el reintento.
 * - Mientras no hay conexión el rival figura como ausente; al volver, el relay avisa y los dos se dan la
 *   mano de nuevo (`hello` + `sync`), que es lo que repone lo que se perdió.
 * - Los avisos del relay llegan como mensajes binarios y los del rival como texto: nadie puede hacerse
 *   pasar por el relay.
 * - Como espectador (`role: 'spectator'`) sólo se mira: llega el texto de los dos jugadores con quién lo mandó y no se puede mandar nada, salvo pedir que
 *   los jugadores repitan su estado (`requestSync`). Un relay que no conoce a los espectadores (anterior) se detecta y no se intenta de nuevo.
 */

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'full' | 'closed' | 'unsupported'

export interface SocketTransport extends DuelTransport {
  readonly status: SocketStatus
  /** Avisa enseguida del estado de ahora y después de cada cambio. */
  onStatus(listener: (status: SocketStatus) => void): () => void
}

/** Lo que ve un espectador de la conexión: el texto de cada jugador con quién lo mandó (0 o 1), cuántos jugadores hay, y poder pedir que repitan su estado. */
export interface SpectatorSocket {
  readonly status: SocketStatus
  onStatus(listener: (status: SocketStatus) => void): () => void
  onTagged(listener: (tag: 0 | 1, text: string) => void): () => void
  onPlayers(listener: (count: number) => void): () => void
  requestSync(): void
  close(): void
}

/** Lo mínimo de un `WebSocket` que usa el transporte (las pruebas ponen uno falso). */
export interface SocketLike {
  binaryType: string
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: ((event: unknown) => void) | null
}

interface SocketOptions {
  /** Dirección del relay (`wss://…`), sin la sala. */
  url: string
  room: string
  /** Quién soy dentro de la sala (`createParticipantId`): una conexión nueva reemplaza a una colgada del mismo. */
  participant: string
  /** Juega (lo de siempre) o mira. */
  role?: ParticipantRole
  createSocket?: (url: string) => SocketLike
  random?: () => number
}

const OPEN = 1
const BACKOFF_BASE_MS = 500
const BACKOFF_MAX_MS = 8000
const HEARTBEAT_MS = 20_000
const PONG_TIMEOUT_MS = 8000

export function createSocketTransport(options: SocketOptions): SocketTransport & SpectatorSocket {
  const { url, room, participant } = options
  const spectator = options.role === 'spectator'
  // El `WebSocket` del navegador cumple `SocketLike` salvo por detalles de tipos de sus manejadores.
  const create: (url: string) => SocketLike = options.createSocket ?? ((target) => new WebSocket(target) as unknown as SocketLike)
  const random = options.random ?? Math.random

  const messageListeners = new Set<(text: string) => void>()
  const peerListeners = new Set<(present: boolean) => void>()
  const statusListeners = new Set<(status: SocketStatus) => void>()
  const watcherListeners = new Set<(count: number, needSync: boolean) => void>()
  const taggedListeners = new Set<(tag: 0 | 1, text: string) => void>()
  const playerListeners = new Set<(count: number) => void>()

  let status: SocketStatus = 'connecting'
  let peerPresent = false
  let socket: SocketLike | null = null
  let attempt = 0
  let stopped = false
  let full = false
  /** Un espectador que se encontró con un relay anterior a los espectadores: ahí no se puede mirar. */
  let unsupported = false
  /** Si alguna vez estuvo abierta: volver a conectar es "reconectando", no "conectando". */
  let hasOpened = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let pongTimer: ReturnType<typeof setTimeout> | undefined

  const setStatus = (next: SocketStatus) => {
    if (next !== status) {
      status = next
      statusListeners.forEach((listener) => listener(next))
    }
  }

  const setPeer = (present: boolean) => {
    if (present !== peerPresent) {
      peerPresent = present
      peerListeners.forEach((listener) => listener(present))
    }
  }

  const stopHeartbeat = () => {
    clearInterval(heartbeat)
    clearTimeout(pongTimer)
  }

  /** La conexión se fue (o se la da por muerta): el rival figura ausente y se reintenta, salvo que ya no corresponda. */
  const lost = (code: number) => {
    stopHeartbeat()
    socket = null
    setPeer(false)

    if (stopped) {
      return
    }

    if (unsupported) {
      setStatus('unsupported')
      return
    }

    if (code === CLOSE_FULL || full) {
      setStatus('full')
      return
    }

    setStatus('reconnecting')
    retryTimer = setTimeout(connect, Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt) * (0.75 + random() * 0.5))
    attempt += 1
  }

  const ping = () => {
    if (socket?.readyState === OPEN) {
      const current = socket

      socket.send(PING)
      clearTimeout(pongTimer)
      // Sin respuesta, la conexión está muerta aunque nadie lo haya avisado: se la deja y se vuelve a empezar.
      pongTimer = setTimeout(() => {
        if (socket === current) {
          lost(1006)
          current.close()
        }
      }, PONG_TIMEOUT_MS)
    }
  }

  function connect() {
    clearTimeout(retryTimer)
    setStatus(attempt === 0 && !hasOpened ? 'connecting' : 'reconnecting')

    const ws = create(`${url}/room/${room}?pid=${participant}${spectator ? '&role=spectator' : ''}`)
    ws.binaryType = 'arraybuffer'
    socket = ws

    ws.onopen = () => {
      if (socket === ws) {
        attempt = 0
        hasOpened = true
        setStatus('open')
        heartbeat = setInterval(ping, HEARTBEAT_MS)
      }
    }

    ws.onmessage = ({ data }) => {
      if (socket !== ws) {
        return
      }

      // Cualquier cosa que llegue prueba que la conexión vive.
      clearTimeout(pongTimer)

      if (typeof data === 'string') {
        if (data === PONG) {
          return
        }

        if (spectator) {
          const tagged = parseSpectatorText(data)

          if (tagged) {
            taggedListeners.forEach((listener) => listener(tagged.tag, tagged.text))
          }
        } else {
          messageListeners.forEach((listener) => listener(data))
        }
      } else if (typeof data === 'object' && data !== null) {
        // Con `binaryType = 'arraybuffer'` es un ArrayBuffer (no se pregunta `instanceof`: puede venir de otro contexto).
        const frame = parseRelayFrame(data as ArrayBuffer)

        if (frame?.kind === 'peer') {
          if (spectator) {
            // Un relay que sabe de espectadores le avisa "cuántos jugadores hay"; si contesta como a un jugador, es el anterior y esta conexión ocupó un lugar que no era suyo.
            unsupported = true
            setStatus('unsupported')
            ws.close()
          } else {
            setPeer(frame.present)
          }
        } else if (frame?.kind === 'players') {
          playerListeners.forEach((listener) => listener(frame.count))
        } else if (frame?.kind === 'watchers') {
          watcherListeners.forEach((listener) => listener(frame.count, frame.sync))
        } else if (frame?.kind === 'full') {
          // La sala está llena: no se reintenta. No se espera el cierre del relay, que puede no llegar.
          full = true
          setStatus('full')
          ws.close()
        }
      }
    }

    ws.onclose = ({ code }) => {
      if (socket === ws) {
        lost(code)
      }
    }

    ws.onerror = () => {
      // La caída llega por `onclose`.
    }
  }

  /** Volvió la pestaña o la red: si la conexión no está, se reconecta ya; si parece estar, se comprueba. */
  const wake = () => {
    if (stopped || status === 'full' || unsupported) {
      return
    }

    if (socket) {
      ping()
    } else {
      attempt = 0
      connect()
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      wake()
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', wake)
  }

  connect()

  return {
    get status() {
      return status
    },

    send(text) {
      // Un espectador no manda nada (el relay lo desconectaría): sólo mira.
      if (!spectator && socket?.readyState === OPEN) {
        socket.send(text)
      }
    },

    requestSync() {
      if (spectator && socket?.readyState === OPEN) {
        socket.send(SPECTATOR_RESYNC)
      }
    },

    onWatchers(listener) {
      watcherListeners.add(listener)
      return () => watcherListeners.delete(listener)
    },

    onTagged(listener) {
      taggedListeners.add(listener)
      return () => taggedListeners.delete(listener)
    },

    onPlayers(listener) {
      playerListeners.add(listener)
      return () => playerListeners.delete(listener)
    },

    onMessage(listener) {
      messageListeners.add(listener)
      return () => messageListeners.delete(listener)
    },

    onPeer(listener) {
      peerListeners.add(listener)
      listener(peerPresent)
      return () => peerListeners.delete(listener)
    },

    onStatus(listener) {
      statusListeners.add(listener)
      listener(status)
      return () => statusListeners.delete(listener)
    },

    close() {
      stopped = true
      clearTimeout(retryTimer)
      stopHeartbeat()

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('online', wake)
      }

      const current = socket
      socket = null
      current?.close(1000)
      setPeer(false)
      setStatus('closed')
    },
  }
}
