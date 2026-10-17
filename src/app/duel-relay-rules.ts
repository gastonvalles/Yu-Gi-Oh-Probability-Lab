/**
 * Lo que comparten la app y el relay del duelo por enlace (el Worker de Cloudflare de `duel-relay/`):
 * límites, códigos de sala, validaciones y los avisos del relay. No importa nada, porque el relay lo
 * empaqueta tal cual.
 *
 * Quién habla con quién: los jugadores se mandan mensajes de TEXTO (el protocolo de `duel-protocol.ts`)
 * y el relay los reenvía sin tocarlos. Los avisos del relay a cada jugador (el otro entró o salió, la
 * sala está llena) viajan en cambio como mensajes BINARIOS, y el relay rechaza cualquier binario que
 * mande un jugador: así nadie puede hacerse pasar por el relay ("tu rival se fue").
 *
 * Espectadores: hasta dos por sala, que miran y no pueden hacer nada. Reciben el texto de los dos jugadores, cada mensaje precedido de quién lo mandó (un 0 o un 1),
 * y los avisos del relay. Lo único que se les acepta es pedir que los jugadores repitan su estado (`SPECTATOR_RESYNC`, poco seguido); todo lo demás los desconecta.
 */

/** Tope de un mensaje: una mesa completa en un `sync` ocupa unos 3 KB. */
export const MAX_MESSAGE_BYTES = 16 * 1024
export const MAX_PARTICIPANTS = 2
/** Cuántos pueden mirar una sala a la vez (aparte de los dos que juegan). */
export const MAX_SPECTATORS = 2

/** Qué es una conexión: juega o mira. Lo dice la página al conectarse (`role=spectator`); sin decir nada, juega. */
export type ParticipantRole = 'player' | 'spectator'
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

/**
 * Lo que el relay avisa: a un jugador, si el otro está (`peer`), cuántos espectadores hay y si alguno pide el estado (`watchers`: `sync` es que quien entró o se perdió
 * algo necesita que repitas lo tuyo); a un espectador, cuántos jugadores hay (`players`); y a quien sobra, que la sala está llena (`full`).
 */
export type RelayFrame =
  | { kind: 'peer'; present: boolean }
  | { kind: 'full' }
  | { kind: 'players'; count: number }
  | { kind: 'watchers'; count: number; sync: boolean }

const FRAME_PEER = 1
const FRAME_FULL = 2
const FRAME_PLAYERS = 3
const FRAME_WATCHERS = 4

export function encodeRelayFrame(frame: RelayFrame): Uint8Array {
  switch (frame.kind) {
    case 'full':
      return Uint8Array.of(FRAME_FULL)
    case 'peer':
      return Uint8Array.of(FRAME_PEER, frame.present ? 1 : 0)
    case 'players':
      return Uint8Array.of(FRAME_PLAYERS, frame.count)
    case 'watchers':
      return Uint8Array.of(FRAME_WATCHERS, frame.count, frame.sync ? 1 : 0)
  }
}

export function parseRelayFrame(data: ArrayBuffer): RelayFrame | null {
  const bytes = new Uint8Array(data)

  if (bytes.length === 2 && bytes[0] === FRAME_PEER && (bytes[1] === 0 || bytes[1] === 1)) {
    return { kind: 'peer', present: bytes[1] === 1 }
  }

  if (bytes.length === 2 && bytes[0] === FRAME_PLAYERS && bytes[1]! <= MAX_PARTICIPANTS) {
    return { kind: 'players', count: bytes[1]! }
  }

  if (bytes.length === 3 && bytes[0] === FRAME_WATCHERS && bytes[1]! <= MAX_SPECTATORS && (bytes[2] === 0 || bytes[2] === 1)) {
    return { kind: 'watchers', count: bytes[1]!, sync: bytes[2] === 1 }
  }

  return bytes.length === 1 && bytes[0] === FRAME_FULL ? { kind: 'full' } : null
}

/** Lo único que un espectador puede mandar: que los jugadores repitan su estado (porque llegó, o se perdió algo). Sale como mucho cada `SPECTATOR_RESYNC_MS`. */
export const SPECTATOR_RESYNC = 'resync'
export const SPECTATOR_RESYNC_MS = 2000

/** El texto de un jugador como lo recibe un espectador: precedido de quién lo mandó (0 o 1, lo asigna el relay según el orden de llegada, no el jugador). */
export const encodeSpectatorText = (tag: 0 | 1, text: string) => `${tag}${text}`

export function parseSpectatorText(raw: string): { tag: 0 | 1; text: string } | null {
  const first = raw[0]

  return (first === '0' || first === '1') && raw.length > 1 ? { tag: first === '0' ? 0 : 1, text: raw.slice(1) } : null
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

/**
 * Salas públicas: una lista de las salas abiertas que cualquiera puede ver en el lobby y entrar sin que le pasen un enlace. El relay no lee los mensajes
 * de las salas, así que la lista es aparte (`RoomRegistry`, que guarda el Durable Object `RoomIndex`): el anfitrión anota su sala al crearla y la baja
 * cuando llega el rival o se va; y una sala que nadie bajó (se cerró la pestaña) vence sola a los 30 minutos.
 */

/** Cuánto dura una sala en la lista. */
export const PUBLIC_ROOM_TTL_MS = 30 * 60 * 1000
/** Cuántas salas caben en la lista a la vez: con la lista llena, no se anotan más hasta que alguna se libere o venza. */
export const MAX_PUBLIC_ROOMS = 100
export const MAX_HOST_NAME = 40
/** Los formatos que puede tener una sala pública (los del builder). */
export const PUBLIC_ROOM_FORMATS = ['tcg', 'ocg', 'goat', 'edison', 'genesys', 'unlimited'] as const
/** Los relojes que puede tener una sala pública: los de hoy (50 o sin tiempo) y los que ofrecían las versiones de antes. */
export const PUBLIC_ROOM_LIMITS_MIN = [0, 20, 40, 50, 60, 90] as const

/** Cuánto puede pasar sin un latido del anfitrión (avisa cada minuto) para que un duelo en vivo deje de figurar. */
export const LIVE_DUEL_TTL_MS = 3 * 60 * 1000
/** Y el tope de cuánto figura un mismo duelo en vivo aunque siga latiendo (un Match largo dura menos). */
export const LIVE_DUEL_MAX_MS = 4 * 60 * 60 * 1000
/** Cada cuánto avisa el anfitrión que su duelo público sigue en vivo. */
export const LIVE_HEARTBEAT_MS = 60 * 1000

/** Lo que se muestra de una sala pública antes de entrar. */
export interface PublicRoomInfo {
  host: string
  match: boolean
  siding: boolean
  format: string
  limitMin: number
  /** Sólo en Genesys: el total de puntos que no puede pasar el deck de nadie en esa sala (de 1 a 999). */
  genesysCap?: number
}

export interface PublicRoom extends PublicRoomInfo {
  code: string
  /** Cuándo se anotó (milisegundos): de acá cuentan los 30 minutos. */
  createdAt: number
}

/**
 * Un duelo público que se está jugando: el mismo `PublicRoomInfo` (el anfitrión, el formato, el reloj) sin el nombre de nadie más (quien entró a una sala pública no
 * aceptó figurar en una lista), cuántos lo miran (hasta dos: el tope de espectadores del relay) y desde cuándo está en vivo. Los duelos privados nunca llegan acá.
 */
export interface LiveDuel extends PublicRoomInfo {
  code: string
  watchers: number
  since: number
  /** Contra quién juega el anfitrión: el nombre que puso quien entró a la sala pública (sin él, un anfitrión de antes que no lo manda). */
  guest?: string
}

/** Cuántos miran, de lo que avisa el anfitrión: un entero de 0 hasta el tope de espectadores; `null` si no lo es. */
export function parseWatchers(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SPECTATORS ? value : null
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** El nombre de un jugador, sin caracteres de control ni espacios de más y de hasta `MAX_HOST_NAME`; vacío si no es un texto. */
export function cleanPlayerName(value: unknown): string {
  // eslint-disable-next-line no-control-regex
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_HOST_NAME) : ''
}

/** Lo que manda un anfitrión al anotar su sala, ya revisado (el nombre sin caracteres de control ni espacios de más); `null` si viene mal formado. */
export function parsePublicRoomInfo(value: unknown): PublicRoomInfo | null {
  if (!isPlainObject(value) || typeof value.host !== 'string' || typeof value.match !== 'boolean' || typeof value.siding !== 'boolean') {
    return null
  }

  const host = cleanPlayerName(value.host)

  if (host === '' || !(PUBLIC_ROOM_FORMATS as readonly unknown[]).includes(value.format) || !(PUBLIC_ROOM_LIMITS_MIN as readonly unknown[]).includes(value.limitMin)) {
    return null
  }

  // El tope de Genesys es opcional (un cliente de antes no lo manda) y sólo cuenta en Genesys: si viene mal, se ignora en vez de rechazar la sala.
  const cap = value.format === 'genesys' && typeof value.genesysCap === 'number' && Number.isInteger(value.genesysCap) && value.genesysCap >= 1 && value.genesysCap <= 999 ? { genesysCap: value.genesysCap } : {}

  return { host, match: value.match, siding: value.match && value.siding, format: value.format as string, limitMin: value.limitMin as number, ...cap }
}

interface RegistryEntry {
  room: PublicRoom
  /** Lo que prueba que quien baja una sala es quien la anotó: el código de una sala pública se ve en la lista, el token no. */
  token: string
  /** Si el duelo ya empezó (llegó el rival) y su anfitrión sigue avisándolo: cuántos miran, desde cuándo y cuándo fue el último aviso, y el nombre del rival. Sin esto, la sala espera rival. */
  live?: { watchers: number; since: number; seenAt: number; guest?: string }
}

/**
 * La lista de salas públicas. Pura y con la hora que se le da (no lee el reloj), para probarla; el Worker la guarda entera en el almacenamiento del Durable
 * Object entre pedidos (`toJSON` / `RoomRegistry.from`).
 */
export class RoomRegistry {
  private entries: Map<string, RegistryEntry>

  constructor(entries: readonly RegistryEntry[] = []) {
    this.entries = new Map(entries.map((entry) => [entry.room.code, entry]))
  }

  private purge(now: number) {
    for (const [code, entry] of this.entries) {
      // Una sala que espera vence a los 30 minutos; un duelo en vivo, cuando su anfitrión deja de avisar (o pasa el tope).
      const expired = entry.live ? now - entry.live.seenAt >= LIVE_DUEL_TTL_MS || now - entry.live.since >= LIVE_DUEL_MAX_MS : now - entry.room.createdAt >= PUBLIC_ROOM_TTL_MS

      if (expired) {
        this.entries.delete(code)
      }
    }
  }

  /** Anota una sala. Anotar de nuevo con el mismo token (el anfitrión que recargó) la renueva; con otro, no pisa la de otro. */
  register(code: string, info: PublicRoomInfo, token: string, now: number): 'ok' | 'taken' | 'full' {
    this.purge(now)

    const current = this.entries.get(code)

    if (current && current.token !== token) {
      return 'taken'
    }

    if (!current && this.entries.size >= MAX_PUBLIC_ROOMS) {
      return 'full'
    }

    // Renovar no estira la vida de la sala: sigue contando desde que se anotó la primera vez. Si venía en vivo y el rival se fue, vuelve a esperar rival (y a contar sus 30 minutos).
    this.entries.set(code, { room: { ...info, code, createdAt: current && !current.live ? current.room.createdAt : now }, token })
    return 'ok'
  }

  /**
   * El anfitrión de una sala pública avisa que su duelo está en vivo (llegó el rival) y cuántos lo miran. Pasa la sala de la lista de las que esperan a la de los duelos en vivo;
   * lo repite cada minuto (si deja de avisar, vence). Con otro token no se pisa la de otro; sin sala anotada (venció, o el Worker se reinició) la crea.
   */
  markLive(code: string, info: PublicRoomInfo, watchers: number, token: string, now: number, guest?: string): 'ok' | 'taken' | 'full' {
    this.purge(now)

    const current = this.entries.get(code)

    if (current && current.token !== token) {
      return 'taken'
    }

    if (!current && this.entries.size >= MAX_PUBLIC_ROOMS) {
      return 'full'
    }

    this.entries.set(code, { room: { ...info, code, createdAt: current?.room.createdAt ?? now }, token, live: { watchers, since: current?.live?.since ?? now, seenAt: now, ...(guest ? { guest } : {}) } })
    return 'ok'
  }

  /** Las salas que esperan rival, las más nuevas primero (sin los tokens). Los duelos en vivo no están acá: un cliente que no los conoce los trataría como salas a las que entrar. */
  list(now: number): PublicRoom[] {
    this.purge(now)

    return [...this.entries.values()].filter((entry) => !entry.live).map((entry) => entry.room).sort((a, b) => b.createdAt - a.createdAt)
  }

  /** Los duelos públicos en vivo, los que empezaron hace menos primero (sin los tokens). */
  listLive(now: number): LiveDuel[] {
    this.purge(now)

    return [...this.entries.values()]
      .flatMap((entry) => (entry.live ? [{ host: entry.room.host, match: entry.room.match, siding: entry.room.siding, format: entry.room.format, limitMin: entry.room.limitMin, ...(entry.room.genesysCap !== undefined ? { genesysCap: entry.room.genesysCap } : {}), code: entry.room.code, watchers: entry.live.watchers, since: entry.live.since, ...(entry.live.guest ? { guest: entry.live.guest } : {}) }] : []))
      .sort((a, b) => b.since - a.since)
  }

  /** Baja una sala si el token es el de quien la anotó. */
  remove(code: string, token: string, now: number): boolean {
    this.purge(now)

    if (this.entries.get(code)?.token !== token) {
      return false
    }

    this.entries.delete(code)
    return true
  }

  toJSON(): RegistryEntry[] {
    return [...this.entries.values()]
  }
}
