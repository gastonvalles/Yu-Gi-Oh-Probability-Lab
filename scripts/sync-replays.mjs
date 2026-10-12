import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Baja de YouTube los replays de duelos de torneo de dos canales oficiales y escribe src/data/replays.json:
 * - Yu-Gi-Oh! TCG Europe (@YuGiOhCardEU): los YCS de Europa.
 * - Official Yu-Gi-Oh! TCG (@OfficialYuGiOhTCG): los de Norteamérica.
 * Sin API key: lee la pestaña Videos de cada canal como la lee el sitio de YouTube (los datos que trae la página y las
 * páginas siguientes del mismo endpoint interno, de 30 en 30), del más nuevo al más viejo, hasta salir de la ventana.
 * El feed RSS no alcanza: da sólo los últimos 15 videos y casi ninguno es un replay. Es un formato interno de YouTube que
 * puede cambiar: si pasa, el script falla (y el workflow se ve rojo) en vez de publicar una lista vacía.
 * La app cruza cada replay con los decks de la pestaña Meta por torneo y jugador (src/app/replays.ts).
 * Lo corre todos los días el workflow sync-replays; a mano: `npm run sync:replays`.
 */
const CHANNELS = [
  { key: 'eu', id: 'UCvjX8v8KMcLToVxKLjDNSVg', handle: 'YuGiOhCardEU', name: 'Yu-Gi-Oh! TCG Europe' },
  { key: 'tcg', id: 'UC8uDq60PstVf56UwH6qfMAA', handle: 'OfficialYuGiOhTCG', name: 'Yu-Gi-Oh! TCG' },
]
const OUTPUT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'replays.json')
/** Un poco más que las ocho semanas de decks del Meta: el replay se sube unos días después del torneo. */
const WINDOW_DAYS = 75
const MAX_PAGES = 15
/** Una página con menos videos que esto no es la pestaña Videos: YouTube cambió el formato o nos mostró otra cosa. */
const MIN_FIRST_PAGE_VIDEOS = 5
/** Un replay dura bastante más que esto; lo corto (shorts, avances) no cuenta. */
const MIN_REPLAY_SECONDS = 180
const PAGE_DELAY_MS = 400
const REQUEST_TIMEOUT_MS = 30_000
const REQUEST_ATTEMPTS = 3
const RETRY_DELAY_MS = 1500
const MS_PER_DAY = 86_400_000
/** YouTube sirve otra página a los clientes que no parecen un navegador; `SOCS` salta el aviso de cookies de la UE y `hl` fija el idioma ("3w ago"). */
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'SOCS=CAI; CONSENT=YES+1',
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(url, init) {
  let lastError

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, headers: { ...HEADERS, ...init?.headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

      if (!response.ok) {
        throw new Error(`${response.status} ${url}`)
      }

      return response
    } catch (error) {
      lastError = error
      await sleep(RETRY_DELAY_MS * attempt)
    }
  }

  throw lastError
}

// Lectura de las respuestas de YouTube (exportadas para el test)

const UNIT_DAYS = [
  [/^y/, 365],
  [/^mo/, 30],
  [/^w/, 7],
  [/^d/, 1],
  [/^h/, 1 / 24],
  [/^(min|m$)/, 1 / 1440],
  [/^s/, 1 / 86_400],
]
const AGO = /(\d+)\s*(years?|y|months?|mo|weeks?|w|days?|d|hours?|h|minutes?|min|m|seconds?|sec|s)\s+ago\b/i

/** Hace cuántos días se subió un video según el texto que muestra YouTube ("3w ago", "2 months ago", "Streamed 5 days ago"); null si no es una fecha. */
export function agoDays(text) {
  const match = typeof text === 'string' ? AGO.exec(text) : null

  if (!match) {
    return null
  }

  const unit = match[2].toLowerCase()
  const perUnit = UNIT_DAYS.find(([pattern]) => pattern.test(unit))?.[1]

  return perUnit === undefined ? null : Number(match[1]) * perUnit
}

/** "31:38" o "1:02:03" a segundos; null si no es una duración. */
export function durationSeconds(text) {
  if (typeof text !== 'string' || !/^\d+(:\d{2}){1,2}$/.test(text)) {
    return null
  }

  return text.split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

/** Un replay tiene a los dos jugadores en el título ("A. vs. B.") y dura lo que dura un duelo. */
export function isReplay(video) {
  const seconds = durationSeconds(video.duration)

  return /\svs\.?\s/i.test(video.title) && !/#shorts/i.test(video.title) && seconds !== null && seconds >= MIN_REPLAY_SECONDS
}

/**
 * Los videos y el token de la página siguiente de un pedazo de la respuesta de YouTube. Recorre el JSON entero, así no
 * depende de en qué lugar lo pone cada versión de la página: `lockupViewModel` es el formato nuevo y `videoRenderer` el viejo.
 */
export function readPage(root) {
  const videos = new Map()
  let token = null

  const duration = (node) => {
    let found = null

    const visit = (value) => {
      if (found !== null || !value || typeof value !== 'object') {
        return
      }

      if (Array.isArray(value)) {
        value.forEach(visit)
        return
      }

      const text = value.thumbnailBadgeViewModel?.text

      if (durationSeconds(text) !== null) {
        found = text
        return
      }

      Object.values(value).forEach(visit)
    }

    visit(node)
    return found ?? ''
  }

  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (!node || typeof node !== 'object') {
      return
    }

    const lockup = node.lockupViewModel

    if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && typeof lockup.contentId === 'string') {
      const meta = lockup.metadata?.lockupMetadataViewModel
      const parts = (meta?.metadata?.contentMetadataViewModel?.metadataRows ?? []).flatMap((row) => (row.metadataParts ?? []).map((part) => part.text?.content ?? ''))

      videos.set(lockup.contentId, {
        id: lockup.contentId,
        title: String(meta?.title?.content ?? ''),
        duration: duration(lockup.contentImage),
        ago: parts.find((part) => agoDays(part) !== null) ?? '',
      })
    }

    const renderer = node.videoRenderer

    if (typeof renderer?.videoId === 'string') {
      videos.set(renderer.videoId, {
        id: renderer.videoId,
        title: (renderer.title?.runs ?? []).map((run) => run.text).join(''),
        duration: renderer.lengthText?.simpleText ?? '',
        ago: renderer.publishedTimeText?.simpleText ?? '',
      })
    }

    const next = node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token

    if (typeof next === 'string') {
      token = next
    }

    Object.values(node).forEach(visit)
  }

  visit(root)
  return { videos: [...videos.values()], token }
}

/** Los datos iniciales de la página (`var ytInitialData = {...};`). */
function readInitialData(html) {
  const text = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html)?.[1]

  if (!text) {
    throw new Error('La página del canal no trae ytInitialData: YouTube cambió el formato o mostró otra página.')
  }

  return JSON.parse(text)
}

/** La grilla de la pestaña Videos (la pestaña seleccionada): sus videos y el token para pedir más. */
function readVideosGrid(data) {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? []
  const grid = tabs.find((tab) => tab.tabRenderer?.selected)?.tabRenderer?.content?.richGridRenderer?.contents

  if (!Array.isArray(grid)) {
    throw new Error('No encuentro la grilla de videos del canal.')
  }

  return grid
}

/** Videos del canal, del más nuevo al más viejo, hasta que uno cae fuera de la ventana. */
async function fetchChannelVideos(channel) {
  const html = await (await request(`https://www.youtube.com/channel/${channel.id}/videos?hl=en&gl=US`)).text()
  const key = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1]
  const version = /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1]
  const first = readPage(readVideosGrid(readInitialData(html)))

  if (first.videos.length < MIN_FIRST_PAGE_VIDEOS) {
    throw new Error(`${channel.name}: la primera página trae ${first.videos.length} videos (se esperan al menos ${MIN_FIRST_PAGE_VIDEOS}).`)
  }

  const videos = [...first.videos]
  let token = first.token

  for (let page = 2; page <= MAX_PAGES && token && !isPastWindow(videos.at(-1)); page += 1) {
    await sleep(PAGE_DELAY_MS)
    const url = `https://www.youtube.com/youtubei/v1/browse?key=${key}&prettyPrint=false`
    const body = { context: { client: { clientName: 'WEB', clientVersion: version, hl: 'en', gl: 'US' } }, continuation: token }
    const json = await (await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
    const actions = json.onResponseReceivedActions ?? json.onResponseReceivedEndpoints ?? []
    const next = readPage(actions.flatMap((action) => action.appendContinuationItemsAction?.continuationItems ?? []))

    videos.push(...next.videos)
    token = next.token
  }

  return videos
}

const isPastWindow = (video) => (agoDays(video?.ago) ?? 0) > WINDOW_DAYS

// Escritura

/** Una línea por video: git sólo ve lo que cambió. */
export function formatPayload(payload) {
  const videos = payload.videos.map((video) => `    ${JSON.stringify(video)}`)

  return [
    '{',
    `  "fetchedAt": ${JSON.stringify(payload.fetchedAt)},`,
    `  "windowDays": ${payload.windowDays},`,
    `  "channels": ${JSON.stringify(payload.channels)},`,
    videos.length === 0 ? '  "videos": []' : `  "videos": [\n${videos.join(',\n')}\n  ]`,
    '}',
    '',
  ].join('\n')
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const fetchedAt = new Date().toISOString()
  const now = Date.parse(fetchedAt)
  const cutoff = new Date(now - WINDOW_DAYS * MS_PER_DAY).toISOString().slice(0, 10)
  const previous = await readPrevious()
  // La fecha que YouTube da es relativa ("3w ago"): la primera vez que se ve un video es la más precisa, y esa se conserva.
  const knownDates = new Map((previous?.videos ?? []).map((video) => [video.id, video.date]))
  const videos = []

  for (const [order, channel] of CHANNELS.entries()) {
    const found = await fetchChannelVideos(channel)
    const replays = found.filter(isReplay)

    console.log(`${channel.name}: ${found.length} videos leídos, ${replays.length} replays`)

    for (const video of replays) {
      const days = agoDays(video.ago)
      const date = knownDates.get(video.id) ?? (days === null ? null : new Date(now - days * MS_PER_DAY).toISOString().slice(0, 10))

      if (date !== null && date >= cutoff) {
        videos.push({ order, video: { id: video.id, channel: channel.key, title: video.title, duration: video.duration, date } })
      }
    }

    await sleep(PAGE_DELAY_MS)
  }

  // Del más nuevo al más viejo; a igual fecha, el orden del canal (que ya viene del más nuevo al más viejo).
  videos.sort((left, right) => right.video.date.localeCompare(left.video.date) || left.order - right.order)

  const payload = {
    fetchedAt,
    windowDays: WINDOW_DAYS,
    channels: Object.fromEntries(CHANNELS.map((channel) => [channel.key, { name: channel.name, url: `https://www.youtube.com/@${channel.handle}` }])),
    videos: videos.map(({ video }) => video),
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, formatPayload(payload), 'utf8')
  console.log(`${payload.videos.length} replays desde ${cutoff}: ${OUTPUT_PATH}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
