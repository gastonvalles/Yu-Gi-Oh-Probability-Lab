/**
 * Lo que comparten la app y el relay del duelo por enlace (el Worker de Cloudflare de `duel-relay/`):
 * límites, códigos de sala, validaciones y los avisos del relay. No importa nada, porque el relay lo
 * empaqueta tal cual.
 *
 * Quién habla con quién: los jugadores se mandan mensajes de TEXTO (el protocolo de `duel-protocol.ts`)
 * y el relay los reenvía sin tocarlos. Los avisos del relay a cada jugador (el otro entró o salió, la
 * sala está llena) viajan en cambio como mensajes BINARIOS, y el relay rechaza cualquier binario que
 * mande un jugador: así nadie puede hacerse pasar por el relay ("tu rival se fue").
 */

/** Tope de un mensaje: una mesa completa en un `sync` ocupa unos 3 KB. */
export const MAX_MESSAGE_BYTES = 16 * 1024
export const MAX_PARTICIPANTS = 2
/** Mensajes por segundo que aguanta una conexión (con una ráfaga del doble). */
export const RATE_PER_SECOND = 30

/** Sin 0, O, 1, I ni L: se dictan y se leen sin confundirse. 31 letras, 8 lugares: unos 40 bits. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 8
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/

/** Quién es cada conexión dentro de la sala: lo elige la página al cargar y sirve para reemplazar una conexión colgada. */
export const PARTICIPANT_ID_PATTERN = /^[A-Za-z0-9]{8,32}$/
const PARTICIPANT_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Latido: el cliente manda `ping` y el relay contesta `pong` sin despertar la sala. */
export const PING = 'ping'
export const PONG = 'pong'

/** `length` letras del alfabeto al azar, sin sesgo (se descartan los bytes que no reparten parejo). */
function randomString(alphabet: string, length: number): string {
  const limit = 256 - (256 % alphabet.length)
  let result = ''

  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && result.length < length) {
        result += alphabet[byte % alphabet.length]
      }
    }
  }

  return result
}

export const createRoomCode = () => randomString(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH)
export const createParticipantId = () => randomString(PARTICIPANT_ID_ALPHABET, 16)

export const byteLength = (text: string) => new TextEncoder().encode(text).length

/** Lo que el relay le avisa a un jugador. */
export type RelayFrame = { kind: 'peer'; present: boolean } | { kind: 'full' }

const FRAME_PEER = 1
const FRAME_FULL = 2

export function encodeRelayFrame(frame: RelayFrame): Uint8Array {
  return frame.kind === 'full' ? Uint8Array.of(FRAME_FULL) : Uint8Array.of(FRAME_PEER, frame.present ? 1 : 0)
}

export function parseRelayFrame(data: ArrayBuffer): RelayFrame | null {
  const bytes = new Uint8Array(data)

  if (bytes.length === 2 && bytes[0] === FRAME_PEER && (bytes[1] === 0 || bytes[1] === 1)) {
    return { kind: 'peer', present: bytes[1] === 1 }
  }

  return bytes.length === 1 && bytes[0] === FRAME_FULL ? { kind: 'full' } : null
}

/** Códigos con que el relay cierra una conexión (y que la app entiende). */
export const CLOSE_REPLACED = 4000
export const CLOSE_FULL = 4001

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * ¿Pide la conexión una página permitida? `allowed` es una lista separada por comas de orígenes
 * completos; un `*` vale por letras, números y guiones (para los despliegues de prueba). Un navegador
 * siempre manda su origen: sin él, no pasa. Esto frena el abuso desde otras páginas, no es seguridad.
 */
export function originAllowed(origin: string | null, allowed: string): boolean {
  if (!origin) {
    return false
  }

  return allowed
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .some((pattern) => new RegExp(`^${pattern.split('*').map(escapeRegExp).join('[a-z0-9-]*')}$`, 'i').test(origin))
}

/** Cubo de fichas: `perSecond` mensajes por segundo y hasta el doble de golpe. */
export class RateLimiter {
  private tokens: number
  private last: number

  constructor(
    now: number,
    private readonly perSecond = RATE_PER_SECOND,
    private readonly burst = RATE_PER_SECOND * 2,
  ) {
    this.tokens = burst
    this.last = now
  }

  allow(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + (Math.max(0, now - this.last) / 1000) * this.perSecond)
    this.last = now

    if (this.tokens < 1) {
      return false
    }

    this.tokens -= 1
    return true
  }
}
