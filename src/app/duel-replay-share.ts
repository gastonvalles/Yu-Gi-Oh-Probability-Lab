import {
  downloadTextFile,
  invalid,
  MAX_PAYLOAD_CHARS,
  packPayload,
  parseComboText,
  readComboLink,
  readId,
  readInt,
  readMatAction,
  readMatState,
  readOneOf,
  readRecord,
  readText,
  safeFileName,
  SHARE_APP,
  shareLink,
  unpackPayload,
  withoutUndefined,
  type SharedCombo,
  type ShareOutcome,
} from './combo-share'
import { cleanName } from './duel-protocol'
import type { DuelReplay, ReplayResult, ReplayStep } from './duel-replay'
import { createId, isRecord } from './utils'

/**
 * El replay de un duelo que viaja (enlace `#replay=<datos>` o archivo `*.ygolab-duel.json`) y los que se guardan en este navegador. El mismo sobre que el combo
 * (`{ app, kind: 'duel', v: 1, replay }`, `combo-share.ts`), el mismo códec (deflate-raw + base64url) y la misma desconfianza: es **entrada no confiable**. Se topa el
 * largo antes de decodificar, la descompresión se corta a `MAX_REPLAY_JSON`, del JSON se copian sólo los campos conocidos (las mesas y las jugadas con los lectores del
 * combo), los ids con su patrón, los nombres pasan por `cleanName` y se dibujan como texto, y nada lanza.
 */

export const DUEL_REPLAY_VERSION = 1
export const REPLAY_HASH = 'replay'
export const DUEL_FILE_SUFFIX = '.ygolab-duel.json'
/** El JSON de un duelo largo pasa los 100 KB: el tope es más alto que el del combo, y el del archivo, igual. */
export const MAX_REPLAY_JSON = 2 * 1024 * 1024
export const MAX_REPLAY_FILE = MAX_REPLAY_JSON
/** El enlace se ofrece si entra en lo que pasan los chats sin cortarlo (el mismo tope del combo); si no, sólo el archivo. */
export { MAX_LINK_LENGTH } from './combo-share'
const MAX_STEPS = 6000
const MAX_CARDS = 1000
const MAX_HIDDEN = 200
const MAX_REVEAL = 60
const MAX_LP = 999_999

export type ReplayError = 'notReplay' | 'newer' | 'broken' | 'tooBig'
export type ReplayRead = { ok: true; replay: DuelReplay } | { ok: false; error: ReplayError }
/** Lo que trae un archivo o un enlace pegado: un duelo, un combo (va a la mesa) o por qué no se pudo leer. */
export type SharedRead = { ok: true; kind: 'duel'; replay: DuelReplay } | { ok: true; kind: 'combo'; combo: SharedCombo } | { ok: false; error: ReplayError }

export const replayEnvelope = (replay: DuelReplay) => ({ app: SHARE_APP, kind: 'duel', v: DUEL_REPLAY_VERSION, replay })
export const encodeReplayPayload = (replay: DuelReplay) => packPayload(replayEnvelope(replay))
export const buildReplayLink = (origin: string, pathname: string, payload: string) => `${origin}${pathname}#${REPLAY_HASH}=${payload}`
/** El archivo: JSON sin sangría (un duelo largo tiene miles de jugadas), que cualquiera puede abrir y leer. */
export const replayFileText = (replay: DuelReplay) => `${JSON.stringify(replayEnvelope(replay))}\n`
/** «Ana vs Beto»: `title` es el que arma la pantalla (un nombre vacío —el de jugar solo— lo pone ella, en su idioma). */
export const replayFileName = (replay: DuelReplay, title: string) => safeFileName(`${title} ${replay.savedAt.slice(0, 10)}`, 'duelo', DUEL_FILE_SUFFIX)

/** Los datos de un enlace de replay (entero o sólo el hash), o null si no lo es. */
export function replayPayloadOf(text: string): string | null {
  const match = /#replay=([A-Za-z0-9_-]+)\s*$/.exec(text.trim())
  return match ? match[1]! : null
}

/** Decodifica los datos de un enlace (`z…` o `j…`). No lanza. */
export async function decodeReplayPayload(payload: string): Promise<ReplayRead> {
  const unpacked = await unpackPayload(payload, MAX_REPLAY_JSON)
  return unpacked.ok ? parseReplayText(unpacked.text) : unpacked
}

const envelopeOf = (text: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) && !Array.isArray(value) && value.app === SHARE_APP ? value : null
  } catch {
    return null
  }
}

/** Lee el texto de un archivo (o el JSON de un enlace). No lanza. */
export function parseReplayText(text: string): ReplayRead {
  if (text.length > MAX_REPLAY_JSON) return { ok: false, error: 'tooBig' }
  const value = envelopeOf(text)
  if (!value || value.kind !== 'duel' || typeof value.v !== 'number') return { ok: false, error: 'notReplay' }
  if (value.v > DUEL_REPLAY_VERSION) return { ok: false, error: 'newer' }
  if (value.v !== DUEL_REPLAY_VERSION) return { ok: false, error: 'broken' }
  const replay = readReplay(value.replay)
  return replay ? { ok: true, replay } : { ok: false, error: 'broken' }
}

const fromCombo = (result: Awaited<ReturnType<typeof readComboLink>>): SharedRead =>
  result.ok ? { ok: true, kind: 'combo', combo: result.combo } : { ok: false, error: result.error === 'notCombo' || result.error === 'duel' ? 'notReplay' : result.error }

/** Un archivo (su texto) o un enlace pegado, de un duelo o de un combo: lo que sea, por su `kind`. No lanza. */
export async function readShared(text: string): Promise<SharedRead> {
  if (text.length > MAX_REPLAY_JSON) return { ok: false, error: 'tooBig' }
  const trimmed = text.trim()

  if (trimmed.startsWith('{')) {
    const kind = envelopeOf(trimmed)?.kind
    if (kind === 'combo') return fromCombo(parseComboText(trimmed))
    const read = parseReplayText(trimmed)
    return read.ok ? { ok: true, kind: 'duel', replay: read.replay } : read
  }

  const payload = replayPayloadOf(trimmed)
  if (payload) {
    const read = await decodeReplayPayload(payload)
    return read.ok ? { ok: true, kind: 'duel', replay: read.replay } : read
  }
  if (/#combo=/.test(trimmed)) return fromCombo(await readComboLink(trimmed))
  // Los datos solos (`z…`): de un combo o de un duelo, según lo que traigan adentro.
  if (/^[zj][A-Za-z0-9_-]+$/.test(trimmed)) {
    const unpacked = await unpackPayload(trimmed, MAX_REPLAY_JSON)
    return unpacked.ok ? readShared(unpacked.text) : unpacked
  }
  return { ok: false, error: 'notReplay' }
}

// ── Validación: se copian sólo los campos conocidos ──

const REAL = /^card-\d{1,12}-\d{1,4}$/
const OPAQUE = /^c\d{1,6}$/
const real = (value: unknown): string => (typeof value === 'string' && REAL.test(value) ? value : invalid())
const list = <T>(value: unknown, max: number, read: (item: unknown) => T): T[] => (Array.isArray(value) && value.length <= max ? value.map(read) : invalid())
const entries = (value: unknown, max: number) => {
  const all = Object.entries(readRecord(value))
  return all.length <= max ? all : invalid()
}
/** id opaco → id real; las claves pasan su patrón (nunca `__proto__`) y van a un objeto nuevo. */
const reveal = (value: unknown, max = MAX_REVEAL, key: (id: unknown) => string = readId) => Object.fromEntries(entries(value, max).map(([opaque, id]) => [key(opaque), real(id)]))
const side = (value: unknown): 0 | 1 => (value === 0 || value === 1 ? value : invalid())
/** Vacío vale: «Jugar solo» no tiene nombres (la pantalla pone «Duelista» y «Rival» al dibujar). */
const name = (value: unknown) => cleanName(readText(value, 60))

function step(value: unknown): ReplayStep {
  const [who, action, shown, ...rest] = Array.isArray(value) ? value : invalid()
  if (rest.length > 0) invalid()
  return shown === undefined ? [side(who), readMatAction(action)] : [side(who), readMatAction(action), reveal(shown)]
}

function result(value: unknown): ReplayResult {
  const v = readRecord(value)
  return { winner: readInt(v.winner, 0, 2) as ReplayResult['winner'], reason: readOneOf(v.reason, ['lp', 'deck', 'effect', 'concede', 'time'] as const) }
}

function readReplay(value: unknown): DuelReplay | null {
  try {
    const v = readRecord(value)
    const savedAt = readText(v.savedAt, 40)
    if (Number.isNaN(Date.parse(savedAt))) invalid()
    const [first, second, ...more] = list(v.players, 2, name)
    const sides = list(v.sides, 2, (item) => {
      const s = readRecord(item)
      return { initial: readMatState(s.initial), reveal: reveal(s.reveal, 400) }
    })
    if (first === undefined || second === undefined || more.length > 0 || sides.length !== 2) invalid()
    const steps = list(v.steps, MAX_STEPS, step)
    const life = list(v.life, MAX_STEPS + 1, (item) => {
      const [at, a, b, ...rest] = Array.isArray(item) ? item : invalid()
      return rest.length > 0 ? invalid() : ([readInt(at, 0, steps.length), readInt(a, 0, MAX_LP), readInt(b, 0, MAX_LP)] as [number, number, number])
    })
    // Las vidas empiezan con el arranque y van en orden.
    if (life[0]?.[0] !== 0 || life.some((entry, i) => i > 0 && entry[0] < life[i - 1]![0])) invalid()
    const cards = Object.fromEntries(entries(v.cards, MAX_CARDS).map(([code, text]) => [/^\d{1,12}$/.test(code) ? code : invalid(), readText(text)]))
    const view = readOneOf(v.view, ['public', 'mine'] as const)

    return withoutUndefined({
      savedAt,
      mode: readOneOf(v.mode, ['solo-auto', 'link-auto', 'link'] as const),
      view,
      players: [first, second] as [string, string],
      starter: side(v.starter),
      sides: [sides[0]!, sides[1]!] as DuelReplay['sides'],
      steps,
      life,
      cards,
      // Lo propio que estaba oculto, sólo si se eligió mostrarlo.
      hidden: view === 'mine' && v.hidden !== undefined ? reveal(v.hidden, MAX_HIDDEN, (id) => (typeof id === 'string' && OPAQUE.test(id) ? id : invalid())) : undefined,
      result: v.result === undefined ? undefined : result(v.result),
    })
  } catch {
    return null
  }
}

// ── Los replays guardados en este navegador ──

const SAVED_REPLAYS_KEY = 'ygo-lab:duel-replays'
/** Cuántos se guardan: al llenarse, el más viejo se va (y se avisa). */
export const MAX_SAVED_REPLAYS = 20

/** Uno guardado: lo que muestra la lista y los datos ya comprimidos (el texto del enlace), que se decodifican y validan al abrirlo. */
export interface SavedReplay {
  id: string
  savedAt: string
  players: [string, string]
  steps: number
  /** Con «Incluir mi mano»: la lista lo dice. */
  view?: 'mine'
  result?: ReplayResult
  payload: string
}

const savedOf = (value: unknown): SavedReplay | null => {
  try {
    const v = readRecord(value)
    const [first, second] = list(v.players, 2, name)
    const payload = readText(v.payload, MAX_PAYLOAD_CHARS)
    return withoutUndefined({ id: readText(v.id, 80), savedAt: readText(v.savedAt, 40), players: [first ?? invalid(), second ?? invalid()] as [string, string], steps: readInt(v.steps, 0, MAX_STEPS), view: v.view === 'mine' ? ('mine' as const) : undefined, result: v.result === undefined ? undefined : result(v.result), payload: /^[zj][A-Za-z0-9_-]+$/.test(payload) ? payload : invalid() })
  } catch {
    return null
  }
}

export function readSavedReplays(): SavedReplay[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_REPLAYS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(0, MAX_SAVED_REPLAYS).flatMap((item) => savedOf(item) ?? []) : []
  } catch {
    return []
  }
}

function writeSavedReplays(list: readonly SavedReplay[]): boolean {
  try {
    localStorage.setItem(SAVED_REPLAYS_KEY, JSON.stringify(list))
    return true
  } catch {
    // Sin almacenamiento (modo privado o cuota llena).
    return false
  }
}

/** Guarda uno arriba de la lista. `dropped`: la lista estaba llena y se fue el más viejo; `failed`: el navegador no dejó guardar. */
export async function saveReplay(replay: DuelReplay): Promise<{ saved: SavedReplay | null; dropped: boolean }> {
  const saved: SavedReplay = withoutUndefined({ id: createId('replay'), savedAt: replay.savedAt, players: replay.players, steps: replay.steps.length, view: replay.view === 'mine' ? 'mine' : undefined, result: replay.result, payload: await encodeReplayPayload(replay) })
  const before = readSavedReplays()
  const next = [saved, ...before].slice(0, MAX_SAVED_REPLAYS)

  return writeSavedReplays(next) ? { saved, dropped: before.length >= MAX_SAVED_REPLAYS } : { saved: null, dropped: false }
}

export function deleteSavedReplay(id: string): SavedReplay[] {
  const next = readSavedReplays().filter((item) => item.id !== id)
  writeSavedReplays(next)
  return next
}

// ── En el navegador: compartir y bajar ──

export const downloadReplayFile = (replay: DuelReplay, title: string) => downloadTextFile(replayFileText(replay), replayFileName(replay, title))

/** Comparte el enlace (en el celular con la hoja del sistema; si no, lo copia). Un duelo que no entra en un enlace: `tooLong` (quien llama ofrece el archivo). */
export async function shareReplayLink(replay: DuelReplay, title: string, payload?: string): Promise<ShareOutcome> {
  const link = buildReplayLink(location.origin, location.pathname, payload ?? (await encodeReplayPayload(replay)))
  return shareLink(link, title, () => new File([replayFileText(replay)], replayFileName(replay, title), { type: 'application/json' }))
}

/** Si el enlace de unos datos entra bajo el tope (para no ofrecerlo cuando no). */
export const linkFits = (payload: string, max: number) => buildReplayLink(location.origin, location.pathname, payload).length <= max
