import { PHASES, type MatAction, type MatPhase, type MatState, type Placed } from './practice-mat'
import { uniqueComboName, type SavedCombo } from './saved-combos'
import { createId, isRecord } from './utils'

/**
 * Un combo que viaja: dentro de un enlace (`#combo=<datos>`, sin servidor ni cuenta) o en un archivo `*.ygolab-combo.json`. Los dos llevan el mismo sobre versionado
 * (`{ app, kind: 'combo', v: 1, combo }`, sin el id local); lo que se escribe con `v: 1` se lee para siempre, y `kind` deja lugar para otras cosas (un duelo entero).
 *
 * Lo que llega es de otra persona: **entrada no confiable**. Antes de decodificar se topa el largo, la descompresión se corta a `MAX_JSON_BYTES` (una bomba de
 * deflate no pasa) y del JSON se copian sólo los campos conocidos, con sus tipos, rangos y largos, y los ids de carta con su patrón (ni `__proto__` ni un host: el arte
 * sale del passcode por el proxy de siempre). Nada lanza: todo error es un `ShareError`.
 */

export const COMBO_SHARE_VERSION = 1
const APP = 'ygoultralab'
export const COMBO_HASH = 'combo'
/** Tope de un enlace para ofrecerlo: WhatsApp, Discord y Telegram pasan ~8 mil caracteres sin cortarlos. Más largo, se ofrece el archivo. */
export const MAX_LINK_LENGTH = 7500
/** Tope de lo que se acepta decodificar (un enlace pegado o abierto) y de un archivo, y del JSON ya descomprimido (anti-bomba). */
export const MAX_PAYLOAD_CHARS = 200_000
export const MAX_FILE_BYTES = 256 * 1024
export const MAX_JSON_BYTES = 256 * 1024
export const COMBO_FILE_SUFFIX = '.ygolab-combo.json'

export type SharedCombo = Omit<SavedCombo, 'id'>
/** `duel`: es el replay de un duelo (`duel-replay.ts`), que se abre en Replays. */
export type ShareError = 'notCombo' | 'newer' | 'broken' | 'tooBig' | 'duel'
export type ShareResult = { ok: true; combo: SharedCombo } | { ok: false; error: ShareError }

/** El sobre, listo para JSON. */
export function comboEnvelope({ name, deckName, savedAt, initial, names, actions, auto }: SavedCombo | SharedCombo) {
  return { app: APP, kind: 'combo', v: COMBO_SHARE_VERSION, combo: { name, deckName, savedAt, initial, names, actions, ...(auto ? { auto } : {}) } }
}

// ── Enlace ──

const toBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

/** Lee un stream hasta `limit` bytes: más, null (corta la bomba sin terminar de inflarla). */
async function readCapped(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array | null> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      void reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

const streamOf = (bytes: Uint8Array) => new Blob([bytes as BlobPart]).stream()

/** Los datos de un enlace: `z` + deflate-raw en base64url; `j` + el JSON en base64url (un navegador sin `CompressionStream`). La versión va adentro, en el sobre. */
export async function packPayload(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value))
  if (typeof CompressionStream === 'undefined') return `j${toBase64Url(json)}`
  const packed = await readCapped(streamOf(json).pipeThrough(new CompressionStream('deflate-raw')), Number.MAX_SAFE_INTEGER)
  return `z${toBase64Url(packed!)}`
}

export const encodeComboPayload = (combo: SavedCombo | SharedCombo): Promise<string> => packPayload(comboEnvelope(combo))

/** El texto (el JSON) de los datos de un enlace, con el tope de lo descomprimido (`maxJson`). No lanza. */
export async function unpackPayload(payload: string, maxJson = MAX_JSON_BYTES): Promise<{ ok: true; text: string } | { ok: false; error: 'broken' | 'tooBig' }> {
  if (payload.length > MAX_PAYLOAD_CHARS) return { ok: false, error: 'tooBig' }
  const bytes = fromBase64Url(payload.slice(1))
  if (!bytes || bytes.length === 0) return { ok: false, error: 'broken' }

  try {
    let json: Uint8Array | null
    if (payload[0] === 'z') {
      if (typeof DecompressionStream === 'undefined') return { ok: false, error: 'broken' }
      json = await readCapped(streamOf(bytes).pipeThrough(new DecompressionStream('deflate-raw')), maxJson)
    } else if (payload[0] === 'j') {
      json = bytes.length > maxJson ? null : bytes
    } else {
      return { ok: false, error: 'broken' }
    }
    if (!json) return { ok: false, error: 'tooBig' }
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(json) }
  } catch {
    return { ok: false, error: 'broken' }
  }
}

/** El enlace del combo: la app (mismo origen y ruta que el del duelo) con los datos en el hash. */
export const buildComboLink = (origin: string, pathname: string, payload: string) => `${origin}${pathname}#${COMBO_HASH}=${payload}`

/** Los datos de un enlace de combo (entero, sólo el hash o los datos solos), o null si no lo es. */
export function comboPayloadOf(text: string): string | null {
  const trimmed = text.trim()
  const match = /#combo=([A-Za-z0-9_-]+)\s*$/.exec(trimmed) ?? /^([zj][A-Za-z0-9_-]+)$/.exec(trimmed)
  return match ? match[1]! : null
}

/** Decodifica los datos de un enlace. No lanza. */
export async function decodeComboPayload(payload: string): Promise<ShareResult> {
  const unpacked = await unpackPayload(payload)
  return unpacked.ok ? parseComboText(unpacked.text) : unpacked
}

/** Un enlace pegado: si no es de un combo, lo dice. */
export async function readComboLink(text: string): Promise<ShareResult> {
  if (text.length > MAX_PAYLOAD_CHARS + 1000) return { ok: false, error: 'tooBig' }
  const payload = comboPayloadOf(text)
  return payload ? decodeComboPayload(payload) : { ok: false, error: 'notCombo' }
}

// ── Archivo ──

/** El nombre del archivo: el del combo, sin lo que un sistema de archivos no acepta. */
export const comboFileName = (name: string) => safeFileName(name, 'combo', COMBO_FILE_SUFFIX)

/** Un nombre de archivo sin lo que un sistema de archivos no acepta (`fallback` si no queda nada). */
export function safeFileName(name: string, fallback: string, suffix: string): string {
  const safe = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 60)
  return `${safe || fallback}${suffix}`
}

export const comboFileText = (combo: SavedCombo | SharedCombo) => `${JSON.stringify(comboEnvelope(combo), null, 2)}\n`

/** Lee el texto de un archivo (o el JSON de un enlace). No lanza. */
export function parseComboText(text: string): ShareResult {
  if (text.length > MAX_JSON_BYTES) return { ok: false, error: 'tooBig' }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: 'notCombo' }
  }
  if (isRecord(value) && value.app === APP && value.kind === 'duel') return { ok: false, error: 'duel' }
  if (!isRecord(value) || value.app !== APP || value.kind !== 'combo' || typeof value.v !== 'number') return { ok: false, error: 'notCombo' }
  if (value.v > COMBO_SHARE_VERSION) return { ok: false, error: 'newer' }
  if (value.v !== COMBO_SHARE_VERSION) return { ok: false, error: 'broken' }
  const combo = readCombo(value.combo)
  return combo ? { ok: true, combo } : { ok: false, error: 'broken' }
}

/** Lo importado pasa a la lista: un id nuevo y un nombre que no repite otro. */
export const toSavedCombo = (shared: SharedCombo, combos: readonly SavedCombo[]): SavedCombo => ({ id: createId('combo'), ...shared, name: uniqueComboName(shared.name, combos) })

// ── Validación: se copian sólo los campos conocidos ──

/** Los ids que usa la mesa: copias de carta (`card-<passcode>-<n>`), fichas, las del rival simulado (`rival.`) y las del rival de un duelo (`f.c12`, `c12`). */
const ID = /^(?:rival\.|f\.)?(?:card-\d{1,12}-\d{1,4}|token-\d{1,4}|c\d{1,6})$/
const MAX_TEXT = 120
const MAX_PILE = 200
const MAX_ACTIONS = 3000
const MAX_BATCH = 80
const MAX_NAMES = 600

const fail = (): never => {
  throw new TypeError('combo')
}

const str = (value: unknown, max = MAX_TEXT): string => (typeof value === 'string' && value.length <= max ? value : fail())
const id = (value: unknown): string => (typeof value === 'string' && ID.test(value) ? value : fail())
const ids = (value: unknown, max = MAX_PILE): string[] => (Array.isArray(value) && value.length <= max ? value.map(id) : fail())
const int = (value: unknown, min: number, max: number): number => (Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : fail())
const oneOf = <T extends string>(value: unknown, options: readonly T[]): T => (options.includes(value as T) ? (value as T) : fail())
const opt = <T>(value: unknown, read: (value: unknown) => T): T | undefined => (value === undefined ? undefined : read(value))
const yes = (value: unknown): true => (value === true ? true : fail())
const rec = (value: unknown): Record<string, unknown> => (isRecord(value) && !Array.isArray(value) ? value : fail())
/** Un objeto sin las claves que no vinieron (`exactOptionalPropertyTypes`). */
const clean = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T

const POS = ['atk', 'def', 'set'] as const
const PILE = ['deck', 'extra', 'hand', 'gy', 'banished'] as const
const ZONE = ['mz', 'emz', 'st'] as const
const SPOT = [...ZONE, 'field'] as const
const PHASE_IDS: readonly MatPhase[] = PHASES.map((phase) => phase.id)
const SEED = 2 ** 53

function placed(value: unknown): Placed | null {
  if (value === null) return null
  const v = rec(value)
  return { id: id(v.id), pos: oneOf(v.pos, POS), counters: int(v.counters, 0, 999), materials: ids(v.materials, 20) }
}

const zones = (value: unknown, size: number) => (Array.isArray(value) && value.length === size ? value.map(placed) : fail())

function state(value: unknown): MatState {
  const v = rec(value)
  const rival = v.rival === undefined ? undefined : rec(v.rival)
  return clean({
    deck: ids(v.deck),
    extra: ids(v.extra),
    hand: ids(v.hand),
    gy: ids(v.gy),
    banished: ids(v.banished),
    mz: zones(v.mz, 5),
    emz: zones(v.emz, 2),
    st: zones(v.st, 5),
    field: placed(v.field ?? null),
    tokens: int(v.tokens, 0, 9999),
    phase: oneOf(v.phase, PHASE_IDS),
    turn: int(v.turn, 1, 9999),
    facedown: ids(v.facedown),
    extraUp: ids(v.extraUp),
    targeted: ids(v.targeted),
    rival: rival ? { hand: ids(rival.hand, 20), used: ids(rival.used, 20) } : undefined,
  })
}

function action(value: unknown, nested = false): MatAction {
  const v = rec(value)
  const index = () => int(v.index, 0, 4)
  const shuffle = () => opt(v.shuffle, (seed) => int(seed, -SEED, SEED))
  const flags = () => ({ faceDown: opt(v.faceDown, (f) => (typeof f === 'boolean' ? f : fail())), faceUp: opt(v.faceUp, (f) => (typeof f === 'boolean' ? f : fail())) })

  switch (v.type) {
    case 'draw':
      return clean({ type: 'draw', count: int(v.count, 0, 99), ids: opt(v.ids, (list) => ids(list, 99)) })
    case 'mill':
      return { type: 'mill', count: int(v.count, 0, 99) }
    case 'shuffle':
      return { type: 'shuffle', seed: int(v.seed, -SEED, SEED) }
    case 'move':
      return clean({ type: 'move', id: id(v.id), to: oneOf(v.to, [...PILE, 'deck-bottom'] as const), ...flags(), shuffle: shuffle() })
    case 'place':
      return clean({ type: 'place', id: id(v.id), zone: oneOf(v.zone, SPOT), index: index(), pos: oneOf(v.pos, POS), how: opt(v.how, (how) => oneOf(how, ['normal', 'special', 'pendulum', 'scale'] as const)), shuffle: shuffle() })
    case 'tribute':
      return { type: 'tribute', id: id(v.id), tributes: ids(v.tributes, 5), zone: oneOf(v.zone, ZONE), index: index(), pos: oneOf(v.pos, POS) }
    case 'summon':
      return { type: 'summon', id: id(v.id), how: oneOf(v.how, ['fusion', 'synchro', 'xyz', 'link'] as const), materials: ids(v.materials, 20), zone: oneOf(v.zone, ZONE), index: index(), pos: oneOf(v.pos, POS) }
    case 'attach':
      return { type: 'attach', id: id(v.id), to: id(v.to) }
    case 'position':
      return { type: 'position', id: id(v.id), pos: oneOf(v.pos, POS) }
    case 'counter':
      return { type: 'counter', id: id(v.id), delta: int(v.delta, -999, 999) }
    case 'token':
      return clean({ type: 'token', zone: oneOf(v.zone, ZONE), index: index(), pos: opt(v.pos, (pos) => oneOf(pos, ['atk', 'def'] as const)) })
    case 'activate':
      return clean({ type: 'activate', id: id(v.id), cost: opt(v.cost, (cost) => oneOf(cost, ['discard', 'banish'] as const)), effect: opt(v.effect, (effect) => int(effect, 0, 50)) })
    case 'reveal':
    case 'declare':
    case 'target':
    case 'rivalUse':
      return { type: v.type, id: id(v.id) }
    case 'attack':
      return clean({ type: 'attack', id: id(v.id), target: opt(v.target, id) })
    case 'phase':
      return clean({ type: 'phase', phase: oneOf(v.phase, PHASE_IDS), skipDraw: opt(v.skipDraw, yes) })
    case 'give':
      return clean({ type: 'give', id: id(v.id), auto: opt(v.auto, yes) })
    case 'take':
      return clean({ type: 'take', id: id(v.id), zone: oneOf(v.zone, ['mz', 'st', 'field'] as const), index: index(), pos: oneOf(v.pos, POS), auto: opt(v.auto, yes) })
    case 'regain':
      return clean({ type: 'regain', id: id(v.id), to: oneOf(v.to, [...PILE, 'deck-bottom', 'mz', 'st', 'field'] as const), index: opt(v.index, (i) => int(i, 0, 4)), pos: opt(v.pos, (pos) => oneOf(pos, POS)), ...flags(), auto: opt(v.auto, yes) })
    case 'batch':
      // Un lote dentro de otro no hace nada en la mesa: no se acepta.
      return nested ? fail() : { type: 'batch', actions: Array.isArray(v.actions) && v.actions.length <= MAX_BATCH ? v.actions.map((part) => action(part, true)) : fail() }
    default:
      return fail()
  }
}

function names(value: unknown): Record<string, string> {
  const entries = Object.entries(rec(value))
  if (entries.length > MAX_NAMES) fail()
  // Las claves pasan el patrón de id (nunca `__proto__`) y van a un objeto nuevo.
  return Object.fromEntries(entries.map(([key, name]) => [id(key), str(name)]))
}

function readCombo(value: unknown): SharedCombo | null {
  try {
    const v = rec(value)
    const savedAt = str(v.savedAt, 40)
    if (Number.isNaN(Date.parse(savedAt))) fail()
    const actions = Array.isArray(v.actions) && v.actions.length <= MAX_ACTIONS ? v.actions.map((entry) => action(entry)) : fail()
    return clean({ name: str(v.name).trim(), deckName: str(v.deckName), savedAt, initial: state(v.initial), names: names(v.names), actions, auto: opt(v.auto, yes) })
  } catch {
    return null
  }
}

/** Lo mismo para otro sobre (el replay de un duelo): una mesa y una jugada se validan igual. Cada lector lanza (`TypeError`) y quien llama lo ataja. */
export { action as readMatAction, clean as withoutUndefined, fail as invalid, id as readId, int as readInt, oneOf as readOneOf, rec as readRecord, state as readMatState, str as readText }
export const SHARE_APP = APP

// ── En el navegador: compartir y bajar ──

const touchDevice = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/** Baja el combo como archivo (un `Blob` y un `<a download>`). */
export const downloadComboFile = (combo: SavedCombo | SharedCombo): void => downloadTextFile(comboFileText(combo), comboFileName(combo.name))

export function downloadTextFile(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'tooLong' | 'failed'

/**
 * Comparte el enlace del combo: en el celular, con la hoja de compartir del sistema; si no, lo copia. Un combo que no entra en un enlace (`MAX_LINK_LENGTH`): en el celular se
 * comparte el archivo, si el sistema puede; si no, `tooLong` (quien llama ofrece bajarlo).
 */
export async function shareComboLink(combo: SavedCombo | SharedCombo): Promise<ShareOutcome> {
  return shareLink(buildComboLink(location.origin, location.pathname, await encodeComboPayload(combo)), combo.name, () => new File([comboFileText(combo)], comboFileName(combo.name), { type: 'application/json' }))
}

/** Lo mismo con cualquier enlace (el de un replay): `file` arma el archivo para cuando el enlace no entra. */
export async function shareLink(link: string, title: string, file: () => File): Promise<ShareOutcome> {
  const share = async (data: ShareData): Promise<ShareOutcome | null> => {
    try {
      await navigator.share(data)
      return 'shared'
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : null
    }
  }

  if (link.length > MAX_LINK_LENGTH) {
    const files = [file()]
    return (touchDevice() && navigator.canShare?.({ files }) && (await share({ files, title }))) || 'tooLong'
  }

  const shared = touchDevice() && typeof navigator.share === 'function' ? await share({ title, url: link }) : null
  if (shared) return shared

  try {
    await navigator.clipboard.writeText(link)
    return 'copied'
  } catch {
    return 'failed'
  }
}
