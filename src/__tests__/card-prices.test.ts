import { describe, expect, it } from 'vitest'

import { extractPrices, fetchCardPriceSets, fetchSetPrices, filterPrintings, matchGroups, setImageUrl, type PriceRow } from '../app/card-prices'

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

  it('el buscador compara código y rareza, sin mayúsculas ni signos, con todas las palabras', () => {
    const prices = extractPrices(
      GROUPS[1]!,
      [printing('Maze of Millennia', 'MZMI-EN083', "Collector's Rare"), printing('Maze of Millennia', 'MZMI-EN084', 'Ultra Rare')],
      [row('MZMI-EN083', "Collector's Rare", '1st Edition', 5, null, 1), row('MZMI-EN084', 'Ultra Rare', '1st Edition', 2, null, 2)],
    )
    const codes = (query: string) => filterPrintings(prices, query).map((price) => price.code)

    expect(codes('')).toEqual(['MZMI-EN083', 'MZMI-EN084'])
    expect(codes('   ')).toEqual(['MZMI-EN083', 'MZMI-EN084'])
    expect(codes('en083')).toEqual(['MZMI-EN083'])
    expect(codes('MZMI-EN084')).toEqual(['MZMI-EN084'])
    expect(codes('ultra')).toEqual(['MZMI-EN084'])
    expect(codes("collector's")).toEqual(['MZMI-EN083'])
    expect(codes('mzmi ultra')).toEqual(['MZMI-EN084'])
    expect(codes('mzmi collectors')).toEqual(['MZMI-EN083'])
    expect(codes('rare')).toEqual(['MZMI-EN083', 'MZMI-EN084'])
    expect(codes('zzz')).toEqual([])
    // No se busca en el nombre del set ("Maze of Millennia") ni en la edición.
    expect(codes('maze')).toEqual([])
    expect(codes('1st')).toEqual([])
    // Una palabra no cruza del código a la rareza ("...084" + "ultra").
    expect(codes('084ultra')).toEqual([])
  })

  it('la imagen del sobre sale del prefijo del código del set', () => {
    expect(setImageUrl('JUSH-EN016')).toBe('https://images.ygoprodeck.com/images/sets/JUSH.jpg')
    expect(setImageUrl('RA05-EN091')).toBe('https://images.ygoprodeck.com/images/sets/RA05.jpg')
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

  it('pide la carta a YGOPRODeck y el índice una sola vez, y no baja ningún archivo de precios', async () => {
    const urls: string[] = []
    const sets = Array.from({ length: 6 }, (_, index) => printing(`Set ${index}`, `S${index}-EN001`, 'Common'))
    const index = { updated: '2026-10-11', groups: sets.map((entry, position) => [100 + position, entry.set_name, `S${position}`, `20${10 + position}-01-01`]) }
    const get = async (url: string) => {
      urls.push(url)

      return url.includes('cardinfo') ? { data: [{ card_sets: sets }] } : index
    }

    const first = await fetchCardPriceSets(1, get)
    await fetchCardPriceSets(2, get)

    expect(first.updated).toBe('2026-10-11')
    // Todos los sets de la carta, los más nuevos primero: el recorte de a PAGE_SIZE lo hace quien los pide.
    expect(first.sets.map((entry) => entry.group.name)).toEqual(['Set 5', 'Set 4', 'Set 3', 'Set 2', 'Set 1', 'Set 0'])
    // Primera carta: YGOPRODeck + índice. Segunda: sólo YGOPRODeck (el índice no se vuelve a pedir).
    expect(urls.filter((url) => url.endsWith('/index.json'))).toHaveLength(1)
    expect(urls).toHaveLength(3)
    expect(urls.some((url) => /\/\d+\.json$/.test(url))).toBe(false)
  })

  it('los precios de un set bajan sólo el archivo de ese set', async () => {
    const urls: string[] = []
    const set = { group: GROUPS[1]!, printings: [printing('Maze of Millennia', 'MZMI-EN083', 'Rare')] }

    const prices = await fetchSetPrices(set, async (url) => {
      urls.push(url)
      return { rows: [row('MZMI-EN083', 'Rare', '1st Edition', 0.21, 0.01, 10), row('MZMI-EN084', 'Rare', 'Normal', 9, null, 12)] }
    })

    expect(urls).toEqual(['/prices/2.json'])
    expect(prices.map((price) => [price.code, price.market])).toEqual([['MZMI-EN083', 0.21]])
  })

  it('una carta sin impresiones no tiene sets', async () => {
    const result = await fetchCardPriceSets(1, async (url) => (url.endsWith('/index.json') ? { updated: '2026-10-11', groups: [] } : { data: [{}] }))

    expect(result.sets).toEqual([])
  })
})
