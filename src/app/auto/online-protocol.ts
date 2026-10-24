import { byteLength, MAX_MESSAGE_BYTES, RateLimiter } from '../duel-relay-rules'
import { MAX_LP } from '../life-calculator'
import { parseAnswer, parseAutoEvent, type AutoEvent, type CoreAnswer, type Seat } from './protocol'

/**
 * El duelo automático por enlace (diseño: `docs/duelos-automaticos.md`, «Duelo online»): los mensajes de texto que el anfitrión (que corre el núcleo con los dos asientos) y el
 * invitado (que no lo corre) se mandan por el mismo relay, al lado del protocolo manual de `duel-protocol.ts`, que los ignora (`parseMessage` da `null` con un `t` que no conoce).
 * Es puro: tipos, límites, validación (`parseAutoMessage`), troceo de lo que no entra en un mensaje y el marcapasos del que manda. El relay no cambia: reenvía texto, con tope de
 * 16 KB por mensaje y 30 por segundo (ráfaga de 60).
 */

export const AUTO_PROTOCOL_VERSION = 1
/** Más de esto se trocea en `autoPart` (deja margen al tope de 16 KB del relay: el sobre del `autoEvent` y, si algún día va cifrado, el base64). */
export const MAX_AUTO_BYTES = 12 * 1024
export const MAX_PARTS = 16
/** Lo que el que manda se permite por segundo (el relay deja 30 con ráfaga de 60; el manual necesita algo también). */
export const AUTO_RATE_PER_SECOND = 25
export const AUTO_BURST = 40

/** Un deck como `[passcode, copias]` (el del builder, contado): lo que el invitado le manda al anfitrión. */
export interface AutoDeckWire {
  main: [number, number][]
  extra: [number, number][]
}
export interface AutoPlayerWire {
  lp: number
  hand: number
  draw: number
}
/** Lo que el invitado necesita saber de una carta que el núcleo le dejó ver (el `.cdb` lo tiene el anfitrión): el tipo para el adaptador, el nombre y los rótulos de efectos para la pantalla. */
export interface AutoCardInfo {
  code: number
  type: number
  name?: string
  strs?: string[]
}

export type AutoMessage =
  /** Invitado → anfitrión: mi deck (al ver `settings.auto`, cada vez que cambia, y al volver). */
  | { t: 'autoDeck'; v: number; main: [number, number][]; extra: [number, number][] }
  /** Anfitrión → invitado: si se puede jugar con esos dos decks. `bad`: los códigos del invitado sin reglas; `theirsBad`: cuántas del anfitrión. `reason` cuando no es por reglas. */
  | { t: 'autoCheck'; v: number; ok: boolean; bad: number[]; theirsBad: number; reason?: 'version' | 'off' | 'data' | 'lost' }
  /** Anfitrión → invitado: el duelo que empieza. `seat` es el asiento del invitado; `mine` su deck en códigos del núcleo como lo puso el anfitrión; `theirs`, sólo cuántas cartas tiene el anfitrión. */
  | { t: 'autoInit'; v: number; seed: number; seat: Seat; players: [AutoPlayerWire, AutoPlayerWire]; mine: { main: number[]; extra: number[]; hand: number[] }; theirs: { main: number; extra: number } }
  /** Anfitrión → invitado: lo que sigue es una re-emisión desde cero; las primeras `skip` preguntas tuyas ya están contestadas (no animes, no preguntes). */
  | { t: 'autoReplay'; skip: number }
  /** Anfitrión → invitado: un evento del anfitrión del núcleo ya filtrado para tu asiento, con los datos de las cartas que ves por primera vez. */
  | { t: 'autoEvent'; event: AutoEvent; cards?: AutoCardInfo[] }
  /**
   * Anfitrión → invitado: varios eventos seguidos, cada uno tal cual (no se juntan tandas: el adaptador mira lo que sigue en la misma). Lo usa la reposición del duelo a quien
   * vuelve: con un evento por mensaje y 25 por segundo, un duelo largo tardaría minutos.
   */
  | { t: 'autoBatch'; events: AutoEvent[]; cards?: AutoCardInfo[] }
  /** Un trozo de un mensaje grande (`id` lo agrupa, `i` de `n`): se reensambla y se vuelve a parsear. */
  | { t: 'autoPart'; id: number; i: number; n: number; text: string }
  /** Invitado → anfitrión: la respuesta a la pregunta pendiente (`askId` es el de esa pregunta; otro, se descarta). */
  | { t: 'autoAnswer'; askId: number; answer: CoreAnswer }
  /** Invitado → anfitrión: me perdí algo (o acabo de entrar): mandame el duelo de nuevo. */
  | { t: 'autoResync' }

export type AutoMessageKind = AutoMessage['t']
/** Lo que cada lado acepta recibir (se descarta lo demás, sin avisar). */
export const HOST_ACCEPTS: readonly AutoMessageKind[] = ['autoDeck', 'autoAnswer', 'autoResync']
export const GUEST_ACCEPTS: readonly AutoMessageKind[] = ['autoCheck', 'autoInit', 'autoReplay', 'autoEvent', 'autoBatch', 'autoPart']

export function encodeAutoMessage(message: AutoMessage): string {
  return JSON.stringify(message)
}

/** Si el texto es de este protocolo (empieza con `{"t":"auto`): lo que mira el enlace antes de parsear. */
export const isAutoText = (text: string): boolean => text.startsWith('{"t":"auto')

/** Lo más grande que puede medir un mensaje reensamblado de sus `autoPart`. */
export const MAX_WHOLE_BYTES = MAX_PARTS * MAX_AUTO_BYTES

const MAX_CODE = 999_999_999_999
const MAX_SEED = 2 ** 32 - 1
const MAX_ASK_ID = 1_000_000
const REASONS = ['version', 'off', 'data', 'lost'] as const

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isInt = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
const ints = (value: unknown, max: number, min = 1, top = MAX_CODE): number[] | null => (Array.isArray(value) && value.length <= max && value.every((item) => isInt(item, min, top)) ? [...(value as number[])] : null)
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max

/** Las filas `[passcode, copias]` de un deck: el formato de la sala ya revisa cuántas copias valen; acá, que no pase de `cards` cartas. */
function deckRows(value: unknown, rows: number, cards: number): [number, number][] | null {
  if (!Array.isArray(value) || value.length > rows) return null
  let total = 0

  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 2 || !isInt(row[0], 1, MAX_CODE) || !isInt(row[1], 1, cards)) return null
    total += row[1] as number
  }

  return total <= cards ? value.map((row: [number, number]) => [row[0], row[1]]) : null
}

function cardInfos(value: unknown): AutoCardInfo[] | null {
  if (!Array.isArray(value) || value.length > 600) return null
  const out: AutoCardInfo[] = []

  for (const card of value) {
    if (!isPlain(card) || !isInt(card.code, 1, MAX_CODE) || !isInt(card.type, 0, MAX_SEED)) return null
    if (card.name !== undefined && !text(card.name, 200)) return null
    if (card.strs !== undefined && !(Array.isArray(card.strs) && card.strs.length <= 16 && card.strs.every((str) => text(str, 2000)))) return null
    out.push({ code: card.code, type: card.type, ...(card.name === undefined ? {} : { name: card.name }), ...(card.strs === undefined ? {} : { strs: [...(card.strs as string[])] }) })
  }

  return out
}

const player = (value: unknown): AutoPlayerWire | null => (isPlain(value) && isInt(value.lp, 1, MAX_LP) && isInt(value.hand, 0, 60) && isInt(value.draw, 0, 60) ? { lp: value.lp, hand: value.hand, draw: value.draw } : null)

function events(value: unknown): AutoEvent[] | null {
  if (!Array.isArray(value) || value.length > 5000) return null
  const out = value.map(parseAutoEvent)

  return out.every((event) => event !== null) ? (out as AutoEvent[]) : null
}

/**
 * Una copia con forma conocida (y dentro de los topes) o `null`. `maxBytes`: el tope del texto (el del relay; para un mensaje reensamblado de sus partes, `MAX_WHOLE_BYTES`).
 * Quién puede mandar qué lo mira cada enlace (`HOST_ACCEPTS`, `GUEST_ACCEPTS`).
 */
export function parseAutoMessage(input: string, maxBytes = MAX_MESSAGE_BYTES): AutoMessage | null {
  if (input.length > maxBytes || byteLength(input) > maxBytes) return null
  let raw: unknown

  try {
    raw = JSON.parse(input)
  } catch {
    return null
  }
  if (!isPlain(raw)) return null

  switch (raw.t) {
    case 'autoDeck': {
      const main = deckRows(raw.main, 200, 200)
      const extra = deckRows(raw.extra, 100, 100)

      return isInt(raw.v, 0, 1000) && main && extra ? { t: 'autoDeck', v: raw.v, main, extra } : null
    }

    case 'autoCheck': {
      const bad = ints(raw.bad, 300)
      const reason = raw.reason === undefined ? undefined : REASONS.find((item) => item === raw.reason)

      if (!isInt(raw.v, 0, 1000) || typeof raw.ok !== 'boolean' || !bad || !isInt(raw.theirsBad, 0, 300) || (raw.reason !== undefined && !reason)) return null

      return { t: 'autoCheck', v: raw.v, ok: raw.ok, bad, theirsBad: raw.theirsBad, ...(reason ? { reason } : {}) }
    }

    case 'autoInit': {
      const players = Array.isArray(raw.players) && raw.players.length === 2 ? raw.players.map(player) : null
      const mine = isPlain(raw.mine) ? { main: ints(raw.mine.main, 200), extra: ints(raw.mine.extra, 100), hand: ints(raw.mine.hand, 200) } : null
      const theirs = isPlain(raw.theirs) && isInt(raw.theirs.main, 0, 200) && isInt(raw.theirs.extra, 0, 100) ? { main: raw.theirs.main, extra: raw.theirs.extra } : null

      if (!isInt(raw.v, 0, 1000) || !isInt(raw.seed, 0, MAX_SEED) || (raw.seat !== 0 && raw.seat !== 1) || !players?.every((item) => item !== null) || !theirs) return null
      if (!mine?.main || !mine.extra || !mine.hand || mine.hand.length > mine.main.length) return null

      return { t: 'autoInit', v: raw.v, seed: raw.seed, seat: raw.seat, players: players as [AutoPlayerWire, AutoPlayerWire], mine: { main: mine.main, extra: mine.extra, hand: mine.hand }, theirs }
    }

    case 'autoReplay':
      return isInt(raw.skip, 0, 20_000) ? { t: 'autoReplay', skip: raw.skip } : null

    case 'autoEvent': {
      const event = parseAutoEvent(raw.event)
      const cards = raw.cards === undefined ? undefined : cardInfos(raw.cards)

      return event && cards !== null ? { t: 'autoEvent', event, ...(cards ? { cards } : {}) } : null
    }

    case 'autoBatch': {
      const list = events(raw.events)
      const cards = raw.cards === undefined ? undefined : cardInfos(raw.cards)

      return list && cards !== null ? { t: 'autoBatch', events: list, ...(cards ? { cards } : {}) } : null
    }

    case 'autoPart':
      return isInt(raw.id, 1, MAX_ASK_ID) && isInt(raw.n, 1, MAX_PARTS) && isInt(raw.i, 0, raw.n - 1) && text(raw.text, MAX_MESSAGE_BYTES) ? { t: 'autoPart', id: raw.id, i: raw.i, n: raw.n, text: raw.text } : null

    case 'autoAnswer': {
      const answer = parseAnswer(raw.answer)

      return isInt(raw.askId, 1, MAX_ASK_ID) && answer ? { t: 'autoAnswer', askId: raw.askId, answer } : null
    }

    case 'autoResync':
      return { t: 'autoResync' }

    default:
      return null
  }
}

/** Lo que mide un carácter de un texto JSON metido como cadena en otro JSON (UTF-8; `"` y `\` se escapan). El texto de `JSON.stringify` no tiene controles sueltos. */
const costOf = (point: number) => (point === 0x22 || point === 0x5c ? 2 : point < 0x80 ? 1 : point < 0x800 ? 2 : point <= 0xffff ? 3 : 4)

/**
 * Parte un texto grande en `autoPart` que, ya escapados, miden a lo sumo `MAX_AUTO_BYTES` (sin cortar un par de surrogates); uno chico va entero (`[text]`). Si harían falta más de
 * `MAX_PARTS`, nada (`[]`): ese mensaje no se puede mandar. `id` agrupa las partes (quien manda lo hace crecer).
 */
export function chunkAutoText(input: string, id = 1): string[] {
  if (byteLength(input) <= MAX_AUTO_BYTES) return [input]
  const pieces: string[] = []
  let start = 0
  let cost = 0

  for (let i = 0; i < input.length; ) {
    const point = input.codePointAt(i)!
    const bytes = costOf(point)

    if (cost + bytes > MAX_AUTO_BYTES) {
      pieces.push(input.slice(start, i))
      start = i
      cost = 0
    }
    cost += bytes
    i += point > 0xffff ? 2 : 1
  }
  pieces.push(input.slice(start))

  return pieces.length > MAX_PARTS ? [] : pieces.map((piece, i) => encodeAutoMessage({ t: 'autoPart', id, i, n: pieces.length, text: piece }))
}

/** Junta los `autoPart` de un mensaje grande; devuelve el texto entero cuando llegan todos. */
export interface Reassembler {
  push(part: Extract<AutoMessage, { t: 'autoPart' }>): string | null
}

const OPEN_PARTS = 4
const PART_TTL_MS = 60_000

/** Como mucho `OPEN_PARTS` mensajes a medias a la vez y por un minuto: lo que no cierra se descarta (un `id` que vuelve con otro `n` empieza de cero). */
export function createReassembler(now: () => number = Date.now): Reassembler {
  const open = new Map<number, { n: number; parts: (string | undefined)[]; got: number; at: number }>()

  return {
    push(part) {
      const time = now()

      for (const [id, entry] of open) if (time - entry.at > PART_TTL_MS) open.delete(id)
      let entry = open.get(part.id)

      if (!entry || entry.n !== part.n) {
        open.delete(part.id)
        if (open.size >= OPEN_PARTS) open.delete(open.keys().next().value!)
        entry = { n: part.n, parts: Array<string | undefined>(part.n), got: 0, at: time }
        open.set(part.id, entry)
      }
      if (entry.parts[part.i] === undefined) {
        entry.parts[part.i] = part.text
        entry.got += 1
      }
      if (entry.got < entry.n) return null
      open.delete(part.id)

      return entry.parts.join('')
    },
  }
}

/**
 * El marcapasos de quien manda: una cola con `AUTO_RATE_PER_SECOND` por segundo. Un `key` repetido reemplaza al último de la cola si es de ese mismo `key` (los `stats` de un
 * asiento: sólo cuenta el último, y como no hay nada en el medio no cambia el orden respecto de los eventos).
 */
export interface Pacer {
  push(text: string, key?: string): void
  destroy(): void
}

export function createPacer(send: (text: string) => void, now: () => number = Date.now): Pacer {
  const limiter = new RateLimiter(now(), AUTO_RATE_PER_SECOND, AUTO_BURST)
  const queue: { text: string; key?: string }[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let alive = true

  const drain = () => {
    timer = undefined
    while (alive && queue.length > 0 && limiter.allow(now())) send(queue.shift()!.text)
    if (alive && queue.length > 0) timer = setTimeout(drain, 1000 / AUTO_RATE_PER_SECOND)
  }

  return {
    push(text, key) {
      const last = queue.at(-1)

      if (!alive) return
      if (key !== undefined && last?.key === key) last.text = text
      else queue.push(key === undefined ? { text } : { text, key })
      if (timer === undefined) drain()
    },
    destroy() {
      alive = false
      clearTimeout(timer)
      queue.length = 0
    },
  }
}
