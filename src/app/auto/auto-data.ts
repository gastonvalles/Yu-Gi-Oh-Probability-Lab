import type { OcgCardData } from 'ocgcore-wasm'
import { mapDeck, needsScript, scriptClosure, type DeckList, type MappedDeck } from './deck-map'
import type { AutoEvent } from './protocol'

/**
 * Los datos de un duelo automático: las filas del `.cdb` de las cartas (y de las fichas, que el núcleo lee en caliente al crearlas) y
 * el cierre de scripts (§3.5 del diseño). Los lectores del núcleo son síncronos, así que todo se baja antes de crear el duelo, en
 * paralelo, con caché en memoria y, si existe, en la `Cache API` (un cajón por versión del manifiesto: datos o scripts nuevos, caché
 * nueva). La fuente es intercambiable (`DataSource`); la de la app es `/auto-data` del mismo origen: en desarrollo la sirve `vite serve`
 * (plugin `autoDataDev` de vite.config.ts) y en producción la función `api/auto-data.ts` (`VITE_AUTO_DATA_URL` la cambia). No importa el
 * paquete del núcleo (sólo sus tipos).
 */

/** Una fila de `datas` como la sirve la fuente: los int64 (`setcode`, `race`) como texto decimal. `name` (de `texts`) es opcional. */
export interface CardRow {
  id: number
  alias: number
  setcode: string
  type: number
  atk: number
  def: number
  level: number
  race: string
  attribute: number
  name?: string
  /** Los rótulos de los efectos (`str1`…`str16` de `texts`: lo que `aux.Stringid(id, n)` nombra en un menú), sin los vacíos del final. */
  strs?: string[]
}

export interface DataManifest {
  /** Cambia con los datos o los scripts: es la clave de la caché. */
  version: string
  /** Los códigos de las fichas del `.cdb`: el núcleo lee sus datos al crearlas, en medio del duelo. */
  tokens: number[]
  /** El deck del rival pasivo: 40 Monstruos Normales sin script (sin efectos y sin cartas sin reglas). */
  filler: number[]
}

export interface DataSource {
  manifest(): Promise<DataManifest>
  /** Las filas de esos códigos (las que no existen, no vienen). */
  cards(codes: readonly number[]): Promise<CardRow[]>
  /** El texto del script, o `null` si no existe. */
  script(name: string): Promise<string | null>
}

/** Lo que el anfitrión necesita para sus lectores, ya en memoria. Viaja al Worker tal cual (`bigint` se clona). */
export interface DuelData {
  /** Los decks pedidos, en códigos del núcleo, con lo que falta (`missing`, `noRules`: con eso no se arranca). */
  decks: MappedDeck[]
  cards: OcgCardData[]
  scripts: Record<string, string>
  names: Record<number, string>
  /** Los rótulos de los efectos por código (`strs`): el `desc` de una pregunta es carta << 4 | n. */
  texts?: Record<number, string[]>
  version: string
}

export interface DataLoader {
  manifest(): Promise<DataManifest>
  /** `onProgress`: archivos listos (bajados o de la caché) sobre los pedidos hasta ahora; el total crece al leer las bibliotecas. */
  load(lists: readonly DeckList[], onProgress?: (done: number, total: number) => void): Promise<DuelData>
}

const TYPE_LINK = 0x4000000
const CACHE_PREFIX = 'auto-data-'

/** La fila del `.cdb` como la lee `cardReader` (codificación de YGOPro: `level` = nivel | escala derecha << 16 | izquierda << 24; en los Link `def` son las flechas; `setcode`, 4 × u16). */
export function cardData(row: CardRow): OcgCardData {
  const setcode = BigInt.asUintN(64, BigInt(row.setcode))
  const isLink = (row.type & TYPE_LINK) !== 0

  return {
    code: row.id,
    alias: row.alias,
    setcodes: [0n, 1n, 2n, 3n].map((i) => Number((setcode >> (i * 16n)) & 0xffffn)).filter((value) => value !== 0),
    type: row.type,
    level: row.level & 0xff,
    attribute: row.attribute,
    race: BigInt.asUintN(64, BigInt(row.race)) as OcgCardData['race'],
    attack: row.atk,
    defense: isLink ? 0 : row.def,
    lscale: (row.level >>> 24) & 0xff,
    rscale: (row.level >>> 16) & 0xff,
    link_marker: isLink ? row.def : 0,
  }
}

/** Lo que el servidor explica en `{ error }` (un despliegue sin los datos de la beta): la sesión lo muestra tal cual. */
export class DataUnavailableError extends Error {}

/** La fuente por HTTP: `<base>/manifest`, `<base>/cards?codes=…` y `<base>/script/<nombre>` (404 = no existe). */
export function httpSource(base: string = import.meta.env.VITE_AUTO_DATA_URL ?? '/auto-data'): DataSource {
  const get = async (path: string) => {
    const response = await fetch(`${base}${path}`)

    if (!response.ok && response.status !== 404) {
      const reason = await response.json().then((body: { error?: unknown }) => body.error, () => undefined)

      throw typeof reason === 'string' ? new DataUnavailableError(reason) : new Error(`auto-data: ${response.status} on ${path}`)
    }

    return response
  }

  return {
    manifest: async () => (await (await get('/manifest')).json()) as DataManifest,
    cards: async (codes) => (codes.length === 0 ? [] : ((await (await get(`/cards?codes=${codes.join(',')}`)).json()) as CardRow[])),
    script: async (name) => {
      const response = await get(`/script/${encodeURIComponent(name)}`)

      return response.status === 404 ? null : response.text()
    },
  }
}

/** Lo bajado queda en memoria (lo que dura el cargador) y en la `Cache API`; si cambia la versión del manifiesto, se empieza de cero. */
export function createDataLoader(source: DataSource, storage: CacheStorage | null = typeof caches === 'undefined' ? null : caches): DataLoader {
  let version: string | null = null
  let manifest: Promise<DataManifest> | null = null
  let box: Promise<Cache | null> = Promise.resolve(null)
  const rows = new Map<number, CardRow | null>()
  const scripts = new Map<string, Promise<string | null>>()

  const keyOf = (kind: string, id: string | number) => `https://auto-data.cache/${kind}/${id}`
  /** De la caché: el valor guardado, o `undefined` si no está (o la caché falla: entonces se baja). */
  const recall = async (kind: string, id: string | number): Promise<unknown> => {
    try {
      const hit = await (await box)?.match(keyOf(kind, id))

      return hit ? ((await hit.json()) as { value: unknown }).value : undefined
    } catch {
      return undefined
    }
  }
  const keep = (kind: string, id: string | number, value: unknown) =>
    void box.then((cache) => cache?.put(keyOf(kind, id), new Response(JSON.stringify({ value })))).catch(() => {})

  function switchVersion(next: string) {
    if (next === version) return
    version = next
    rows.clear()
    scripts.clear()
    box = (async () => {
      if (!storage) return null
      try {
        for (const key of await storage.keys()) if (key.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + next) await storage.delete(key)

        return await storage.open(CACHE_PREFIX + next)
      } catch {
        return null
      }
    })()
  }

  function script(name: string): Promise<string | null> {
    let pending = scripts.get(name)

    if (!pending) {
      pending = (async () => {
        const hit = await recall('script', name)

        if (hit !== undefined) return hit as string | null
        const text = await source.script(name)

        keep('script', name, text)
        return text
      })()
      // Un pedido que falló no queda en memoria: el próximo intento lo vuelve a pedir.
      pending.catch(() => scripts.delete(name))
      scripts.set(name, pending)
    }

    return pending
  }

  // El manifiesto se pide una vez por cargador (una página): datos nuevos en el servidor se ven al recargar.
  const getManifest = () => {
    if (!manifest) {
      manifest = source.manifest()
      manifest.catch(() => (manifest = null))
    }

    return manifest
  }

  return {
    manifest: getManifest,
    async load(lists, onProgress) {
      const manifest = await getManifest()

      switchVersion(manifest.version)
      let done = 0
      let total = 1
      const tick = () => onProgress?.(done, total)

      // Las cartas (con las fichas): lo que está en memoria o en la caché no se pide; lo demás, en un solo pedido. En la caché van todas
      // juntas, en una sola entrada: una consulta por carta (las fichas son ~240) es una tarea larga del hilo principal en un celular.
      const codes = [...new Set([...lists.flatMap((list) => [...list.main, ...(list.extra ?? [])].map(([code]) => code)), ...manifest.tokens])]

      // `all2`: desde que las filas llevan `strs`, las guardadas antes (sin ellos) no sirven.
      if (rows.size === 0) for (const [code, row] of Object.entries(((await recall('cards', 'all2')) ?? {}) as Record<string, CardRow | null>)) rows.set(Number(code), row)
      const wanted = codes.filter((code) => !rows.has(code))

      tick()
      if (wanted.length > 0) {
        const got = new Map((await source.cards(wanted)).map((row) => [row.id, row]))

        for (const code of wanted) rows.set(code, got.get(code) ?? null)
        keep('cards', 'all2', Object.fromEntries(rows))
      }
      done += 1
      tick()

      const data = new Map(codes.flatMap((code) => (rows.get(code) ? [[code, cardData(rows.get(code)!)] as const] : [])))
      const resolve = (code: number) => data.get(code) ?? null
      // El cierre lo arma `scriptClosure` (síncrono, el de F1): cada vuelta pide en paralelo lo que le faltó, hasta que no falte nada
      // (2 o 3 vueltas: las cartas y `utility.lua`; después lo que ésa carga con `Duel.LoadScript`). Los Normales no necesitan script: no se piden.
      const cards = [...new Set(lists.flatMap((list) => [...list.main, ...(list.extra ?? [])].map(([code]) => resolve(code))))].filter((card) => card !== null && needsScript(card)) as OcgCardData[]
      const known = new Map<string, string | null>()
      let names: string[]

      for (;;) {
        const misses = new Set<string>()

        names = scriptClosure(cards, (name) => (known.has(name) ? known.get(name)! : (misses.add(name), null)))
        if (misses.size === 0) break
        total += misses.size
        tick()
        await Promise.all(
          [...misses].map(async (name) => {
            known.set(name, await script(name))
            done += 1
            tick()
          }),
        )
      }

      const texts = Object.fromEntries(names.map((name) => [name, known.get(name)!]))

      return {
        decks: lists.map((list) => mapDeck(list, resolve, (name) => typeof texts[name] === 'string')),
        cards: [...data.values()],
        scripts: texts,
        names: Object.fromEntries(codes.flatMap((code) => (rows.get(code)?.name ? [[code, rows.get(code)!.name!]] : []))),
        texts: Object.fromEntries(codes.flatMap((code) => (rows.get(code)?.strs?.length ? [[code, rows.get(code)!.strs!]] : []))),
        version: manifest.version,
      }
    },
  }
}

/**
 * Los lectores síncronos del anfitrión sobre los datos ya bajados. Lo que el núcleo pida y no esté devuelve `null`: un script (las fichas
 * no tienen; el anfitrión lo anota en `hotScripts`) o una carta (una `fault` de tipo `script` por código, sin cortar el duelo: un cierre
 * que quedó corto).
 */
export function preloadedReaders(data: Pick<DuelData, 'cards' | 'scripts'>, emit: (event: Extract<AutoEvent, { t: 'fault' }>) => void) {
  const cards = new Map(data.cards.map((card) => [card.code, card]))
  const missed = new Set<number>()

  return {
    cardReader: (code: number) => {
      const card = cards.get(code)

      if (!card && code !== 0 && !missed.has(code)) {
        missed.add(code)
        emit({ t: 'fault', kind: 'script', message: `card data not preloaded: ${code}`, cards: [code] })
      }

      return card ?? null
    },
    scriptReader: (name: string) => data.scripts[name] ?? null,
  }
}
