import type { OcgCardData } from 'ocgcore-wasm'
import { CODE_CONSTANT, mapDeck, needsScript, scriptClosure, type DeckList, type MappedDeck } from './deck-map'
import type { AutoEvent } from './protocol'
import type { ApiCardReference } from '../../types'

/**
 * Los datos de un duelo automático: las filas del `.cdb` de las cartas (y de las fichas, que el núcleo lee en caliente al crearlas, y de
 * las que lee por ellas: su `alias` y lo que nombran sus scripts) y el cierre de scripts (§3.5 del diseño). Los lectores del núcleo son
 * síncronos, así que todo se baja antes de crear el duelo, en paralelo, con caché en memoria y, si existe, en la `Cache API` (un cajón
 * por versión del manifiesto: datos o scripts nuevos, caché nueva). La fuente es intercambiable (`DataSource`); la de la app es
 * `/auto-data` del mismo origen: en desarrollo la sirve `vite serve` (plugin `autoDataDev` de vite.config.ts) y en producción la función
 * `api/auto-data.ts` (`VITE_AUTO_DATA_URL` la cambia). No importa el paquete del núcleo (sólo sus tipos).
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
  /** Interruptores del despliegue (`AUTO_ONLINE=0` en el build): `online: false` apaga el duelo automático por enlace sin tocar código. Sin dato, encendido. */
  features?: { online?: boolean }
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
  /** Los decks pedidos, en códigos del núcleo, con lo que no tiene reglas (`missing`, `noRules`: se juega igual, sin efectos, y se avisa). */
  decks: MappedDeck[]
  cards: OcgCardData[]
  scripts: Record<string, string>
  names: Record<number, string>
  /** Los rótulos de los efectos por código (`strs`): el `desc` de una pregunta nombra la carta y cuál (`splitDesc`). */
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
/** `s.listed_names={…}`: las cartas que nombra un script, en números o en constantes (`CARD_DARK_MAGICIAN`). */
const LISTED_NAMES = /\.listed_names\s*=\s*\{([^}]*)\}/g

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

const ATTRIBUTES = ['EARTH', 'WATER', 'FIRE', 'WIND', 'LIGHT', 'DARK', 'DIVINE']
const RACES = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Creator-God', 'Wyrm', 'Cyberse', 'Illusion']
/** Las palabras de `cardType` de YGOPRODeck y su bit de `type` (`TYPE_*` de `constant.lua`). */
const TYPE_WORDS: readonly [RegExp, number][] = [
  [/Fusion/, 0x40],
  [/Ritual/, 0x80],
  [/Spirit/, 0x200],
  [/Union/, 0x400],
  [/Gemini/, 0x800],
  [/Tuner/, 0x1000],
  [/Synchro/, 0x2000],
  [/Flip/, 0x200000],
  [/Toon/, 0x400000],
  [/XYZ/i, 0x800000],
  [/Pendulum/, 0x1000000],
  [/Link/, 0x4000000],
]
/** La clase de Mágica o Trampa (`race` en YGOPRODeck) y su bit. */
const SPELL_TRAP_KIND: Record<string, number> = { 'Quick-Play': 0x10000, Continuous: 0x20000, Equip: 0x40000, Field: 0x80000, Counter: 0x100000, Ritual: 0x80 }
const stat = (value: string | null) => (value === null ? 0 : value === '?' ? -2 : Number.parseInt(value, 10) || 0)

/**
 * La fila de una carta que no está en ninguna base, con lo que la app sabe de ella (YGOPRODeck): juega sin script (sin efectos), con su tipo, Atributo, Tipo de monstruo,
 * Nivel/Rango/Link, escalas y ATK/DEF. Lo que YGOPRODeck no da queda neutro: sin arquetipo (`setcode` 0) ni flechas de Link (`def` 0); un monstruo del Extra o uno
 * Normal/de Ritual sin «Effect» en el tipo, como dice su nombre; un tipo que no se reconoce, 0.
 */
export function rowOfApiCard(code: number, name: string, card: ApiCardReference): CardRow {
  const kind = card.cardType
  const spell = /Spell/.test(kind)
  const trap = /Trap/.test(kind)
  let type = spell ? 0x2 : trap ? 0x4 : 0x1

  if (spell || trap) type |= SPELL_TRAP_KIND[card.race ?? ''] ?? 0
  else {
    for (const [word, bit] of TYPE_WORDS) if (word.test(kind)) type |= bit
    type |= /Normal/.test(kind) || /^(Fusion|Ritual) Monster$/.test(kind) ? 0x10 : 0x20
  }
  const monster = (type & 0x1) !== 0
  const link = (type & 0x4000000) !== 0
  const scale = card.scale ?? 0
  const level = (link ? (card.linkValue ?? 0) : (card.level ?? 0)) | (scale << 16) | (scale << 24)
  const bit = (list: readonly string[], value: string | null) => (value !== null && list.includes(value) ? 2 ** list.indexOf(value) : 0)

  return { id: code, alias: 0, setcode: '0', type, atk: monster ? stat(card.atk) : 0, def: monster && !link ? stat(card.def) : 0, level: monster ? level : 0, race: String(monster ? bit(RACES, card.race) : 0), attribute: monster ? bit(ATTRIBUTES, card.attribute) : 0, name }
}

/** El código que manda el servidor en `{ error }` cuando el despliegue no tiene los datos de la beta (la copia de `api/auto-data.ts`; un test los compara). */
export const DATA_UNAVAILABLE = 'unavailable'
/** Lo que el servidor explica en `{ error }`, un código (`DATA_UNAVAILABLE`): la sesión lo deja como mensaje de la falla y la portada lo traduce. */
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
      const fetchRows = async (wanted: number[]) => {
        const got = new Map((await source.cards(wanted)).map((row) => [row.id, row]))

        for (const code of wanted) rows.set(code, got.get(code) ?? null)
        keep('cards', 'all2', Object.fromEntries(rows))
      }
      const wanted = codes.filter((code) => !rows.has(code))

      tick()
      if (wanted.length > 0) await fetchRows(wanted)
      done += 1
      tick()

      // Una carta que no está en ninguna base juega con la fila que armó la app (`DeckList.rows`, sin script: sin efectos); la de la base siempre gana.
      const spare = new Map(lists.flatMap((list) => list.rows ?? []).map((row) => [row.id, row]))
      const rowOf = (code: number) => rows.get(code) ?? spare.get(code) ?? null
      const data = new Map(codes.flatMap((code) => (rowOf(code) ? [[code, cardData(rowOf(code)!)] as const] : [])))
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

      // El núcleo también lee filas de cartas que no están en los decks (sin la fila, la carta queda vacía y llega `card data not preloaded`):
      // la del `alias` de cada carta (al mirar su arquetipo lee la de su nombre: el original de un arte alternativo o de un «se trata como») y
      // las que nombran sus scripts (`listed_names`): la que cambia de nombre (`EFFECT_CHANGE_CODE`, «su nombre pasa a ser…») lee la de ése.
      // Una caché de antes de esto no las tiene: se piden igual.
      const constants = new Map(Object.values(texts).flatMap((text) => [...text.matchAll(CODE_CONSTANT)].map((match) => [match[1]!, Number(match[2])] as const)))
      const named = Object.values(texts).flatMap((text) => [...text.matchAll(LISTED_NAMES)].flatMap((match) => match[1]!.split(',').map((item) => constants.get(item.trim()) ?? Number(item))))
      const more = [...new Set([...[...data.values()].map((card) => card.alias), ...named])].filter((code) => code > 0 && !data.has(code))
      const unknown = more.filter((code) => !rows.has(code))

      if (unknown.length > 0) {
        total += 1
        tick()
        await fetchRows(unknown)
        done += 1
        tick()
      }
      for (const code of more) if (rowOf(code)) data.set(code, cardData(rowOf(code)!))

      return {
        decks: lists.map((list) => mapDeck(list, resolve, (name) => typeof texts[name] === 'string')),
        cards: [...data.values()],
        scripts: texts,
        names: Object.fromEntries([...data.keys()].flatMap((code) => (rowOf(code)?.name ? [[code, rowOf(code)!.name!]] : []))),
        texts: Object.fromEntries([...data.keys()].flatMap((code) => (rowOf(code)?.strs?.length ? [[code, rowOf(code)!.strs!]] : []))),
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
