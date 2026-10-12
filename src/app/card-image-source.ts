/**
 * De dónde se dibujan las imágenes de las cartas. YGOPRODeck pide no enlazar las suyas directamente (bloquea la
 * IP del que lo hace): en producción pasan por nuestra función `api/card-image`, que se las pide una vez y las
 * deja en la caché del CDN de Vercel; en desarrollo y en `preview`, Vite hace de proxy a la misma ruta.
 */

const REMOTE_PREFIX = 'https://images.ygoprodeck.com/images/'
const PROXY_PREFIX = '/api/card-image/'

/** Lo único que el proxy acepta pedir: las carpetas de imágenes de YGOPRODeck y un nombre de archivo simple. */
const IMAGE_PATH = /^(cards|cards_small|cards_cropped|sets)\/[A-Za-z0-9_-]{1,40}\.jpg$/

/** La URL con la que se dibuja una imagen de YGOPRODeck: por el proxy. Cualquier otra, tal cual. */
export function cardImageSrc(url: string): string {
  if (!url.startsWith(REMOTE_PREFIX)) return url

  const path = url.slice(REMOTE_PREFIX.length)
  return IMAGE_PATH.test(path) ? `${PROXY_PREFIX}${path}` : url
}

/** Qué pedirle a YGOPRODeck por una ruta del proxy; null si no es una imagen de carta. */
export function resolveCardImageUpstream(pathname: string): string | null {
  if (!pathname.startsWith(PROXY_PREFIX)) return null

  const path = pathname.slice(PROXY_PREFIX.length)
  return IMAGE_PATH.test(path) ? `${REMOTE_PREFIX}${path}` : null
}
