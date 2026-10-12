/**
 * Precios de TCGplayer de una carta, por impresión (expansión + rareza + edición).
 *
 * Los precios los baja todos los días `scripts/sync-card-prices.mjs` (desde TCGCSV, un espejo de TCGplayer, que ya
 * no da keys nuevas para su API) y quedan como archivos estáticos en `public/prices/`. Acá se cruza la carta con
 * ellos: sus impresiones (set, código y rareza) salen de YGOPRODeck y se buscan, por código de set + rareza, en el
 * archivo de cada set en el que salió. Se piden de a `PAGE_SIZE` sets, los más nuevos primero, para no cargar de más
 * en cartas con muchísimas reimpresiones.
 */

export interface PrintingPrice {
  set: string
  code: string
  rarity: string
  edition: string
  market: number | null
  low: number | null
  url: string
}

/** Los sets en los que salió la carta (más nuevos primero) y el día (AAAA-MM-DD) en que se bajaron los precios. */
export interface CardPriceSets {
  sets: SetMatch[]
  updated: string
}

/** Un set de TCGplayer con las impresiones de la carta que le tocan. */
export interface SetMatch {
  group: PriceGroup
  printings: YgoCardSet[]
}

export interface YgoCardSet {
  set_name: string
  set_code: string
  set_rarity: string
}

export interface PriceGroup {
  groupId: number
  name: string
  abbreviation: string
  /** Fecha de salida (AAAA-MM-DD); vacía en los sets de los que TCGCSV no la tiene. */
  publishedOn: string
}

/** [código del set, rareza, edición, precio de mercado, precio mínimo, id del producto en TCGplayer] */
export type PriceRow = [string, string, string, number | null, number | null, number]

interface PriceIndex {
  updated: string
  groups: Array<[number, string, string, string]>
}

type GetJson = (url: string) => Promise<unknown>

/** Cuántas expansiones se traen por vez (cada una es un archivo de unos pocos KB); "ver más" trae las siguientes. */
export const PAGE_SIZE = 3

const CARD_INFO = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const PRICES_DIR = '/prices'

/** La imagen del sobre del set en YGOPRODeck ("JUSH-EN016" → .../sets/JUSH.jpg). Algunos sets no la tienen. */
export const setImageUrl = (code: string) => `https://images.ygoprodeck.com/images/sets/${code.split('-')[0]}.jpg`

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '')
/** Los sets sin fecha van al final, como si fueran los más viejos. */
const newestFirst = (a: PriceGroup, b: PriceGroup) => b.publishedOn.localeCompare(a.publishedOn)

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`)
  }

  return response.json()
}

/**
 * El set de TCGplayer de cada impresión: por nombre y, si no coincide, por el prefijo del código ("MZMI-EN083" → MZMI).
 * Devuelve los sets más nuevos primero, cada uno con las impresiones de la carta que le tocan.
 */
export function matchGroups(cardSets: YgoCardSet[], groups: PriceGroup[]): SetMatch[] {
  const recentFirst = [...groups].sort(newestFirst)
  const found = new Map<number, SetMatch>()

  for (const printing of cardSets) {
    const [prefix = '', region = ''] = printing.set_code.split('-')
    const codes = [normalize(prefix), normalize(`${prefix}${region.slice(0, 2)}`)]
    const group =
      recentFirst.find((candidate) => normalize(candidate.name) === normalize(printing.set_name)) ??
      recentFirst.find((candidate) => codes.includes(normalize(candidate.abbreviation)))

    if (!group) {
      continue
    }

    const entry = found.get(group.groupId) ?? { group, printings: [] }

    entry.printings.push(printing)
    found.set(group.groupId, entry)
  }

  return [...found.values()].sort((a, b) => newestFirst(a.group, b.group))
}

/**
 * Las impresiones que coinciden con lo que se escribió en el buscador: cada palabra tiene que estar en el código o en
 * la rareza, sin importar mayúsculas ni signos ("enl06", "lavd enl", "starlight", "collectors").
 */
export function filterPrintings(prices: PrintingPrice[], query: string): PrintingPrice[] {
  const words = query.split(/\s+/).map(normalize).filter(Boolean)

  if (words.length === 0) {
    return prices
  }

  return prices.filter((price) => {
    // El "|" separa código y rareza: ya normalizadas no lo contienen, así que una palabra no cruza de uno al otro.
    const text = `${normalize(price.code)}|${normalize(price.rarity)}`

    return words.every((word) => text.includes(word))
  })
}

/** Los precios de las impresiones de la carta dentro de un set: por código + rareza y, si la rareza se llama distinto, sólo por código. */
export function extractPrices(group: PriceGroup, printings: YgoCardSet[], rows: PriceRow[]): PrintingPrice[] {
  const found: PrintingPrice[] = []

  for (const code of new Set(printings.map((printing) => printing.set_code))) {
    const rarities = new Set(printings.filter((printing) => printing.set_code === code).map((printing) => normalize(printing.set_rarity)))
    const sameCode = rows.filter((row) => row[0] === code)
    const strict = sameCode.filter((row) => rarities.has(normalize(row[1])))

    for (const [, rarity, edition, market, low, productId] of strict.length > 0 ? strict : sameCode) {
      found.push({ set: group.name, code, rarity, edition, market, low, url: `https://www.tcgplayer.com/product/${productId}` })
    }
  }

  return found
}

/** El índice de sets se baja una vez por sesión (por cada función de pedido). */
const indexes = new Map<GetJson, Promise<PriceIndex>>()

function loadIndex(get: GetJson): Promise<PriceIndex> {
  let index = indexes.get(get)

  if (!index) {
    index = get(`${PRICES_DIR}/index.json`) as Promise<PriceIndex>
    // Si falla, la próxima vez se vuelve a intentar.
    index.catch(() => indexes.delete(get))
    indexes.set(get, index)
  }

  return index
}

/** Los sets en los que salió la carta (por id de YGOPRODeck), más nuevos primero: un pedido a YGOPRODeck y el índice, sin ningún archivo de precios todavía. */
export async function fetchCardPriceSets(cardId: number, get: GetJson = getJson): Promise<CardPriceSets> {
  const [card, index] = await Promise.all([get(`${CARD_INFO}?id=${cardId}`) as Promise<{ data?: Array<{ card_sets?: YgoCardSet[] }> }>, loadIndex(get)])
  const cardSets = card.data?.[0]?.card_sets ?? []
  const groups = index.groups.map(([groupId, name, abbreviation, publishedOn]) => ({ groupId, name, abbreviation, publishedOn }))

  return { sets: matchGroups(cardSets, groups), updated: index.updated }
}

/** Los precios de la carta en un set: baja sólo el archivo de ese set. */
export async function fetchSetPrices({ group, printings }: SetMatch, get: GetJson = getJson): Promise<PrintingPrice[]> {
  const file = (await get(`${PRICES_DIR}/${group.groupId}.json`)) as { rows: PriceRow[] }

  return extractPrices(group, printings, file.rows)
}
