import { describe, expect, it } from 'vitest'

import { MAX_SETS, extractPrices, fetchCardPrices, matchGroups } from '../app/card-prices'

const group = (groupId: number, name: string, abbreviation: string, publishedOn: string) => ({ groupId, name, abbreviation, publishedOn })
const printing = (set_name: string, set_code: string, set_rarity: string) => ({ set_name, set_code, set_rarity })
const product = (productId: number, number: string, rarity: string) => ({
  productId,
  url: `https://www.tcgplayer.com/product/${productId}`,
  extendedData: [
    { name: 'Number', value: number },
    { name: 'Rarity', value: rarity },
  ],
})
const price = (productId: number, subTypeName: string, marketPrice: number | null, lowPrice: number | null = null) => ({ productId, subTypeName, marketPrice, lowPrice })

const GROUPS = [
  group(1, 'Legend of Blue Eyes White Dragon', 'LOB', '2002-03-08T00:00:00'),
  group(2, 'Maze of Millennia', 'MZMI', '2024-01-19T00:00:00'),
  group(3, 'Legend of Blue Eyes White Dragon (25th Anniversary Edition)', 'LOB-EN', '2023-04-21T00:00:00'),
]

describe('precios de TCGplayer por impresión', () => {
  it('cruza cada impresión con su set por nombre y, si no coincide, por el prefijo del código; los más nuevos primero', () => {
    const matched = matchGroups(
      [
        printing('Legend of Blue-Eyes White Dragon', 'LOB-EN001', 'Ultra Rare'),
        printing('Un nombre distinto', 'MZMI-EN083', 'Rare'),
        printing('Set que TCGplayer no tiene', 'ZZZZ-EN001', 'Common'),
      ],
      GROUPS,
    )

    expect(matched.map((entry) => entry.group.groupId)).toEqual([2, 1])
    expect(matched[1]!.printings.map((entry) => entry.set_code)).toEqual(['LOB-EN001'])
  })

  it('un set con la hora del sync en vez de su fecha de salida va al final, no al principio', () => {
    const matched = matchGroups(
      [printing('Duelist Pack 7', 'DP07-EN001', 'Common'), printing('Maze of Millennia', 'MZMI-EN083', 'Rare')],
      [group(9, 'Duelist Pack 7', 'DP07', '2026-10-11T20:00:08.1768223Z'), GROUPS[1]!],
    )

    expect(matched.map((entry) => entry.group.groupId)).toEqual([2, 9])
  })

  it('toma la impresión por código + rareza, una fila por edición', () => {
    const rows = extractPrices(
      GROUPS[1]!,
      [printing('Maze of Millennia', 'MZMI-EN083', 'Rare')],
      [product(10, 'MZMI-EN083', 'Rare'), product(11, 'MZMI-EN083', 'Super Rare'), product(12, 'MZMI-EN084', 'Rare')],
      [price(10, '1st Edition', 0.21, 0.01), price(10, 'Unlimited', 0.12), price(11, '1st Edition', 1.5)],
    )

    expect(rows).toEqual([
      { set: 'Maze of Millennia', code: 'MZMI-EN083', rarity: 'Rare', edition: '1st Edition', market: 0.21, low: 0.01, url: 'https://www.tcgplayer.com/product/10' },
      { set: 'Maze of Millennia', code: 'MZMI-EN083', rarity: 'Rare', edition: 'Unlimited', market: 0.12, low: null, url: 'https://www.tcgplayer.com/product/10' },
    ])
  })

  it('si la rareza se llama distinto en TCGplayer, cae a todas las del mismo código', () => {
    const rows = extractPrices(GROUPS[1]!, [printing('Maze of Millennia', 'MZMI-EN083', 'Rareza rara')], [product(10, 'MZMI-EN083', 'Rare')], [price(10, 'Normal', 0.3)])

    expect(rows.map((row) => row.rarity)).toEqual(['Rare'])
  })

  it('consulta sólo los sets más nuevos: un pedido de la carta, uno de sets y dos por cada set', async () => {
    const urls: string[] = []
    const sets = Array.from({ length: 6 }, (_, index) => printing(`Set ${index}`, `S${index}-EN001`, 'Common'))
    const groups = sets.map((entry, index) => group(100 + index, entry.set_name, `S${index}`, `20${10 + index}-01-01T00:00:00`))

    const result = await fetchCardPrices(1, async (url) => {
      urls.push(url)

      if (url.includes('cardinfo')) return { data: [{ card_sets: sets }] }
      if (url.endsWith('/groups')) return { results: groups }
      if (url.endsWith('/products')) return { results: [product(1, 'S5-EN001', 'Common'), product(2, 'S4-EN001', 'Common'), product(3, 'S3-EN001', 'Common')] }

      return { results: [price(1, 'Normal', 1), price(2, 'Normal', 2), price(3, 'Normal', 3)] }
    })

    expect(urls).toHaveLength(2 + MAX_SETS * 2)
    expect(urls.filter((url) => url.endsWith('/groups'))).toHaveLength(1)
    // Sólo los tres sets más nuevos (105, 104 y 103) se consultaron.
    expect(urls.some((url) => url.includes('/105/') && url.endsWith('/prices'))).toBe(true)
    expect(urls.some((url) => url.includes('/102/'))).toBe(false)
    expect(result.length).toBeGreaterThan(0)
  })

  it('una carta sin impresiones no consulta TCGCSV', async () => {
    const urls: string[] = []

    expect(await fetchCardPrices(1, async (url) => (urls.push(url), { data: [{}] }))).toEqual([])
    expect(urls).toHaveLength(1)
  })
})
