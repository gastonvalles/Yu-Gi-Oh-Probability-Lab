import { DurableObject } from 'cloudflare:workers'

import {
  CLOSE_FULL,
  CLOSE_REPLACED,
  MAX_MESSAGE_BYTES,
  MAX_PARTICIPANTS,
  PARTICIPANT_ID_PATTERN,
  PING,
  PONG,
  ROOM_CODE_PATTERN,
  RateLimiter,
  byteLength,
  encodeRelayFrame,
  originAllowed,
} from '../../src/app/duel-relay-rules'

/**
 * Relay del duelo por enlace: una sala por código, de dos jugadores, que reenvía cada mensaje de texto
 * de uno al otro sin leerlo ni guardarlo. Avisa a cada uno cuando el otro entra o sale (con mensajes
 * binarios, que los jugadores no pueden mandar) y se encarga de los límites: tamaño, ritmo, orígenes y
 * sala llena. No tiene base de datos: la sala existe mientras haya conexiones.
 *
 * Usa la API de WebSockets con hibernación: entre mensajes la sala no consume. El latido (`ping`/`pong`)
 * lo contesta Cloudflare sin despertarla.
 *
 * Sólo cuenta, sin datos de nadie: `room_opened` cuando entra el primero y `room_paired` cuando llega el
 * segundo (se leen en los registros del Worker). No se registra el código de la sala ni ninguna dirección.
 */

// Lo poco que se usa de la API de Cloudflare (no se instala @cloudflare/workers-types para esto).
interface Socket {
  accept(): void
  send(data: string | ArrayBuffer | ArrayBufferView): void
  close(code?: number, reason?: string): void
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}

interface RoomState {
  acceptWebSocket(socket: Socket): void
  getWebSockets(): Socket[]
  setWebSocketAutoResponse(pair: unknown): void
}

interface Env {
  DUEL_ROOM: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } }
  /** Orígenes permitidos, separados por comas (`*` vale por letras, números y guiones). */
  ALLOWED_ORIGINS: string
}

declare const WebSocketPair: new () => { 0: Socket; 1: Socket }
declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string)
}

export class DuelRoom extends DurableObject {
  // Se pierden si la sala hiberna: el límite de ritmo vuelve a empezar y lo cerrado ya no figura en la lista.
  private readonly limiters = new WeakMap<Socket, RateLimiter>()
  private readonly closing = new WeakSet<Socket>()

  constructor(
    private readonly state: RoomState,
    env: Env,
  ) {
    super(state, env)
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
  }

  /**
   * Los jugadores que están en la sala: los aceptados que no se están cerrando. No se mira `readyState`:
   * un socket recién aceptado todavía no figura como abierto durante la misma petición que lo acepta.
   */
  private players(): Socket[] {
    return this.state.getWebSockets().filter((socket) => !this.closing.has(socket))
  }

  private end(socket: Socket, code: number, reason: string) {
    this.closing.add(socket)

    try {
      socket.close(code, reason)
    } catch {
      // Ya estaba cerrado.
    }
  }

  private deliver(socket: Socket, data: string | Uint8Array) {
    try {
      socket.send(data)
    } catch {
      // Se está cerrando: el aviso de que se fue le llega al otro por `webSocketClose`.
    }
  }

  /** Le dice a cada uno si el otro está. */
  private announce() {
    const players = this.players()
    const frame = encodeRelayFrame({ kind: 'peer', present: players.length === MAX_PARTICIPANTS })

    for (const player of players) {
      this.deliver(player, frame)
    }
  }

  async fetch(request: Request): Promise<Response> {
    const participant = new URL(request.url).searchParams.get('pid') ?? ''

    if (request.headers.get('Upgrade') !== 'websocket' || !PARTICIPANT_ID_PATTERN.test(participant)) {
      return new Response('Bad request', { status: 400 })
    }

    const { 0: client, 1: server } = new WebSocketPair()

    // Una conexión nueva del mismo jugador reemplaza a la vieja, que puede estar colgada sin que nadie lo sepa.
    for (const socket of this.players()) {
      if ((socket.deserializeAttachment() as { participant?: string } | null)?.participant === participant) {
        this.end(socket, CLOSE_REPLACED, 'replaced')
      }
    }

    const before = this.players().length

    if (before >= MAX_PARTICIPANTS) {
      // El tercero se atiende aparte y no entra a la lista de jugadores: recibe el aviso y se lo cierra.
      server.accept()
      server.send(encodeRelayFrame({ kind: 'full' }))
      server.close(CLOSE_FULL, 'full')
      return new Response(null, { status: 101, webSocket: client } as ResponseInit)
    }

    this.state.acceptWebSocket(server)
    server.serializeAttachment({ participant })
    this.limiters.set(server, new RateLimiter(Date.now()))

    if (before === 0) console.log(JSON.stringify({ event: 'room_opened' }))
    if (before === 1) console.log(JSON.stringify({ event: 'room_paired' }))
    this.announce()

    return new Response(null, { status: 101, webSocket: client } as ResponseInit)
  }

  webSocketMessage(socket: Socket, message: string | ArrayBuffer) {
    // Los jugadores sólo mandan texto, y poco: lo binario es del relay.
    if (typeof message !== 'string') {
      this.end(socket, 1003, 'binary')
      return
    }

    if (byteLength(message) > MAX_MESSAGE_BYTES) {
      this.end(socket, 1009, 'too big')
      return
    }

    const limiter = this.limiters.get(socket) ?? new RateLimiter(Date.now())
    this.limiters.set(socket, limiter)

    if (!limiter.allow(Date.now())) {
      this.end(socket, 1008, 'rate')
      return
    }

    for (const other of this.players()) {
      if (other !== socket) {
        this.deliver(other, message)
      }
    }
  }

  webSocketClose(socket: Socket, code: number, reason: string) {
    // 1005 y 1006 son "sin código" y no se pueden enviar de vuelta.
    this.end(socket, code === 1005 || code === 1006 ? 1000 : code, reason)
    this.announce()
  }

  webSocketError(socket: Socket) {
    this.end(socket, 1011, 'error')
    this.announce()
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const route = /^\/room\/([^/]+)$/.exec(url.pathname)

    if (!route) {
      return new Response('ygo-lab duel relay', { status: 200 })
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 })
    }

    if (!originAllowed(request.headers.get('Origin'), env.ALLOWED_ORIGINS)) {
      return new Response('Forbidden', { status: 403 })
    }

    const code = route[1]!

    if (!ROOM_CODE_PATTERN.test(code)) {
      return new Response('Bad room', { status: 400 })
    }

    return env.DUEL_ROOM.get(env.DUEL_ROOM.idFromName(code)).fetch(request)
  },
}
