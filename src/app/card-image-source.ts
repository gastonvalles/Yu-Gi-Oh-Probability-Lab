/**
 * De dónde se dibujan las imágenes de las cartas. YGOPRODeck pide no enlazar las suyas directamente (bloquea la
 * IP del que lo hace): en producción pasan por nuestra función `api/card-image`, que se las pide una vez y las
 * deja en la caché del CDN de Vercel; en desarrollo y en `preview`, Vite hace de proxy a la misma ruta.
 */

const REMOTE_PREFIX = 'https://images.ygoprodeck.com/images/'
const PROXY_PREFIX = '/api/card-image/'

/** Lo único que el proxy acepta pedir: las carpetas de imágenes de YGOPRODeck y un nombre de archivo simple. */
const IMAGE_PATH = /^(cards|cards_small|cards_cropped|sets)\/[A-Za-z0-9_-]{1,40}\.jpg$/

/**
 * Los anchos (px) a los que el proxy sabe achicar una imagen (`?w=`). Son pocos y cerrados: cada imagen tiene a lo sumo tres variantes
 * en el CDN, y el que lo pide no puede inventar un ancho que la función después ignore.
 */
const CARD_IMAGE_WIDTHS = [128, 320, 512] as const
type CardImageWidth = (typeof CARD_IMAGE_WIDTHS)[number]

/** El ancho que pide `?w=`; null si falta o no es uno de los permitidos (ahí el proxy sirve la imagen entera, como siempre). */
export function cardImageWidthOf(value: string | null): CardImageWidth | null {
  return CARD_IMAGE_WIDTHS.find((width) => String(width) === value) ?? null
}

/**
 * La URL con la que se dibuja una imagen de YGOPRODeck: por el proxy. Cualquier otra, tal cual.
 * Con `width`, el proxy la devuelve achicada a ese ancho (WebP): para las miniaturas, que no necesitan los 600 px de la original.
 */
export function cardImageSrc(url: string, width?: CardImageWidth): string {
  if (!url.startsWith(REMOTE_PREFIX)) return url

  const path = url.slice(REMOTE_PREFIX.length)
  if (!IMAGE_PATH.test(path)) return url

  return width ? `${PROXY_PREFIX}${path}?w=${width}` : `${PROXY_PREFIX}${path}`
}

/** Qué pedirle a YGOPRODeck por una ruta del proxy; null si no es una imagen de carta. */
export function resolveCardImageUpstream(pathname: string): string | null {
  if (!pathname.startsWith(PROXY_PREFIX)) return null

  const path = pathname.slice(PROXY_PREFIX.length)
  return IMAGE_PATH.test(path) ? `${REMOTE_PREFIX}${path}` : null
}
