import { readApiErrorMessage } from './parser'

const CARDINFO_ENDPOINT = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const NETWORK_ERROR_MESSAGE = 'No se pudo conectar con YGOPRODeck. Revisá tu conexión e intentá de nuevo.'
const GENERIC_ERROR_MESSAGE = 'No se pudo consultar YGOPRODeck.'
// Subí la versión si cambia el formato de lo que se guarda.
const PERSISTENT_CACHE_NAME = 'ygoprodeck-cardinfo-v1'

interface RequestOptions {
  /**
   * Guarda la respuesta en el dispositivo (Cache API) y la reutiliza mientras no supere esta edad.
   * Para el catálogo completo (~20 MB por carga): la API sólo lo deja cachear 30 minutos.
   */
  persistForMs?: number
}

export async function requestCardInfo(params: URLSearchParams, { persistForMs }: RequestOptions = {}): Promise<unknown> {
  const url = `${CARDINFO_ENDPOINT}?${params.toString()}`
  const cache = persistForMs ? await openPersistentCache() : null
  const stored = cache ? await cache.match(url).catch(() => undefined) : undefined

  if (stored && persistForMs && ageOf(stored) < persistForMs) {
    return readJsonPayload(stored)
  }

  let response: Response

  try {
    response = await fetch(url)
  } catch {
    // Sin red: una copia vencida sigue siendo mejor que nada.
    if (stored) {
      return readJsonPayload(stored)
    }

    throw new Error(NETWORK_ERROR_MESSAGE)
  }

  if (cache && response.ok) {
    // Se guarda con la hora local: el header Date del servidor puede faltar o ir en otra zona.
    const headers = new Headers(response.headers)
    headers.set('x-cached-at', String(Date.now()))
    await cache.put(url, new Response(response.clone().body, { status: response.status, headers })).catch(() => undefined)
  }

  const payload = await readJsonPayload(response)

  if (!response.ok) {
    throw new Error(readApiErrorMessage(payload) ?? GENERIC_ERROR_MESSAGE)
  }

  return payload
}

async function openPersistentCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(PERSISTENT_CACHE_NAME)
  } catch {
    return null
  }
}

function ageOf(response: Response): number {
  const cachedAt = Number(response.headers.get('x-cached-at'))
  return Number.isFinite(cachedAt) && cachedAt > 0 ? Date.now() - cachedAt : Number.POSITIVE_INFINITY
}

// Un 5xx o una página de error del proxy puede no ser JSON: devolvemos null
// para que el llamador muestre un mensaje propio en vez de "Unexpected token <".
async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}
