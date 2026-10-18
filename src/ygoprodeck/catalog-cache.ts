import { loadFormatData } from '../app/format-data'
import { buildGenesysCardInfo } from '../app/genesys-format'
import type { ApiCardSearchResult, ApiSearchPage } from './types'

// El catálogo completo (~14.600 cartas) se guarda ya procesado: leerlo cuesta una fracción de bajar, parsear y clasificar los ~21 MB crudos en cada visita.
// Subí la versión si cambia lo que devuelve el parser o la forma de ApiCardSearchResult: lo guardado no se vuelve a pasar por el parser.
const CATALOG_CACHE_NAME = 'ygoprodeck-catalog-v2'
// La copia de antes (sin escala, año ni formatos): se borra al guardar la primera página nueva.
const OLD_CATALOG_CACHE_NAMES = ['ygoprodeck-catalog-v1']
// Donde client.ts guardaba las páginas crudas del catálogo, junto con las fichas sueltas de los modales.
const RAW_CACHE_NAME = 'ygoprodeck-cardinfo-v1'

// Lo que se guarda: igual, pero sin el `genesys` de cada carta (se calcula al leer).
interface StoredCatalogPage {
  savedAt: number
  hasMore: boolean
  results: ApiCardSearchResult[]
}

// No es una URL que se pida: sólo nombra la página (por su offset) dentro de la caché.
const catalogKey = (offset: number): string => `https://db.ygoprodeck.com/__catalog/v1?offset=${offset}`

/** Una página guardada, con su edad. Null si no hay, si la caché no está disponible o si lo guardado no es una página válida. */
export async function readCatalogPage(offset: number): Promise<{ page: ApiSearchPage; ageMs: number } | null> {
  try {
    const cache = await openCache(CATALOG_CACHE_NAME)
    const stored = await cache?.match(catalogKey(offset))
    const json = stored ? ((await stored.json()) as Partial<StoredCatalogPage> | null) : null

    if (!json || typeof json.savedAt !== 'number' || typeof json.hasMore !== 'boolean' || !Array.isArray(json.results)) {
      return null
    }

    // La tabla de Genesys se baja aparte: sin ella todas las cartas saldrían con los puntos en null, y el catálogo vive en memoria toda la sesión.
    // Si no baja, el catch de abajo lo trata como "sin copia" y la página se pide a la API (que tampoco entrega cartas sin puntos).
    await loadFormatData()

    for (const card of json.results) {
      if (typeof card?.name !== 'string' || typeof card.ygoprodeckId !== 'number') {
        return null
      }

      // Los puntos de Genesys dependen de los datos de cada versión de la app: no se guardan, se calculan al leer.
      card.genesys = buildGenesysCardInfo(card.name)
    }

    // Guardada "en el futuro" (el reloj se corrió) no es una copia fresca: queda como vencida.
    const ageMs = Date.now() - json.savedAt
    return { page: { results: json.results, hasMore: json.hasMore }, ageMs: ageMs >= 0 ? ageMs : Number.POSITIVE_INFINITY }
  } catch {
    return null
  }
}

let rawPagesDropped = false

/** Guarda la página ya procesada. Si no se puede (sin espacio, sin permiso), el catálogo igual se carga: la próxima visita lo vuelve a pedir. */
export async function writeCatalogPage(offset: number, { results, hasMore }: ApiSearchPage): Promise<void> {
  try {
    const cache = await openCache(CATALOG_CACHE_NAME)

    if (!cache) {
      return
    }

    const stored = { savedAt: Date.now(), hasMore, results: results.map(({ genesys: _genesys, ...card }) => card) }
    await cache.put(catalogKey(offset), new Response(JSON.stringify(stored)))
  } catch {
    return
  }

  // Con la copia procesada a salvo, las páginas crudas de antes (~21 MB) y la copia de la versión anterior sobran. Con una vez por sesión alcanza.
  if (!rawPagesDropped) {
    rawPagesDropped = true
    void dropRawCatalogPages()
  }
}

async function dropRawCatalogPages(): Promise<void> {
  try {
    for (const name of OLD_CATALOG_CACHE_NAMES) {
      await caches.delete(name)
    }

    const cache = await openCache(RAW_CACHE_NAME)

    if (!cache) {
      return
    }

    for (const request of await cache.keys()) {
      // Sólo las del catálogo (pedían de a 1000): las fichas de los modales viven en la misma caché y siguen sirviendo.
      if (new URL(request.url).searchParams.get('num') === '1000') {
        await cache.delete(request)
      }
    }
  } catch {
    return
  }
}

async function openCache(name: string): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(name)
  } catch {
    return null
  }
}
