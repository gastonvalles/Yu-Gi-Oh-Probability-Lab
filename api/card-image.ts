import { cardImageWidthOf, resolveCardImageUpstream } from '../src/app/card-image-source'

/**
 * La imagen de una carta no cambia (la URL lleva su id): un año en el CDN de Vercel y otro en el navegador. Los dos plazos son iguales a
 * propósito: el CDN avisa con `Age` cuánto lleva guardada la copia, y con un `max-age` más corto el navegador la volvería a bajar.
 */
const CACHE_HIT = 'public, max-age=31536000, s-maxage=31536000, immutable'
/** Una imagen que se pidió achicada y no se pudo achicar sale entera pero por poco tiempo: un fallo pasajero no se queda un año en el CDN. */
const CACHE_FALLBACK = 'public, max-age=300, s-maxage=300'
const UPSTREAM_TIMEOUT_MS = 8000
/** Lo que se devuelve cuando el pedido está mal o la carta no existe: unos minutos también en el CDN, para que repetirlo no vuelva a despertar la función. */
const CACHE_REJECTED = 'public, max-age=300, s-maxage=300'
/** Una imagen de carta pesa unas decenas de KB: lo que pase de acá no es una imagen de carta. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
/** Y el origen sólo puede devolver una imagen (no se reenvía cualquier tipo de contenido que diga tener). */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
/** Lo más grande (en píxeles) que se le entrega a `sharp` para achicar: las cartas miden ~0,3 megapíxeles. */
const MAX_INPUT_PIXELS = 4_000_000

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

    return new Uint8Array(await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS }).resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer())
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
  // Sólo `path` (lo pone el rewrite) y `w`: cualquier otro parámetro da una copia nueva en el CDN por cada valor y una petición más a YGOPRODeck.
  for (const key of new URL(request.url).searchParams.keys()) {
    if (key !== 'path' && key !== 'w') {
      return new Response('Bad request', { status: 400, headers: { 'Cache-Control': CACHE_REJECTED } })
    }
  }

  const upstream = upstreamOf(request)

  if (!upstream) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': CACHE_REJECTED } })
  }

  // Sin seguir redirecciones: el único origen es YGOPRODeck, y si quisiera mandarnos a otro lado, no vamos.
  const response = await fetch(upstream, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), redirect: 'error' }).catch(() => null)

  if (!response?.ok) {
    // Una carta que no existe se recuerda un rato; una caída de YGOPRODeck, no (el navegador prueba con la URL original).
    return response?.status === 404
      ? new Response('Not found', { status: 404, headers: { 'Cache-Control': CACHE_REJECTED } })
      : new Response('Upstream unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()

  if (!IMAGE_TYPES.has(type) || Number(response.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
    return new Response('Upstream unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  const image = await response.arrayBuffer()

  if (image.byteLength > MAX_IMAGE_BYTES) {
    return new Response('Upstream unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  const width = cardImageWidthOf(new URL(request.url).searchParams.get('w'))
  const small = width ? await resized(image, width) : null

  if (small) {
    return new Response(small, { status: 200, headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE_HIT } })
  }

  return new Response(image, {
    status: 200,
    headers: { 'Content-Type': type, 'Cache-Control': width ? CACHE_FALLBACK : CACHE_HIT },
  })
}
