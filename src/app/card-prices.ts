/**
 * Precios de TCGplayer de una carta, por impresión (expansión + rareza + edición).
 *
 * TCGplayer no entrega keys nuevas para su API, así que se lee TCGCSV, un espejo diario de sus datos (categoría 2 =
 * Yu-Gi-Oh!). Las impresiones de la carta salen de YGOPRODeck (nombre del set, código y rareza) y se cruzan con
 * los productos de TCGplayer por código de set + rareza. Lo usa el endpoint `api/card-prices.ts`.
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

interface YgoCardSet {
  set_name: string
  set_code: string
  set_rarity: string
}

interface Group {
  groupId: number
  name: string
  abbreviation: string
  publishedOn: string
}

interface Product {
  productId: number
  url: string
  extendedData?: Array<{ name: string; value: string }>
}

interface PriceRow {
  productId: number
  lowPrice: number | null
  marketPrice: number | null
  subTypeName: string
}

type GetJson = (url: string) => Promise<unknown>

/** Cuántas expansiones se consultan: las más nuevas en las que salió la carta (cada una son dos pedidos a TCGCSV). */
export const MAX_SETS = 3

const TCGCSV = 'https://tcgcsv.com/tcgplayer/2'
const CARD_INFO = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const USER_AGENT = 'ygo-probability-lab (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Fecha de salida del set. Unos 18 sets viejos traen en su lugar la hora del último sync (no es medianoche): esos van al final, como si no tuvieran fecha. */
const releaseDate = (group: Group) => (group.publishedOn.endsWith('T00:00:00') ? group.publishedOn : '')
const newestFirst = (a: Group, b: Group) => releaseDate(b).localeCompare(releaseDate(a))

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })

  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`)
  }

  return response.json()
}

/**
 * El set de TCGplayer de cada impresión: por nombre y, si no coincide, por el prefijo del código ("MZMI-EN083" → MZMI).
 * Devuelve los sets más nuevos primero, cada uno con las impresiones de la carta que le tocan.
 */
export function matchGroups(cardSets: YgoCardSet[], groups: Group[]): Array<{ group: Group; printings: YgoCardSet[] }> {
  const recentFirst = [...groups].sort(newestFirst)
  const found = new Map<number, { group: Group; printings: YgoCardSet[] }>()

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

const field = (product: Product, name: string) => product.extendedData?.find((entry) => entry.name === name)?.value ?? ''

/** Los precios de las impresiones de la carta dentro de un set: por código + rareza y, si la rareza se llama distinto, sólo por código. */
export function extractPrices(group: Group, printings: YgoCardSet[], products: Product[], prices: PriceRow[]): PrintingPrice[] {
  const rows: PrintingPrice[] = []

  for (const code of new Set(printings.map((printing) => printing.set_code))) {
    const rarities = new Set(printings.filter((printing) => printing.set_code === code).map((printing) => normalize(printing.set_rarity)))
    const sameCode = products.filter((product) => field(product, 'Number') === code)
    const strict = sameCode.filter((product) => rarities.has(normalize(field(product, 'Rarity'))))

    for (const product of strict.length > 0 ? strict : sameCode) {
      for (const price of prices.filter((row) => row.productId === product.productId)) {
        rows.push({
          set: group.name,
          code,
          rarity: field(product, 'Rarity'),
          edition: price.subTypeName,
          market: price.marketPrice,
          low: price.lowPrice,
          url: product.url,
        })
      }
    }
  }

  return rows
}

/** Las impresiones más nuevas de la carta (por id de YGOPRODeck) con su precio en TCGplayer. Cinco a ocho pedidos en total. */
export async function fetchCardPrices(cardId: number, get: GetJson = getJson): Promise<PrintingPrice[]> {
  const card = (await get(`${CARD_INFO}?id=${cardId}`)) as { data?: Array<{ card_sets?: YgoCardSet[] }> }
  const cardSets = card.data?.[0]?.card_sets ?? []

  if (cardSets.length === 0) {
    return []
  }

  const { results: groups } = (await get(`${TCGCSV}/groups`)) as { results: Group[] }
  const picked = matchGroups(cardSets, groups).slice(0, MAX_SETS)
  const perSet = await Promise.all(
    picked.map(async ({ group, printings }) => {
      const [products, prices] = await Promise.all([get(`${TCGCSV}/${group.groupId}/products`), get(`${TCGCSV}/${group.groupId}/prices`)])

      return extractPrices(group, printings, (products as { results: Product[] }).results, (prices as { results: PriceRow[] }).results)
    }),
  )

  return perSet.flat()
}
