import { resolveCardImageUpstream } from '../../src/app/card-image-source'

/** La imagen de una carta no cambia: un año en el CDN de Vercel y un día en el navegador. */
const CACHE_HIT = 'public, max-age=86400, s-maxage=31536000, immutable'
const UPSTREAM_TIMEOUT_MS = 8000

/**
 * Función de Vercel: las imágenes de las cartas salen de acá y no del CDN de YGOPRODeck, que pide no enlazarlas
 * directamente. Cada imagen se les pide una vez (por región del CDN) y después la sirve la caché.
 */
export async function GET(request: Request): Promise<Response> {
  const upstream = resolveCardImageUpstream(new URL(request.url).pathname)

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
