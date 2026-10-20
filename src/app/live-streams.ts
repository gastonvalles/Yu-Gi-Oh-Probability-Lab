import type { ReplayChannel } from './replays'

/**
 * Las transmisiones en vivo de los canales oficiales de YouTube donde se juegan los torneos (los mismos de los replays).
 * No hay API ni key: la función `api/live.ts` lee la pestaña «En vivo» de cada canal como la lee el sitio de YouTube y devuelve sólo lo que está al aire;
 * esta parte (pura, sin red) lee esa página y valida lo que vuelve a la app. Es un formato interno de YouTube que puede cambiar: si pasa, la función dice
 * `ok: false` en vez de decir que no hay nada en vivo. De la misma página salen las **últimas transmisiones que ya terminaron** (torneos enteros, día por día), que se pueden ver después de que se van del aire.
 */

/** Los canales, en el orden en que se leen. `handle` es el @ del canal. */
export const LIVE_CHANNELS: ReadonlyArray<{ key: ReplayChannel; handle: string }> = [
  { key: 'tcg', handle: 'OfficialYuGiOhTCG' },
  { key: 'eu', handle: 'YuGiOhCardEU' },
]

/** La miniatura de una transmisión al aire: YouTube la renueva con lo que se ve ahora (4:3 con barras negras: se recorta a 16:9 con `object-cover`). */
export const liveThumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`

/** La pestaña de transmisiones de un canal: las que están al aire van primero. */
export const streamsPageUrl = (handle: string) => `https://www.youtube.com/@${handle}/streams`

export interface LiveStream {
  /** El id del video en YouTube (11 caracteres). */
  id: string
  channel: ReplayChannel
  title: string
  /** Cuánta gente la está viendo, aproximado (YouTube dice «6.7K watching»); null si no lo dice. */
  viewers: number | null
}

/** Una transmisión que ya terminó (un torneo entero, de un día), de uno de los canales. */
export interface PastStream {
  id: string
  channel: ReplayChannel
  title: string
  /** «5:42:32»; null si no se pudo leer. */
  duration: string | null
  /** Lo que dice YouTube de cuándo fue, en inglés («Streamed 2 days ago»); `parseAgo` lo entiende. */
  published: string | null
}

export interface LiveStreams {
  /** Se pudieron leer los canales. Con `false` una lista vacía no quiere decir que no haya nada en vivo: no se pudo mirar. */
  ok: boolean
  /** Cuándo se miró (ISO). */
  checkedAt: string
  /** Lo que está al aire, lo más visto primero. */
  streams: LiveStream[]
  /** Las últimas que ya terminaron, de cada canal en el orden en que las lista YouTube (la más nueva primero). */
  past: PastStream[]
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const MAX_TITLE_LENGTH = 200
const MAX_STREAMS = 12
/** Cuántas transmisiones ya terminadas se toman de cada canal, y cuántas como mucho llegan a la app. */
const PAST_PER_CHANNEL = 3
const MAX_PAST = 8
const DURATION = /^\d{1,2}(?::\d{2}){1,2}$/
const PUBLISHED = /^(?:Streamed|Premiered)\b.*\bago$/i
const CHANNEL_KEYS: readonly string[] = LIVE_CHANNELS.map((channel) => channel.key)
const UNITS: Record<string, number> = { k: 1e3, m: 1e6 }

/** Un video de la página de un canal, esté o no al aire. */
export interface ScannedVideo {
  id: string
  title: string
  live: boolean
  viewers: number | null
  /** «5:42:32» (lo ya transmitido lo lleva en la miniatura); null si no está. */
  duration: string | null
  /** «Streamed 2 days ago»; null si no está. */
  published: string | null
}

/** «6.7K watching», «1,234 watching», «1.2M watching» → 6700, 1234, 1200000; null si no es una cantidad de gente. */
export function parseViewers(text: unknown): number | null {
  const match = typeof text === 'string' ? /(\d[\d,]*(?:\.\d+)?)\s*([KkMm])?\s+(?:watching|viewers)\b/.exec(text) : null

  if (!match) {
    return null
  }

  const value = Number(match[1]!.replace(/,/g, ''))

  return Number.isFinite(value) ? Math.round(value * (UNITS[(match[2] ?? '').toLowerCase()] ?? 1)) : null
}

/** Lo que YouTube deja en la página del canal (`var ytInitialData = {…};`) ya leído; null si la página no lo trae (un aviso de cookies, un bloqueo) o no se entiende. */
export function extractInitialData(html: string): unknown {
  const match = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html)

  if (!match) {
    return null
  }

  try {
    return JSON.parse(match[1]!) as unknown
  } catch {
    return null
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** El texto de un título de YouTube: `{ content }` (formato nuevo), `{ simpleText }` o `{ runs: [{ text }] }` (formato viejo). */
function textOf(value: unknown): string {
  if (!isObject(value)) {
    return ''
  }

  if (typeof value.content === 'string') {
    return value.content
  }

  if (typeof value.simpleText === 'string') {
    return value.simpleText
  }

  return Array.isArray(value.runs) ? value.runs.map((run) => (isObject(run) && typeof run.text === 'string' ? run.text : '')).join('') : ''
}

/** ¿Algún nodo de adentro cumple? Recorre todo el pedazo de JSON: no depende de en qué lugar lo pone cada versión de la página. */
function someNode(root: unknown, test: (node: Record<string, unknown>) => boolean): boolean {
  if (Array.isArray(root)) {
    return root.some((item) => someNode(item, test))
  }

  if (!isObject(root)) {
    return false
  }

  return test(root) || Object.values(root).some((value) => someNode(value, test))
}

/** El texto de «N watching» que aparezca en cualquier lugar de un pedazo de JSON. */
function findViewers(root: unknown): number | null {
  let found: number | null = null

  someNode(root, (node) => {
    for (const value of Object.values(node)) {
      const viewers = typeof value === 'string' ? parseViewers(value) : isObject(value) ? parseViewers(textOf(value)) : null

      if (viewers !== null) {
        found = viewers
        return true
      }
    }

    return false
  })

  return found
}

/** El primer texto de un pedazo de JSON que cumpla `pattern` (un texto suelto o el de un `{ content }`, `{ simpleText }` o `{ runs }`); null si ninguno. */
function findText(root: unknown, pattern: RegExp): string | null {
  let found: string | null = null

  someNode(root, (node) => {
    for (const value of Object.values(node)) {
      const text = typeof value === 'string' ? value : isObject(value) ? textOf(value) : ''

      if (pattern.test(text.trim())) {
        found = text.trim()
        return true
      }
    }

    return false
  })

  return found
}

/** `lockupViewModel` es el formato nuevo de la lista de videos y `videoRenderer` el viejo. */
function scanLockup(node: Record<string, unknown>): ScannedVideo | null {
  const id = node.contentId
  const metadata = isObject(node.metadata) && isObject(node.metadata.lockupMetadataViewModel) ? node.metadata.lockupMetadataViewModel : null

  if (typeof id !== 'string' || !VIDEO_ID.test(id) || !metadata) {
    return null
  }

  return {
    id,
    title: textOf(metadata.title),
    // La insignia «LIVE» de la miniatura: lo que está al aire la lleva y lo ya transmitido muestra su duración.
    live: someNode(node.contentImage, (badge) => badge.badgeStyle === 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE'),
    viewers: findViewers(metadata.metadata),
    duration: findText(node.contentImage, DURATION),
    published: findText(metadata.metadata, PUBLISHED),
  }
}

function scanRenderer(node: Record<string, unknown>): ScannedVideo | null {
  const id = node.videoId

  if (typeof id !== 'string' || !VIDEO_ID.test(id)) {
    return null
  }

  return {
    id,
    title: textOf(node.title),
    live:
      someNode(node.badges, (badge) => badge.style === 'BADGE_STYLE_TYPE_LIVE_NOW') ||
      someNode(node.thumbnailOverlays, (overlay) => overlay.style === 'LIVE'),
    viewers: parseViewers(textOf(node.viewCountText)),
    duration: findText(node.lengthText, DURATION),
    published: findText(node.publishedTimeText, PUBLISHED),
  }
}

/** Todos los videos de la página de un canal (con o sin transmisión al aire), sin repetir; vacío si lo que llegó no es una lista de videos. */
export function scanVideos(root: unknown): ScannedVideo[] {
  const videos = new Map<string, ScannedVideo>()

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (!isObject(node)) {
      return
    }

    const video = isObject(node.lockupViewModel) ? scanLockup(node.lockupViewModel) : isObject(node.videoRenderer) ? scanRenderer(node.videoRenderer) : null

    if (video && !videos.has(video.id)) {
      videos.set(video.id, video)
    }

    Object.values(node).forEach(visit)
  }

  visit(root)

  return [...videos.values()]
}

/** Lo que está al aire de la página de un canal. */
export function readLiveStreams(root: unknown, channel: ReplayChannel): LiveStream[] {
  return scanVideos(root)
    .filter((video) => video.live)
    .map((video) => ({ id: video.id, channel, title: video.title.trim().slice(0, MAX_TITLE_LENGTH), viewers: video.viewers }))
}

/** Las últimas transmisiones que ya terminaron de la página de un canal, en el orden en que las lista YouTube (la más nueva primero). Sin título no hay con qué mostrarla. */
export function readPastStreams(root: unknown, channel: ReplayChannel): PastStream[] {
  return scanVideos(root)
    .filter((video) => !video.live && video.title.trim() !== '')
    .slice(0, PAST_PER_CHANNEL)
    .map((video) => ({ id: video.id, channel, title: video.title.trim().slice(0, MAX_TITLE_LENGTH), duration: video.duration, published: video.published }))
}

export type AgoUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

/** Cómo escribe YouTube cada unidad: completa («2 days ago») o abreviada («2d ago», la forma que usa la lista de transmisiones de un canal). */
const AGO_UNITS: Readonly<Record<string, AgoUnit>> = { s: 'second', sec: 'second', second: 'second', m: 'minute', min: 'minute', minute: 'minute', h: 'hour', hr: 'hour', hour: 'hour', d: 'day', day: 'day', w: 'week', wk: 'week', week: 'week', mo: 'month', month: 'month', y: 'year', yr: 'year', year: 'year' }

/** «Streamed 2 days ago» y «Streamed 2d ago» → `{ value: 2, unit: 'day' }` (para decirlo en el idioma de quien mira); null si no se entiende. */
export function parseAgo(text: string | null): { value: number; unit: AgoUnit } | null {
  const match = typeof text === 'string' ? /(\d+)\s*(second|sec|s|minute|min|mo|month|m|hour|hr|h|day|d|week|wk|w|year|yr|y)s?\s+ago\b/i.exec(text) : null
  const unit = match ? AGO_UNITS[match[2]!.toLowerCase()] : undefined

  return match && unit ? { value: Number(match[1]), unit } : null
}

/** Los más vistos primero; con la misma cantidad (o sin dato), por id para que el orden no cambie de un pedido a otro. */
export const byViewers = (a: LiveStream, b: LiveStream) => (b.viewers ?? -1) - (a.viewers ?? -1) || a.id.localeCompare(b.id)

/** Lo que devuelve `/api/live`, validado: la app nunca arma un link o un reproductor con algo que no sea un id de video. */
export function parseLiveResponse(value: unknown): LiveStreams {
  const streams: LiveStream[] = []

  if (isObject(value) && Array.isArray(value.streams)) {
    for (const entry of value.streams) {
      if (
        isObject(entry) &&
        typeof entry.id === 'string' &&
        VIDEO_ID.test(entry.id) &&
        typeof entry.channel === 'string' &&
        CHANNEL_KEYS.includes(entry.channel) &&
        typeof entry.title === 'string' &&
        entry.title.trim() !== '' &&
        !streams.some((stream) => stream.id === entry.id)
      ) {
        streams.push({
          id: entry.id,
          channel: entry.channel as ReplayChannel,
          title: entry.title.trim().slice(0, MAX_TITLE_LENGTH),
          viewers: typeof entry.viewers === 'number' && Number.isFinite(entry.viewers) && entry.viewers >= 0 ? Math.round(entry.viewers) : null,
        })
      }
    }
  }

  const past: PastStream[] = []

  if (isObject(value) && Array.isArray(value.past)) {
    for (const entry of value.past) {
      if (
        isObject(entry) &&
        typeof entry.id === 'string' &&
        VIDEO_ID.test(entry.id) &&
        typeof entry.channel === 'string' &&
        CHANNEL_KEYS.includes(entry.channel) &&
        typeof entry.title === 'string' &&
        entry.title.trim() !== '' &&
        !past.some((stream) => stream.id === entry.id) &&
        !streams.some((stream) => stream.id === entry.id)
      ) {
        past.push({
          id: entry.id,
          channel: entry.channel as ReplayChannel,
          title: entry.title.trim().slice(0, MAX_TITLE_LENGTH),
          duration: typeof entry.duration === 'string' && DURATION.test(entry.duration) ? entry.duration : null,
          published: typeof entry.published === 'string' && PUBLISHED.test(entry.published) ? entry.published : null,
        })
      }
    }
  }

  return {
    ok: isObject(value) && value.ok === true,
    checkedAt: isObject(value) && typeof value.checkedAt === 'string' ? value.checkedAt : '',
    streams: streams.sort(byViewers).slice(0, MAX_STREAMS),
    past: past.slice(0, MAX_PAST),
  }
}

/** Las transmisiones en vivo, de la función de la app. Un error de red o de la función es un error: quien la llama decide qué mostrar. */
export async function fetchLiveStreams(get: typeof fetch = (...args) => fetch(...args)): Promise<LiveStreams> {
  const response = await get('/api/live', { headers: { Accept: 'application/json' } })

  if (!response.ok) {
    throw new Error(`/api/live: ${response.status}`)
  }

  return parseLiveResponse(await response.json())
}
