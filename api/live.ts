import { LIVE_CHANNELS, byViewers, extractInitialData, readLiveStreams, scanVideos, streamsPageUrl, type LiveStream, type LiveStreams } from '../src/app/live-streams'

/** Lo más que se espera a YouTube por canal: la función no puede quedarse colgada si no contesta. */
const UPSTREAM_TIMEOUT_MS = 6000
/** La página de un canal pesa ~1,3 MB; lo que pase de acá no es la página que se espera. */
const MAX_PAGE_CHARS = 6_000_000
/**
 * Lo que se pide a YouTube se comparte entre todos los visitantes: el CDN de Vercel guarda la respuesta unos segundos (y sirve la anterior mientras trae la nueva),
 * así que YouTube recibe a lo sumo un par de pedidos por minuto sin importar cuánta gente abra los replays. Una lectura fallida se guarda menos: se reintenta enseguida.
 */
const CACHE_OK = 'public, max-age=0, s-maxage=45, stale-while-revalidate=120'
const CACHE_FAILED = 'public, max-age=0, s-maxage=15'
const CACHE_REJECTED = 'public, max-age=300, s-maxage=300'
/** YouTube sirve otra página a los clientes que no parecen un navegador; `SOCS` salta el aviso de cookies de la UE y `hl` fija el idioma («1.6K watching»). */
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'SOCS=CAI; CONSENT=YES+1',
}

/** Lo que está al aire en un canal; `ok` es false si la página no era la lista de videos del canal (no se pudo mirar, que no es lo mismo que no haber nada). */
async function readChannel({ key, handle }: (typeof LIVE_CHANNELS)[number]): Promise<{ ok: boolean; streams: LiveStream[] }> {
  try {
    const response = await fetch(streamsPageUrl(handle), { headers: HEADERS, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })

    if (!response.ok) {
      return { ok: false, streams: [] }
    }

    const html = await response.text()
    const data = html.length > MAX_PAGE_CHARS ? null : extractInitialData(html)

    // Un canal tiene muchos videos: si la página no trae ninguno, es otra cosa (un aviso de cookies, un bloqueo, un cambio de formato).
    return data !== null && scanVideos(data).length > 0 ? { ok: true, streams: readLiveStreams(data, key) } : { ok: false, streams: [] }
  } catch {
    return { ok: false, streams: [] }
  }
}

/**
 * Función de Vercel: qué transmisiones en vivo hay ahora en los canales oficiales de YouTube de los torneos (`src/app/live-streams.ts`).
 * La app la pide cada minuto mientras se ven los replays. Los canales son fijos: no se lee nada que venga del pedido.
 */
export async function GET(request: Request): Promise<Response> {
  // Sin parámetros: cada valor distinto sería una copia nueva en el CDN y un pedido más a YouTube.
  if (new URL(request.url).search !== '') {
    return new Response('Bad request', { status: 400, headers: { 'Cache-Control': CACHE_REJECTED } })
  }

  const results = await Promise.all(LIVE_CHANNELS.map(readChannel))
  const body: LiveStreams = {
    ok: results.every((result) => result.ok),
    checkedAt: new Date().toISOString(),
    streams: results.flatMap((result) => result.streams).sort(byViewers),
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': body.ok ? CACHE_OK : CACHE_FAILED },
  })
}
