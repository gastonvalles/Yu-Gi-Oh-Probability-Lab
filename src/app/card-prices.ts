/**
 * Precios de TCGplayer de una carta, por impresión (expansión + rareza + edición).
 *
 * Los precios los baja todos los días `scripts/sync-card-prices.mjs` (desde TCGCSV, un espejo de TCGplayer, que ya
 * no da keys nuevas para su API), los cruza con las cartas de YGOPRODeck por código de set y los deja como archivos
 * estáticos en `public/prices/`, indexados por carta: el índice (con los nombres y fechas de los sets, una vez por
 * sesión) y un archivo de unos 4 KB con todas las impresiones de la carta, sea cual sea la cantidad de reimpresiones.
 * Los mismos precios vistos por expansión (para ver qué cartas trae una y a cuánto está cada una) salen de `public/prices/sets/<id>.json`.
 */

export interface PrintingPrice {
  set: string
  code: string
  rarity: string
  edition: string
  market: number | null
  url: string
  /** El producto en TCGplayer: de ahí sale la imagen de esa impresión (`printImageUrl`). */
  productId: number
  /** La expansión de esa impresión (su id en el índice): con el producto, lleva a la carta en la vista de Expansiones. */
  expansionId: number
  /** De qué arte es, si es distinto ("Extended Art", "Alternate Art"...); vacío si es el de siempre. */
  variant: string
}

export interface CardPrices {
  prices: PrintingPrice[]
  /** Día (AAAA-MM-DD) en que se bajaron los precios. */
  updated: string
}

/** [código del set, rareza, edición, precio de mercado, id del producto en TCGplayer, id del set, y sólo si es de un arte distinto, cuál] */
export type PriceRow = [string, string, string, number | null, number, number, string?]

interface PriceIndex {
  updated: string
  /** Cuántos archivos por carta hay: el de la carta es `cards/<id % shards>.json`. */
  shards: number
  /** [id del set, nombre, fecha de salida (AAAA-MM-DD, vacía si TCGCSV no la tiene), cuántas impresiones tiene, prefijo de sus códigos ("LOB" de "LOB-EN001")] */
  groups: Array<[number, string, string, number?, string?]>
}

/** Una expansión: lo que alcanza para listarlas (las cartas se piden recién al abrir una). */
export interface Expansion {
  id: number
  name: string
  /** AAAA-MM-DD; vacía si no se sabe. */
  date: string
  /** Cuántas impresiones (carta + rareza + edición) trae. */
  count: number
  /** El prefijo de sus códigos ("LOB" de "LOB-EN001"): el nombre de la imagen de su sobre. Vacío si no se sabe. */
  code: string
}

/** Una impresión de una expansión: la carta, su rareza y edición, y a cuánto está en TCGplayer. */
export interface ExpansionCard {
  cardId: number
  name: string
  code: string
  rarity: string
  edition: string
  market: number | null
  url: string
  productId: number
  /** De qué arte es, si es distinto ("Extended Art", "Alternate Art"...); vacío si es el de siempre. */
  variant: string
}

/** [código del set, rareza, edición, precio de mercado, id del producto en TCGplayer, id de la carta, nombre de la carta, y sólo si es de un arte distinto, cuál] */
type ExpansionRow = [string, string, string, number | null, number, number, string, string?]

type GetJson = (url: string) => Promise<unknown>

const PRICES_DIR = '/prices'

/** La imagen del sobre del set en YGOPRODeck ("JUSH-EN016" → .../sets/JUSH.jpg). Algunos sets no la tienen. */
export const setImageUrl = (code: string) => `https://images.ygoprodeck.com/images/sets/${code.split('-')[0]}.jpg`

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '')

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`)
  }

  return response.json()
}

/**
 * Las impresiones que coinciden con lo que se escribió en el buscador: cada palabra tiene que estar en el código, en la rareza o en el arte
 * ("Extended Art"), sin importar mayúsculas ni signos ("enl06", "lavd enl", "starlight", "collectors", "extended").
 */
export function filterPrintings(prices: PrintingPrice[], query: string): PrintingPrice[] {
  const words = query.split(/\s+/).map(normalize).filter(Boolean)

  if (words.length === 0) {
    return prices
  }

  return prices.filter((price) => {
    // El "|" separa código, rareza y arte: ya normalizadas no lo contienen, así que una palabra no cruza de uno al otro.
    const text = `${normalize(price.code)}|${normalize(price.rarity)}|${normalize(price.variant)}`

    return words.every((word) => text.includes(word))
  })
}

/** Lo ya pedido en esta sesión (por cada función de pedido): el índice y los archivos por carta no se piden dos veces. */
let requests = new WeakMap<GetJson, Map<string, Promise<unknown>>>()

/** Para los tests: olvida lo ya pedido (el índice y los archivos de la sesión). */
export function resetPriceRequestsForTests(): void {
  requests = new WeakMap()
}

function cached(get: GetJson, url: string): Promise<unknown> {
  let byUrl = requests.get(get)

  if (!byUrl) {
    byUrl = new Map()
    requests.set(get, byUrl)
  }

  let request = byUrl.get(url)

  if (!request) {
    const pending = byUrl
    request = get(url)
    // Si falla, la próxima vez se vuelve a intentar.
    request.catch(() => pending.delete(url))
    byUrl.set(url, request)
  }

  return request
}

/**
 * Las impresiones de la carta (por id de YGOPRODeck) con su precio en TCGplayer, las expansiones más nuevas primero (las
 * que no tienen fecha, al final): el índice una vez por sesión y un solo archivo con todo lo de la carta.
 */
export async function fetchCardPrices(cardId: number, get: GetJson = getJson): Promise<CardPrices> {
  const index = (await cached(get, `${PRICES_DIR}/index.json`)) as PriceIndex
  const shard = (await cached(get, `${PRICES_DIR}/cards/${cardId % index.shards}.json`)) as Record<string, PriceRow[] | undefined>
  const sets = new Map(index.groups.map(([id, name, date]) => [id, { name, date }]))
  const rows = (shard[String(cardId)] ?? []).filter((row) => sets.has(row[5]))
  const setOf = (row: PriceRow) => sets.get(row[5])!

  // Sort estable: dentro de cada set se conserva el orden del archivo (código, rareza, edición).
  const ordered = [...rows].sort((a, b) => setOf(b).date.localeCompare(setOf(a).date) || b[5] - a[5])

  return {
    prices: ordered.map((row) => ({
      set: setOf(row).name,
      code: row[0],
      rarity: row[1],
      edition: row[2],
      market: row[3],
      url: `https://www.tcgplayer.com/product/${row[4]}`,
      productId: row[4],
      expansionId: row[5],
      variant: row[6] ?? '',
    })),
    updated: index.updated,
  }
}

/**
 * Las expansiones con precios, las más nuevas primero (las que no tienen fecha, al final), y el día en que se bajaron los precios. Es el mismo índice
 * que usan los precios de cada carta: se pide una vez por sesión.
 */
export async function fetchExpansions(get: GetJson = getJson): Promise<{ expansions: Expansion[]; updated: string }> {
  const index = (await cached(get, `${PRICES_DIR}/index.json`)) as PriceIndex
  const expansions = index.groups.map(([id, name, date, count, code]) => ({ id, name, date, count: count ?? 0, code: code ?? '' }))

  // Sort estable: con la misma fecha (o sin ninguna), la de id más alto (la que se cargó después) va primero.
  expansions.sort((a, b) => (a.date === '' ? 1 : 0) - (b.date === '' ? 1 : 0) || b.date.localeCompare(a.date) || b.id - a.id)

  return { expansions, updated: index.updated }
}

/** Las cartas de una expansión en orden de código (y rareza), cada una con su precio y el link a su producto. Un solo archivo por expansión. */
export async function fetchExpansionCards(expansionId: number, get: GetJson = getJson): Promise<ExpansionCard[]> {
  const rows = (await cached(get, `${PRICES_DIR}/sets/${expansionId}.json`)) as ExpansionRow[]

  return rows.map(([code, rarity, edition, market, productId, cardId, name, variant]) => ({
    cardId,
    name,
    code,
    rarity,
    edition,
    market,
    url: `https://www.tcgplayer.com/product/${productId}`,
    productId,
    variant: variant ?? '',
  }))
}

/** Una carta que salió de buscar en Expansiones. `code` es el de la impresión que coincidió (vacío si se buscó por nombre). */
export interface CardHit {
  cardId: number
  name: string
  code: string
}

/** Un código para comparar: sin signos ni mayúsculas y con la letra O como cero (TCGplayer tiene códigos con la O de «LAVD-ENO01» donde la carta dice «LAVD-EN001»: se encuentran con cualquiera de las dos). */
const codeKey = (code: string) => normalize(code).replace(/o/g, '0')

/** Cuántas expansiones se miran como máximo para un código: un prefijo repetido (varias ediciones del mismo set) no dispara decenas de pedidos. */
const MAX_CODE_SETS = 4

/**
 * Las cartas cuyo código de impresión empieza con lo escrito ("LAVD-EN001", "lobeen00"), sin importar mayúsculas ni signos: el prefijo ("LAVD") dice en qué
 * expansiones mirar, y de cada una sale el archivo que la pantalla ya pide al abrirla. Una por carta, con el primer código que coincide, en el orden del archivo.
 * Escribir sólo el prefijo no da nada (eso ya lo encuentra la lista de expansiones).
 */
export async function findCardsByCode(expansions: Expansion[], query: string, get: GetJson = getJson): Promise<CardHit[]> {
  const typed = codeKey(query)
  const sets = expansions.filter((expansion) => expansion.code && typed.length > codeKey(expansion.code).length && typed.startsWith(codeKey(expansion.code))).slice(0, MAX_CODE_SETS)
  const hits = new Map<number, CardHit>()

  for (const cards of await Promise.all(sets.map((set) => fetchExpansionCards(set.id, get)))) {
    for (const card of cards) {
      if (!hits.has(card.cardId) && codeKey(card.code).startsWith(typed)) {
        hits.set(card.cardId, { cardId: card.cardId, name: card.name, code: card.code })
      }
    }
  }

  return [...hits.values()]
}

/**
 * La imagen de una impresión: la del producto en TCGplayer, que es el escaneo de esa carta tal cual salió (las overframe, las de arte extendido y las
 * alternativas se ven distintas; YGOPRODeck sólo tiene el arte de siempre). 200 px de ancho para las grillas, 400 para la carta grande y `in_1000x1000` (la carta entera a ~1000 px de alto, ~200 KB)
 * para la carta en pantalla completa, donde los 400 se ven borrosos.
 */
export const printImageUrl = (productId: number, size: '200w' | '400w' | 'in_1000x1000' = '200w') => `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_${size}.jpg`

/** Link a una impresión en la vista de Expansiones: `#expansions?set=<expansión>&print=<producto>` abre esa expansión con la carta iluminada. */
export const buildExpansionsHash = ({ expansion, print }: { expansion: number; print: number }) => `#expansions?set=${expansion}&print=${print}`

/** Lo inverso: de qué expansión y qué impresión habla el hash (nada si no es de Expansiones o no trae números válidos). */
export function readExpansionsHash(hash: string): { expansion: number | null; print: number | null } {
  const [step, query = ''] = hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  const id = (name: string) => {
    const value = Number(params.get(name))

    return Number.isInteger(value) && value > 0 ? value : null
  }

  return step === 'expansions' ? { expansion: id('set'), print: id('print') } : { expansion: null, print: null }
}

/** De la más común a la más rara, como se las suele ordenar; las que no están acá (cosas nuevas) van al final, por nombre. */
const RARITY_ORDER = [
  'Common',
  'Rare',
  'Super Rare',
  'Ultra Rare',
  'Ultimate Rare',
  'Secret Rare',
  'Platinum Secret Rare',
  'Prismatic Secret Rare',
  'Gold Secret Rare',
  'Quarter Century Secret Rare',
  'Starlight Rare',
  "Collector's Rare",
  'Ghost Rare',
  'Ghost/Gold Rare',
  'Gold Rare',
  'Premium Gold Rare',
  'Platinum Rare',
  'Mosaic Rare',
  'Shatterfoil Rare',
  'Starfoil Rare',
  'Parallel Rare',
  'Grand Master Rare',
  'Promo',
]

const rarityRank = (rarity: string) => {
  const rank = RARITY_ORDER.indexOf(rarity)

  return rank === -1 ? RARITY_ORDER.length : rank
}

export const compareRarities = (a: string, b: string) => rarityRank(a) - rarityRank(b) || a.localeCompare(b)

/** El arte chico de una carta por su id (el del arte original: el id de YGOPRODeck de la carta es el de su imagen). */
export const cardSmallImageUrl = (cardId: number) => `https://images.ygoprodeck.com/images/cards_small/${cardId}.jpg`
