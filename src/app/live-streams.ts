import type { ReplayChannel } from './replays'

/**
 * Las transmisiones en vivo de los canales oficiales de YouTube donde se juegan los torneos (los mismos de los replays).
 * No hay API ni key: la función `api/live.ts` lee la pestaña «En vivo» de cada canal como la lee el sitio de YouTube y devuelve sólo lo que está al aire;
 * esta parte (pura, sin red) lee esa página y valida lo que vuelve a la app. Es un formato interno de YouTube que puede cambiar: si pasa, la función dice
 * `ok: false` en vez de decir que no hay nada en vivo.
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

export interface LiveStreams {
  /** Se pudieron leer los canales. Con `false` una lista vacía no quiere decir que no haya nada en vivo: no se pudo mirar. */
  ok: boolean
  /** Cuándo se miró (ISO). */
  checkedAt: string
  /** Lo que está al aire, lo más visto primero. */
  streams: LiveStream[]
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const MAX_TITLE_LENGTH = 200
const MAX_STREAMS = 12
const CHANNEL_KEYS: readonly string[] = LIVE_CHANNELS.map((channel) => channel.key)
const UNITS: Record<string, number> = { k: 1e3, m: 1e6 }

/** Un video de la página de un canal, esté o no al aire. */
export interface ScannedVideo {
  id: string
  title: string
  live: boolean
  viewers: number | null
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

  return {
    ok: isObject(value) && value.ok === true,
    checkedAt: isObject(value) && typeof value.checkedAt === 'string' ? value.checkedAt : '',
    streams: streams.sort(byViewers).slice(0, MAX_STREAMS),
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
