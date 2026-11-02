import {
  compactReader,
  compactTime,
  compactWriter,
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
  readCompactTime,
  readRecord,
  readText,
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
 * El replay de un duelo que viaja (enlace `#replay=<datos>`; como archivo viaja el video, `components/replays/video/`) y los que se guardan en este navegador. El mismo sobre que el combo
 * (`{ app, kind: 'duel', v: 1, replay }`, `combo-share.ts`; el enlace se escribe en `v: 2`, la forma compacta del combo, y los dos se leen para siempre), el mismo códec
 * (deflate-raw + base64url) y la misma desconfianza: es **entrada no confiable**. Se topa el largo antes de decodificar, la descompresión se corta a `MAX_REPLAY_JSON`, del JSON
 * se copian sólo los campos conocidos (las mesas y las jugadas con los lectores del combo), los ids con su patrón, los nombres pasan por `cleanName` y se dibujan como texto, y
 * nada lanza.
 */

export const DUEL_REPLAY_VERSION = 2
export const REPLAY_HASH = 'replay'
/** El JSON de un duelo largo pasa los 100 KB: el tope es más alto que el del combo. */
export const MAX_REPLAY_JSON = 2 * 1024 * 1024
/** El enlace se ofrece si entra en lo que pasan los chats sin cortarlo (el mismo tope del combo); si no, sólo el video. */
export { MAX_LINK_LENGTH } from './combo-share'
const MAX_STEPS = 6000
const MAX_CARDS = 1000
const MAX_HIDDEN = 200
const MAX_REVEAL = 60
const MAX_LP = 999_999

export type ReplayError = 'notReplay' | 'newer' | 'broken' | 'tooBig'
export type ReplayRead = { ok: true; replay: DuelReplay } | { ok: false; error: ReplayError }
/** Lo que trae un enlace pegado: un duelo, un combo (va a la mesa) o por qué no se pudo leer. */
export type SharedRead = { ok: true; kind: 'duel'; replay: DuelReplay } | { ok: true; kind: 'combo'; combo: SharedCombo } | { ok: false; error: ReplayError }

/** El sobre v1 (el JSON tal cual), el de los enlaces de antes. */
export const replayEnvelope = (replay: DuelReplay) => ({ app: SHARE_APP, kind: 'duel', v: 1, replay })

/**
 * El sobre v2, el del enlace: `{ app, kind: 'duel', v: 2, d: [savedAt, mode, view, players, starter, tabla, mesas, reveladas, jugadas, reveladas por jugada, vidas, nombres,
 * result | null, hidden?] }`. La tabla, las mesas y las jugadas, como el combo v2 (`compactWriter`: cada id es su lugar en la tabla; una jugada es `[lado, ...la del combo]`);
 * lo revelado (id opaco → id real), en pares planos de lugares, y el de cada jugada, aparte (`[jugada, ...pares]`: pocas muestran algo); los nombres, en el orden de los
 * passcodes de la tabla (`null`, uno sin nombre). **Este orden es el formato: sólo se agrega al final.** Leer v2 es armar la forma de v1 y pasarla por el mismo `readReplay`.
 * El enlace va sin nombres (`names: false`, la lista vacía) y quien lo abre los pide por passcode (`resolveReplayNames`, como el combo); lo guardado acá los lleva.
 */
export function compactReplayEnvelope(replay: DuelReplay, { names: withNames = true } = {}) {
  const pairs = (map: Record<string, string> | undefined) => Object.entries(map ?? {})
  // Los nombres van por passcode: el de cada uno entra a la tabla aunque nadie lo nombre (no pasa en un replay armado acá).
  const pack = compactWriter([...tableSources(replay), withNames ? Object.keys(replay.cards).map((code) => `card-${code}-1`) : []])
  const flat = (map: Record<string, string> | undefined) => pairs(map).flatMap(([opaque, real]) => [pack.ref(opaque), pack.ref(real)])
  const names = withNames ? pack.codes.map((code) => replay.cards[String(code)] ?? null) : []
  while (names.length > 0 && names.at(-1) === null) names.pop()

  return {
    app: SHARE_APP,
    kind: 'duel',
    v: DUEL_REPLAY_VERSION,
    d: [
      compactTime(replay.savedAt),
      replay.mode,
      replay.view,
      replay.players,
      replay.starter,
      pack.table,
      replay.sides.map((side) => pack.mat(side.initial)),
      replay.sides.map((side) => flat(side.reveal)),
      replay.steps.map(([side, action]) => [side, ...pack.action(action)]),
      replay.steps.flatMap(([, , shown], n) => (shown ? [[n, ...flat(shown)]] : [])),
      replay.life,
      names,
      replay.result ? [replay.result.winner, replay.result.reason] : null,
      ...(replay.hidden ? [flat(replay.hidden)] : []),
    ],
  }
}

/** De dónde salen los ids de la tabla: las mesas, las jugadas, lo revelado y lo propio oculto (los ids reales están sólo ahí). */
function tableSources(replay: DuelReplay): unknown[] {
  const pairs = (map: Record<string, string> | undefined) => Object.entries(map ?? {})
  return [replay.sides.map((side) => [side.initial, pairs(side.reveal)]), replay.steps.map(([, action, shown]) => [action, pairs(shown)]), pairs(replay.hidden)]
}

/** Los datos que se guardan en este navegador (con los nombres). */
export const encodeReplayPayload = (replay: DuelReplay) => packPayload(compactReplayEnvelope(replay))
/** Los datos del enlace: sin los nombres; quien lo abre los pide (`resolveReplayNames`). */
export const encodeReplayLinkPayload = (replay: DuelReplay) => packPayload(compactReplayEnvelope(replay, { names: false }))

/** Los passcodes de las cartas que el replay deja ver (los de la tabla del enlace): sus nombres y sus artes. */
export const replayCodes = (replay: DuelReplay): number[] => compactWriter(tableSources(replay)).codes

/**
 * El replay con los nombres que le faltan (un enlace no los trae), pedidos por passcode en una sola consulta, como el combo (`resolveComboNames`). Sin red, o si no llega
 * ninguno, el mismo replay (lo que no tiene nombre se ve «Carta»). No lanza.
 */
export async function resolveReplayNames(replay: DuelReplay, fetchNames: (codes: number[]) => Promise<ReadonlyMap<number, string>>): Promise<DuelReplay> {
  const missing = replayCodes(replay).filter((code) => !replay.cards[String(code)])
  if (missing.length === 0) return replay
  try {
    const found = await fetchNames(missing)
    const filled = missing.flatMap((code) => {
      const text = found.get(code)
      // Lo que no es un nombre (vacío, otro tipo, kilométrico) no entra: esa carta sigue «Carta».
      return typeof text === 'string' && text.length > 0 && text.length <= 200 ? [[String(code), text] as const] : []
    })
    return filled.length === 0 ? replay : { ...replay, cards: { ...replay.cards, ...Object.fromEntries(filled) } }
  } catch {
    return replay
  }
}
export const buildReplayLink = (origin: string, pathname: string, payload: string) => `${origin}${pathname}#${REPLAY_HASH}=${payload}`

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

/** Lee el JSON de un enlace. No lanza. */
export function parseReplayText(text: string): ReplayRead {
  if (text.length > MAX_REPLAY_JSON) return { ok: false, error: 'tooBig' }
  const value = envelopeOf(text)
  if (!value || value.kind !== 'duel' || typeof value.v !== 'number') return { ok: false, error: 'notReplay' }
  if (value.v > DUEL_REPLAY_VERSION) return { ok: false, error: 'newer' }
  if (value.v !== 1 && value.v !== DUEL_REPLAY_VERSION) return { ok: false, error: 'broken' }
  const replay = value.v === 1 ? readReplay(value.replay) : readCompactReplay(value.d)
  return replay ? { ok: true, replay } : { ok: false, error: 'broken' }
}

const fromCombo = (result: Awaited<ReturnType<typeof readComboLink>>): SharedRead =>
  result.ok ? { ok: true, kind: 'combo', combo: result.combo } : { ok: false, error: result.error === 'notCombo' || result.error === 'duel' ? 'notReplay' : result.error }

/** Un enlace pegado (o sus datos solos), de un duelo o de un combo: lo que sea, por su `kind`. No lanza. */
export async function readShared(text: string, nested = false): Promise<SharedRead> {
  if (text.length > MAX_REPLAY_JSON) return { ok: false, error: 'tooBig' }
  const trimmed = text.trim()

  // El JSON sólo llega de adentro de unos datos (`z…`): pegado a mano ya no se lee (el archivo del duelo ahora es un video).
  if (nested && trimmed.startsWith('{')) {
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
    return unpacked.ok ? readShared(unpacked.text, true) : unpacked
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

/** La forma v1 de un replay v2 (lanza si no se puede armar); `readReplay` la valida entera. */
function expandCompactReplay(value: unknown): unknown {
  const raw = (item: unknown) => item
  const [savedAt, mode, view, players, starter, rawTable, mats, shown, rawSteps, rawReveals, life, names, rawResult, hidden, ...rest] = list(value, 14, raw)
  if (rest.length > 0) invalid()
  const read = compactReader(rawTable)
  const pairs = (flat: unknown, max: number) => {
    const items = list(flat, max * 2, read.ref)
    return items.length % 2 === 0 ? Object.fromEntries(items.flatMap((item, n) => (n % 2 === 0 ? [[item, items[n + 1]!]] : []))) : invalid()
  }
  const [mat0, mat1, ...moreMats] = list(mats, 2, read.mat)
  const [shown0, shown1, ...moreShown] = list(shown, 2, (flat) => pairs(flat, 400))
  if (!mat0 || !mat1 || !shown0 || !shown1 || moreMats.length > 0 || moreShown.length > 0) invalid()
  const steps: unknown[][] = list(rawSteps, MAX_STEPS, (item) => {
    const [side, ...action] = list(item, 9, raw)
    return [side, read.action(action)]
  })
  for (const item of list(rawReveals, MAX_STEPS, raw)) {
    const [at, ...flat] = list(item, MAX_REVEAL * 2 + 1, raw)
    steps[readInt(at, 0, steps.length - 1)]!.push(pairs(flat, MAX_REVEAL))
  }
  const cardNames = list(names, MAX_CARDS, raw)
  const [winner, reason] = rawResult === null ? [] : list(rawResult, 2, raw)

  return {
    savedAt: readCompactTime(savedAt),
    mode,
    view,
    players,
    starter,
    sides: [
      { initial: mat0, reveal: shown0 },
      { initial: mat1, reveal: shown1 },
    ],
    steps,
    life,
    cards: Object.fromEntries(read.codes.flatMap((code, n) => (cardNames[n] === null || cardNames[n] === undefined ? [] : [[String(code), cardNames[n]]]))),
    hidden: hidden === undefined ? undefined : pairs(hidden, MAX_HIDDEN),
    result: rawResult === null ? undefined : { winner, reason },
  }
}

function readCompactReplay(value: unknown): DuelReplay | null {
  try {
    return readReplay(expandCompactReplay(value))
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
  /** El largo de los datos de su enlace (sin nombres), para ofrecerlo sólo si entra; uno guardado antes no lo tiene y se mide con `payload` (más largo: lleva los nombres). */
  linkChars?: number
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
    return withoutUndefined({ id: readText(v.id, 80), savedAt: readText(v.savedAt, 40), players: [first ?? invalid(), second ?? invalid()] as [string, string], steps: readInt(v.steps, 0, MAX_STEPS), linkChars: v.linkChars === undefined ? undefined : readInt(v.linkChars, 1, MAX_PAYLOAD_CHARS), view: v.view === 'mine' ? ('mine' as const) : undefined, result: v.result === undefined ? undefined : result(v.result), payload: /^[zj][A-Za-z0-9_-]+$/.test(payload) ? payload : invalid() })
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
  const saved: SavedReplay = withoutUndefined({ id: createId('replay'), savedAt: replay.savedAt, players: replay.players, steps: replay.steps.length, linkChars: (await encodeReplayLinkPayload(replay)).length, view: replay.view === 'mine' ? 'mine' : undefined, result: replay.result, payload: await encodeReplayPayload(replay) })
  const before = readSavedReplays()
  const next = [saved, ...before].slice(0, MAX_SAVED_REPLAYS)

  return writeSavedReplays(next) ? { saved, dropped: before.length >= MAX_SAVED_REPLAYS } : { saved: null, dropped: false }
}

export function deleteSavedReplay(id: string): SavedReplay[] {
  const next = readSavedReplays().filter((item) => item.id !== id)
  writeSavedReplays(next)
  return next
}

// ── En el navegador: compartir ──

/** Comparte el enlace (en el celular con la hoja del sistema; si no, lo copia). Un duelo que no entra en un enlace: `tooLong` (quien llama ofrece el video). `payload`: los datos del enlace, si ya están. */
export async function shareReplayLink(replay: DuelReplay, title: string, payload?: string): Promise<ShareOutcome> {
  return shareLink(buildReplayLink(location.origin, location.pathname, payload ?? (await encodeReplayLinkPayload(replay))), title)
}

/** Si el enlace con datos de este largo entra bajo el tope (para no ofrecerlo cuando no). */
export const linkFits = (payloadChars: number, max: number) => buildReplayLink(location.origin, location.pathname, '').length + payloadChars <= max
