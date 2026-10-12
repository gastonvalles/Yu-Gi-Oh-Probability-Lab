import { resolveCardImageUpstream } from '../src/app/card-image-source'

/** La imagen de una carta no cambia: un año en el CDN de Vercel y un día en el navegador. */
const CACHE_HIT = 'public, max-age=86400, s-maxage=31536000, immutable'
const UPSTREAM_TIMEOUT_MS = 8000

/**
 * `vercel.json` reescribe /api/card-image/<carpeta>/<archivo>.jpg a esta función con la ruta en `?path=`
 * (Vercel ya no documenta rutas dinámicas en `api/`); por las dudas se mira también la URL entera.
 */
function upstreamOf(request: Request): string | null {
  const url = new URL(request.url)
  const path = url.searchParams.get('path')

  return resolveCardImageUpstream(url.pathname) ?? (path ? resolveCardImageUpstream(`/api/card-image/${path}`) : null)
}

/**
 * Función de Vercel: las imágenes de las cartas salen de acá y no del CDN de YGOPRODeck, que pide no enlazarlas
 * directamente. Cada imagen se les pide una vez (por región del CDN) y después la sirve la caché.
 */
export async function GET(request: Request): Promise<Response> {
  const upstream = upstreamOf(request)

  if (!upstream) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } })
  }

  const response = await fetch(upstream, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }).catch(() => null)

  if (!response?.ok) {
    // Una carta que no existe se recuerda un rato; una caída de YGOPRODeck, no (el navegador prueba con la URL original).
    return response?.status === 404
      ? new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } })
      : new Response('Upstream unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  return new Response(await response.arrayBuffer(), {
    status: 200,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'image/jpeg', 'Cache-Control': CACHE_HIT },
  })
}
