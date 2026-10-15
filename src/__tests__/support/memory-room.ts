import { encodeSpectatorText } from '../../app/duel-relay-rules'
import type { DuelTransport } from '../../app/duel-session'
import type { SpectatorTransport } from '../../app/duel-spectator'

/**
 * Una sala de dos en memoria para probar el duelo sin red. Los mensajes no llegan solos: se acumulan en
 * `queue` y `flush()` los entrega en orden, así una prueba puede duplicarlos, reordenarlos o perderlos
 * antes de entregarlos, y cortar o volver a conectar a cualquiera de los dos.
 */

export type Envelope =
  | { to: MemoryEnd; text: string }
  | { to: MemoryEnd; present: boolean }
  | { to: MemoryEnd; watchers: number; sync: boolean }
  | { spectator: MemorySpectator; tagged: string }
  | { spectator: MemorySpectator; players: number }

export class MemoryEnd implements DuelTransport {
  connected = true
  private readonly messageListeners = new Set<(text: string) => void>()
  private readonly peerListeners = new Set<(present: boolean) => void>()
  private readonly watcherListeners = new Set<(count: number, needSync: boolean) => void>()

  constructor(private readonly room: MemoryRoom) {}

  send(text: string) {
    const other = this.room.other(this)

    this.room.sent.push(text)
    this.room.relayToSpectators(this, text)

    if (this.connected && other?.connected) {
      this.room.queue.push({ to: other, text })
    }
  }

  onMessage(listener: (text: string) => void) {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onPeer(listener: (present: boolean) => void) {
    this.peerListeners.add(listener)
    listener(this.room.peerPresent(this))
    return () => this.peerListeners.delete(listener)
  }

  onWatchers(listener: (count: number, needSync: boolean) => void) {
    this.watcherListeners.add(listener)
    return () => this.watcherListeners.delete(listener)
  }

  notifyWatchers(count: number, needSync: boolean) {
    this.watcherListeners.forEach((listener) => listener(count, needSync))
  }

  /** Se cae la conexión: no entra ni sale nada, y el otro lado ve que se fue. */
  disconnect() {
    if (this.connected) {
      this.connected = false
      this.room.announce(this)
    }
  }

  reconnect() {
    if (!this.connected) {
      this.connected = true
      this.room.announce(this)
    }
  }

  close() {
    this.disconnect()
    this.room.leave(this)
  }

  deliver(text: string) {
    if (this.connected) {
      this.messageListeners.forEach((listener) => listener(text))
    }
  }

  notify(present: boolean) {
    this.peerListeners.forEach((listener) => listener(present))
  }
}

/** Un espectador de la sala en memoria: recibe lo de los dos jugadores con su etiqueta y sólo puede pedir que repitan su estado. */
export class MemorySpectator implements SpectatorTransport {
  connected = true
  /** Cuántas veces pidió el estado. */
  syncRequests = 0
  private readonly taggedListeners = new Set<(tag: 0 | 1, text: string) => void>()
  private readonly playerListeners = new Set<(count: number) => void>()

  constructor(private readonly room: MemoryRoom) {}

  onTagged(listener: (tag: 0 | 1, text: string) => void) {
    this.taggedListeners.add(listener)
    return () => this.taggedListeners.delete(listener)
  }

  onPlayers(listener: (count: number) => void) {
    this.playerListeners.add(listener)
    return () => this.playerListeners.delete(listener)
  }

  requestSync() {
    this.syncRequests += 1
    this.room.askForState()
  }

  close() {
    this.connected = false
    this.room.dropSpectator(this)
  }

  deliver(tagged: string) {
    const tag = tagged[0] === '1' ? 1 : 0

    if (this.connected) {
      this.taggedListeners.forEach((listener) => listener(tag, tagged.slice(1)))
    }
  }

  notifyPlayers(count: number) {
    this.playerListeners.forEach((listener) => listener(count))
  }
}

export class MemoryRoom {
  readonly queue: Envelope[] = []
  readonly spectators: MemorySpectator[] = []
  /** Todo lo que se mandó (llegara o no), para revisar qué viajó por la red. */
  readonly sent: string[] = []
  private readonly ends: MemoryEnd[] = []

  join(): MemoryEnd {
    if (this.ends.length >= 2) {
      throw new Error('La sala es de dos')
    }

    const end = new MemoryEnd(this)
    this.ends.push(end)
    this.announce(end)
    return end
  }

  other(end: MemoryEnd): MemoryEnd | undefined {
    return this.ends.find((candidate) => candidate !== end)
  }

  peerPresent(end: MemoryEnd): boolean {
    return end.connected && (this.other(end)?.connected ?? false)
  }

  leave(end: MemoryEnd) {
    this.ends.splice(this.ends.indexOf(end), 1)
  }

  /** Un espectador entra: se entera de cuántos jugadores hay y los jugadores repiten su estado, como pide el relay. */
  spectate(): MemorySpectator {
    if (this.spectators.length >= 2) {
      throw new Error('Sólo dos espectadores')
    }

    const spectator = new MemorySpectator(this)

    this.spectators.push(spectator)
    this.queue.push({ spectator, players: this.ends.filter((end) => end.connected).length })
    this.askForState()
    return spectator
  }

  dropSpectator(spectator: MemorySpectator) {
    this.spectators.splice(this.spectators.indexOf(spectator), 1)
    this.ends.forEach((end) => this.queue.push({ to: end, watchers: this.spectators.length, sync: false }))
  }

  /** Les pide a los jugadores que repitan su estado (llegó un espectador, o se le perdió algo). */
  askForState() {
    this.ends.forEach((end) => this.queue.push({ to: end, watchers: this.spectators.length, sync: true }))
  }

  /** El texto de un jugador llega a los espectadores con su etiqueta (0 el primero que entró a la sala, 1 el segundo). */
  relayToSpectators(from: MemoryEnd, text: string) {
    const tag = this.ends.indexOf(from)

    if (tag !== 0 && tag !== 1) {
      return
    }

    for (const spectator of this.spectators) {
      this.queue.push({ spectator, tagged: encodeSpectatorText(tag, text) })
    }
  }

  /** Avisa a los dos de cómo quedó la sala después de que alguien entró, se cayó o volvió. */
  announce(changed: MemoryEnd) {
    const other = this.other(changed)

    this.queue.push({ to: changed, present: this.peerPresent(changed) })

    if (other) {
      this.queue.push({ to: other, present: this.peerPresent(other) })
    }

    for (const spectator of this.spectators) {
      this.queue.push({ spectator, players: this.ends.filter((end) => end.connected).length })
    }
  }

  /** Agrega un mensaje cualquiera (basura, uno viejo) como si lo hubiera mandado el otro lado. */
  inject(to: MemoryEnd, text: string) {
    this.queue.push({ to, text })
  }

  /** Entrega todo lo pendiente en orden, incluido lo que se genere al recibirlo. */
  flush() {
    for (let guard = 0; this.queue.length > 0; guard += 1) {
      if (guard > 100_000) {
        throw new Error('La sala no se calma: los mensajes se llaman entre sí sin parar')
      }

      const envelope = this.queue.shift()!

      if ('tagged' in envelope) {
        envelope.spectator.deliver(envelope.tagged)
      } else if ('players' in envelope) {
        envelope.spectator.notifyPlayers(envelope.players)
      } else if ('watchers' in envelope) {
        envelope.to.notifyWatchers(envelope.watchers, envelope.sync)
      } else if ('text' in envelope) {
        envelope.to.deliver(envelope.text)
      } else {
        envelope.to.notify(envelope.present)
      }
    }
  }
}

export const createMemoryRoom = () => new MemoryRoom()
