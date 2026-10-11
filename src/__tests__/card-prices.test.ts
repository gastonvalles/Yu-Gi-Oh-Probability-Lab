import { describe, expect, it } from 'vitest'

import { MAX_SETS, extractPrices, fetchCardPrices, matchGroups, type PriceRow } from '../app/card-prices'

const group = (groupId: number, name: string, abbreviation: string, publishedOn: string) => ({ groupId, name, abbreviation, publishedOn })
const printing = (set_name: string, set_code: string, set_rarity: string) => ({ set_name, set_code, set_rarity })
const row = (code: string, rarity: string, edition: string, market: number | null, low: number | null, productId: number): PriceRow => [code, rarity, edition, market, low, productId]

const GROUPS = [
  group(1, 'Legend of Blue Eyes White Dragon', 'LOB', '2002-03-08'),
  group(2, 'Maze of Millennia', 'MZMI', '2024-01-19'),
  group(3, 'Legend of Blue Eyes White Dragon (25th Anniversary Edition)', 'LOB-EN', '2023-04-21'),
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

  it('un set sin fecha va al final, no al principio', () => {
    const matched = matchGroups(
      [printing('Duelist Pack 7', 'DP07-EN001', 'Common'), printing('Maze of Millennia', 'MZMI-EN083', 'Rare')],
      [group(9, 'Duelist Pack 7', 'DP07', ''), GROUPS[1]!],
    )

    expect(matched.map((entry) => entry.group.groupId)).toEqual([2, 9])
  })

  it('toma la impresión por código + rareza, una fila por edición, con el link al producto', () => {
    const rows = extractPrices(
      GROUPS[1]!,
      [printing('Maze of Millennia', 'MZMI-EN083', 'Rare')],
      [row('MZMI-EN083', 'Rare', '1st Edition', 0.21, 0.01, 10), row('MZMI-EN083', 'Rare', 'Unlimited', 0.12, null, 10), row('MZMI-EN083', 'Super Rare', '1st Edition', 1.5, null, 11), row('MZMI-EN084', 'Rare', 'Normal', 9, null, 12)],
    )

    expect(rows).toEqual([
      { set: 'Maze of Millennia', code: 'MZMI-EN083', rarity: 'Rare', edition: '1st Edition', market: 0.21, low: 0.01, url: 'https://www.tcgplayer.com/product/10' },
      { set: 'Maze of Millennia', code: 'MZMI-EN083', rarity: 'Rare', edition: 'Unlimited', market: 0.12, low: null, url: 'https://www.tcgplayer.com/product/10' },
    ])
  })

  it('si la rareza se llama distinto en TCGplayer, cae a todas las del mismo código', () => {
    const rows = extractPrices(GROUPS[1]!, [printing('Maze of Millennia', 'MZMI-EN083', 'Rareza rara')], [row('MZMI-EN083', 'Rare', 'Normal', 0.3, null, 10)])

    expect(rows.map((entry) => entry.rarity)).toEqual(['Rare'])
  })

  it('pide la carta a YGOPRODeck, el índice una sola vez y sólo los archivos de los sets más nuevos', async () => {
    const urls: string[] = []
    const sets = Array.from({ length: 6 }, (_, index) => printing(`Set ${index}`, `S${index}-EN001`, 'Common'))
    const index = { updated: '2026-10-11', groups: sets.map((entry, position) => [100 + position, entry.set_name, `S${position}`, `20${10 + position}-01-01`]) }
    const get = async (url: string) => {
      urls.push(url)

      if (url.includes('cardinfo')) return { data: [{ card_sets: sets }] }
      if (url.endsWith('/index.json')) return index

      const code = `S${Number(url.split('/').pop()!.replace('.json', '')) - 100}-EN001`

      return { rows: [row(code, 'Common', 'Normal', 1, null, 7)] }
    }

    const first = await fetchCardPrices(1, get)
    await fetchCardPrices(2, get)

    expect(first.updated).toBe('2026-10-11')
    expect(first.prices.map((price) => price.set)).toEqual(['Set 5', 'Set 4', 'Set 3'])
    expect(first.prices).toHaveLength(MAX_SETS)
    // Primera carta: YGOPRODeck + índice + 3 sets. Segunda: YGOPRODeck + 3 sets (el índice no se vuelve a pedir).
    expect(urls.filter((url) => url.endsWith('/index.json'))).toHaveLength(1)
    expect(urls).toHaveLength(5 + 4)
    expect(urls.some((url) => url.endsWith('/102.json'))).toBe(false)
  })

  it('una carta sin impresiones no pide ningún set', async () => {
    const urls: string[] = []

    const result = await fetchCardPrices(1, async (url) => {
      urls.push(url)
      return url.endsWith('/index.json') ? { updated: '2026-10-11', groups: [] } : { data: [{}] }
    })

    expect(result.prices).toEqual([])
    expect(urls.filter((url) => /\/\d+\.json$/.test(url))).toHaveLength(0)
  })
})
