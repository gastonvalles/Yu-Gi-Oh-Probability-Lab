import type { DuelTransport } from '../../app/duel-session'

/**
 * Una sala de dos en memoria para probar el duelo sin red. Los mensajes no llegan solos: se acumulan en
 * `queue` y `flush()` los entrega en orden, así una prueba puede duplicarlos, reordenarlos o perderlos
 * antes de entregarlos, y cortar o volver a conectar a cualquiera de los dos.
 */

export type Envelope = { to: MemoryEnd; text: string } | { to: MemoryEnd; present: boolean }

export class MemoryEnd implements DuelTransport {
  connected = true
  private readonly messageListeners = new Set<(text: string) => void>()
  private readonly peerListeners = new Set<(present: boolean) => void>()

  constructor(private readonly room: MemoryRoom) {}

  send(text: string) {
    const other = this.room.other(this)

    this.room.sent.push(text)

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

export class MemoryRoom {
  readonly queue: Envelope[] = []
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

  /** Avisa a los dos de cómo quedó la sala después de que alguien entró, se cayó o volvió. */
  announce(changed: MemoryEnd) {
    const other = this.other(changed)

    this.queue.push({ to: changed, present: this.peerPresent(changed) })

    if (other) {
      this.queue.push({ to: other, present: this.peerPresent(other) })
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

      if ('text' in envelope) {
        envelope.to.deliver(envelope.text)
      } else {
        envelope.to.notify(envelope.present)
      }
    }
  }
}

export const createMemoryRoom = () => new MemoryRoom()
