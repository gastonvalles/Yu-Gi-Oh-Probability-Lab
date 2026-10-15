import { DurableObject } from 'cloudflare:workers'

import {
  CLOSE_FULL,
  CLOSE_REPLACED,
  MAX_MESSAGE_BYTES,
  MAX_PARTICIPANTS,
  MAX_SPECTATORS,
  PARTICIPANT_ID_PATTERN,
  PING,
  PONG,
  ROOM_CODE_PATTERN,
  SPECTATOR_RESYNC,
  SPECTATOR_RESYNC_MS,
  RateLimiter,
  byteLength,
  encodeRelayFrame,
  encodeSpectatorText,
  originAllowed,
  type ParticipantRole,
} from '../../src/app/duel-relay-rules'

/**
 * Relay del duelo por enlace: una sala por código, de dos jugadores y hasta dos espectadores, que reenvía cada mensaje de texto
 * de un jugador al otro (y, con quién lo mandó, a los espectadores) sin leerlo ni guardarlo. Avisa a cada uno cuando alguien entra
 * o sale (con mensajes binarios, que los jugadores no pueden mandar) y se encarga de los límites: tamaño, ritmo, orígenes y sala llena.
 * No tiene base de datos: la sala existe mientras haya conexiones.
 *
 * Un espectador no puede hacer nada: lo que mande se descarta y lo desconecta, salvo pedir que los jugadores repitan su estado
 * (`resync`, como mucho cada dos segundos), que es lo único que necesita para ponerse al día. Ningún mensaje suyo llega a los jugadores.
 * Y entre todos los espectadores de una sala hay un tope de entradas y de pedidos de estado: un enlace de espectador usado en bucle no hace trabajar ni a los jugadores ni al relay.
 *
 * Usa la API de WebSockets con hibernación: entre mensajes la sala no consume. El latido (`ping`/`pong`)
 * lo contesta Cloudflare sin despertarla.
 *
 * Sólo cuenta, sin datos de nadie: `room_opened` cuando entra el primer jugador, `room_paired` cuando llega el
 * segundo y `room_watched` cuando entra un espectador (se leen en los registros del Worker). No se registra el código
 * de la sala ni ninguna dirección.
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

/** Cuántos pedidos de estado de más tolera de un espectador antes de desconectarlo (un cliente de verdad pide cada dos segundos; uno que se pasa por un instante no se corta). */
const MAX_SPECTATOR_STRIKES = 10

/** Lo que se guarda de cada conexión (sobrevive a la hibernación). Las de antes de los espectadores no traen rol: son jugadores. */
interface Attachment {
  participant?: string
  role?: ParticipantRole
  /** Quién es dentro de los jugadores (0 o 1), según el orden de llegada: es lo que ven los espectadores. */
  tag?: 0 | 1
}

declare const WebSocketPair: new () => { 0: Socket; 1: Socket }
declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string)
}

const attachmentOf = (socket: Socket): Attachment => (socket.deserializeAttachment() as Attachment | null) ?? {}

export class DuelRoom extends DurableObject {
  // Se pierden si la sala hiberna: el límite de ritmo vuelve a empezar y lo cerrado ya no figura en la lista.
  private readonly limiters = new WeakMap<Socket, RateLimiter>()
  private readonly closing = new WeakSet<Socket>()
  /** Pedidos de estado de más de cada espectador (ver `MAX_SPECTATOR_STRIKES`). */
  private readonly strikes = new WeakMap<Socket, number>()
  /** Cuántas veces, entre todos los espectadores, la sala les pide a los jugadores que repitan su estado: una ráfaga corta y después una cada `SPECTATOR_RESYNC_MS`. */
  private readonly resyncs = new RateLimiter(Date.now(), 1000 / SPECTATOR_RESYNC_MS, 3)
  /** Cuántos espectadores pueden entrar seguidos: pasado el tope se rechaza la conexión antes de abrirla (el cliente espera más cada vez que le falla). */
  private readonly joins = new RateLimiter(Date.now(), 0.5, 6)

  constructor(
    private readonly state: RoomState,
    env: Env,
  ) {
    super(state, env)
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
  }

  /**
   * Las conexiones de un rol: las aceptadas que no se están cerrando. No se mira `readyState`:
   * un socket recién aceptado todavía no figura como abierto durante la misma petición que lo acepta.
   */
  private members(role: ParticipantRole): Socket[] {
    return this.state.getWebSockets().filter((socket) => !this.closing.has(socket) && (attachmentOf(socket).role ?? 'player') === role)
  }

  private players(): Socket[] {
    return this.members('player')
  }

  private spectators(): Socket[] {
    return this.members('spectator')
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
      // Se está cerrando: el aviso de que se fue le llega a los demás por `webSocketClose`.
    }
  }

  /** Les dice a los jugadores si el otro está, y a los espectadores cuántos jugadores hay. */
  private announce() {
    const players = this.players()
    const peer = encodeRelayFrame({ kind: 'peer', present: players.length === MAX_PARTICIPANTS })
    const count = encodeRelayFrame({ kind: 'players', count: players.length })

    for (const player of players) {
      this.deliver(player, peer)
    }

    for (const spectator of this.spectators()) {
      this.deliver(spectator, count)
    }
  }

  /** Les dice a los jugadores cuántos espectadores hay; con `sync`, que quien llegó o se perdió algo necesita que repitan su estado. */
  private announceWatchers(sync: boolean) {
    const frame = encodeRelayFrame({ kind: 'watchers', count: this.spectators().length, sync })

    for (const player of this.players()) {
      this.deliver(player, frame)
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const participant = url.searchParams.get('pid') ?? ''
    const role: ParticipantRole = url.searchParams.get('role') === 'spectator' ? 'spectator' : 'player'

    if (request.headers.get('Upgrade') !== 'websocket' || !PARTICIPANT_ID_PATTERN.test(participant)) {
      return new Response('Bad request', { status: 400 })
    }

    if (role === 'spectator' && !this.joins.allow(Date.now())) {
      return new Response('Too many requests', { status: 429 })
    }

    const { 0: client, 1: server } = new WebSocketPair()

    // Una conexión nueva de la misma persona reemplaza a la vieja, que puede estar colgada sin que nadie lo sepa; si juega, hereda su lugar entre los jugadores.
    let inherited: 0 | 1 | undefined

    for (const socket of this.members(role)) {
      const old = attachmentOf(socket)

      if (old.participant === participant) {
        inherited = old.tag
        this.end(socket, CLOSE_REPLACED, 'replaced')
      }
    }

    const before = this.members(role).length
    const limit = role === 'spectator' ? MAX_SPECTATORS : MAX_PARTICIPANTS

    if (before >= limit) {
      // El que sobra se atiende aparte y no entra a la lista: recibe el aviso y se lo cierra.
      server.accept()
      server.send(encodeRelayFrame({ kind: 'full' }))
      server.close(CLOSE_FULL, 'full')
      return new Response(null, { status: 101, webSocket: client } as ResponseInit)
    }

    this.state.acceptWebSocket(server)

    if (role === 'spectator') {
      server.serializeAttachment({ participant, role } satisfies Attachment)
      // Un espectador no manda nada que no sea pedir el estado: ese pedido se le deja cada tanto.
      this.limiters.set(server, new RateLimiter(Date.now(), 1000 / SPECTATOR_RESYNC_MS, 2))
      console.log(JSON.stringify({ event: 'room_watched' }))
      this.deliver(server, encodeRelayFrame({ kind: 'players', count: this.players().length }))
      // Los jugadores repiten su estado para que quien llega se ponga al día (con tope: ver `resyncs`).
      this.announceWatchers(this.resyncs.allow(Date.now()))
      return new Response(null, { status: 101, webSocket: client } as ResponseInit)
    }

    const taken = new Set(this.players().map((player) => attachmentOf(player).tag))
    const tag: 0 | 1 = inherited ?? (taken.has(0) ? 1 : 0)

    server.serializeAttachment({ participant, role, tag } satisfies Attachment)
    this.limiters.set(server, new RateLimiter(Date.now()))

    if (before === 0) console.log(JSON.stringify({ event: 'room_opened' }))
    if (before === 1) console.log(JSON.stringify({ event: 'room_paired' }))
    this.announce()

    // Quien entra se entera de si lo están mirando.
    if (this.spectators().length > 0) {
      this.deliver(server, encodeRelayFrame({ kind: 'watchers', count: this.spectators().length, sync: false }))
    }

    return new Response(null, { status: 101, webSocket: client } as ResponseInit)
  }

  webSocketMessage(socket: Socket, message: string | ArrayBuffer) {
    const me = attachmentOf(socket)

    if (me.role === 'spectator') {
      // Un espectador no puede hacer nada: lo único que se le acepta es pedir el estado, y no seguido; todo lo demás lo desconecta.
      if (message !== SPECTATOR_RESYNC) {
        this.end(socket, 1008, 'spectators cannot send')
        return
      }

      const limiter = this.limiters.get(socket) ?? new RateLimiter(Date.now(), 1000 / SPECTATOR_RESYNC_MS, 2)
      this.limiters.set(socket, limiter)

      if (!limiter.allow(Date.now())) {
        const strikes = (this.strikes.get(socket) ?? 0) + 1

        this.strikes.set(socket, strikes)

        if (strikes >= MAX_SPECTATOR_STRIKES) {
          this.end(socket, 1008, 'rate')
        }

        return
      }

      if (this.resyncs.allow(Date.now())) {
        this.announceWatchers(true)
      }

      return
    }

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

    // Los espectadores reciben lo mismo, con quién lo mandó (lo asigna el relay: un jugador no puede hacerse pasar por el otro).
    const spectators = this.spectators()

    if (spectators.length > 0) {
      const tagged = encodeSpectatorText(me.tag ?? 0, message)

      for (const spectator of spectators) {
        this.deliver(spectator, tagged)
      }
    }
  }

  webSocketClose(socket: Socket, code: number, reason: string) {
    const role = attachmentOf(socket).role ?? 'player'

    // 1005 y 1006 son "sin código" y no se pueden enviar de vuelta.
    this.end(socket, code === 1005 || code === 1006 ? 1000 : code, reason)

    if (role === 'spectator') {
      this.announceWatchers(false)
    } else {
      this.announce()
    }
  }

  webSocketError(socket: Socket) {
    const role = attachmentOf(socket).role ?? 'player'

    this.end(socket, 1011, 'error')

    if (role === 'spectator') {
      this.announceWatchers(false)
    } else {
      this.announce()
    }
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
