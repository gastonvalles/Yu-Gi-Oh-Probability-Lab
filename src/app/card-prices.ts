/**
 * Precios de TCGplayer de una carta, por impresión (expansión + rareza + edición).
 *
 * Los precios los baja todos los días `scripts/sync-card-prices.mjs` (desde TCGCSV, un espejo de TCGplayer, que ya
 * no da keys nuevas para su API) y quedan como archivos estáticos en `public/prices/`. Acá se cruza la carta con
 * ellos: sus impresiones (set, código y rareza) salen de YGOPRODeck y se buscan, por código de set + rareza, en los
 * archivos de los sets más nuevos en los que salió.
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

export interface CardPrices {
  prices: PrintingPrice[]
  /** Día (AAAA-MM-DD) en que se bajaron los precios. */
  updated: string
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

/** Cuántas expansiones se muestran: las más nuevas en las que salió la carta (cada una es un archivo de unos pocos KB). */
export const MAX_SETS = 3

const CARD_INFO = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const PRICES_DIR = '/prices'

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
export function matchGroups(cardSets: YgoCardSet[], groups: PriceGroup[]): Array<{ group: PriceGroup; printings: YgoCardSet[] }> {
  const recentFirst = [...groups].sort(newestFirst)
  const found = new Map<number, { group: PriceGroup; printings: YgoCardSet[] }>()

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

/** Las impresiones más nuevas de la carta (por id de YGOPRODeck) con su precio en TCGplayer: un pedido a YGOPRODeck, el índice y hasta tres sets. */
export async function fetchCardPrices(cardId: number, get: GetJson = getJson): Promise<CardPrices> {
  const [card, index] = await Promise.all([get(`${CARD_INFO}?id=${cardId}`) as Promise<{ data?: Array<{ card_sets?: YgoCardSet[] }> }>, loadIndex(get)])
  const cardSets = card.data?.[0]?.card_sets ?? []
  const groups = index.groups.map(([groupId, name, abbreviation, publishedOn]) => ({ groupId, name, abbreviation, publishedOn }))
  const picked = matchGroups(cardSets, groups).slice(0, MAX_SETS)
  const perSet = await Promise.all(
    picked.map(async ({ group, printings }) => {
      const file = (await get(`${PRICES_DIR}/${group.groupId}.json`)) as { rows: PriceRow[] }

      return extractPrices(group, printings, file.rows)
    }),
  )

  return { prices: perSet.flat(), updated: index.updated }
}
