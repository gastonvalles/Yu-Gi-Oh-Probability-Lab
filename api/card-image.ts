import { cardImageWidthOf, resolveCardImageUpstream } from '../src/app/card-image-source'

/**
 * La imagen de una carta no cambia (la URL lleva su id): un año en el CDN de Vercel y otro en el navegador. Los dos plazos son iguales a
 * propósito: el CDN avisa con `Age` cuánto lleva guardada la copia, y con un `max-age` más corto el navegador la volvería a bajar.
 */
const CACHE_HIT = 'public, max-age=31536000, s-maxage=31536000, immutable'
/** Una imagen que se pidió achicada y no se pudo achicar sale entera pero por poco tiempo: un fallo pasajero no se queda un año en el CDN. */
const CACHE_FALLBACK = 'public, max-age=300, s-maxage=300'
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

/** La imagen achicada a `width` px en WebP; null si `sharp` no está o no pudo con ella. */
async function resized(image: ArrayBuffer, width: number): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    // Import dinámico: sin `?w=` la función no carga `sharp` (ni depende de su binario nativo), y las imágenes salen igual.
    const mod = await import('sharp')
    // Vercel compila `api/` a CommonJS, donde `sharp` se exporta sin `default`.
    const sharp = 'default' in mod ? mod.default : mod

    return new Uint8Array(await sharp(image).resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer())
  } catch {
    return null
  }
}

/**
 * Función de Vercel: las imágenes de las cartas salen de acá y no del CDN de YGOPRODeck, que pide no enlazarlas
 * directamente. Cada imagen se les pide una vez (por región del CDN) y después la sirve la caché. Con `?w=` (uno de los
 * anchos de `cardImageWidthOf`) la devuelve achicada, para las miniaturas; cualquier otro `w` se ignora.
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

  const image = await response.arrayBuffer()
  const width = cardImageWidthOf(new URL(request.url).searchParams.get('w'))
  const small = width ? await resized(image, width) : null

  if (small) {
    return new Response(small, { status: 200, headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE_HIT } })
  }

  return new Response(image, {
    status: 200,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'image/jpeg', 'Cache-Control': width ? CACHE_FALLBACK : CACHE_HIT },
  })
}
