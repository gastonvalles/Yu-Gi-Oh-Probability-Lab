import { describe, expect, it } from 'vitest'

import { cardSmallImageUrl, printImageUrl, fetchCardPrices, fetchExpansionCards, fetchExpansions, filterPrintings, setImageUrl, type PrintingPrice, type PriceRow } from '../app/card-prices'

const row = (code: string, rarity: string, edition: string, market: number | null, productId: number, groupId: number, variant?: string): PriceRow => (variant ? [code, rarity, edition, market, productId, groupId, variant] : [code, rarity, edition, market, productId, groupId])

// Tres sets: el 2 es el más nuevo, el 1 el más viejo y el 3 no tiene fecha (va al final).
const GROUPS: Array<[number, string, string]> = [
  [1, 'Legend of Blue Eyes White Dragon', '2002-03-08'],
  [2, 'Maze of Millennia', '2024-01-19'],
  [3, 'Duelist Pack 7', ''],
]

/** Un `get` falso que sirve el índice y los archivos por carta (con 4 archivos), y anota qué se pidió. */
function server(cards: Record<number, PriceRow[]>) {
  const urls: string[] = []
  const get = async (url: string) => {
    urls.push(url)

    if (url.endsWith('/index.json')) return { updated: '2026-10-11', shards: 4, groups: GROUPS }

    const shard = Number(url.split('/').pop()!.replace('.json', ''))

    return Object.fromEntries(Object.entries(cards).filter(([id]) => Number(id) % 4 === shard))
  }

  return { urls, get }
}

describe('precios de TCGplayer por impresión', () => {
  it('trae todas las impresiones de la carta con el nombre de su set, las expansiones más nuevas primero y las sin fecha al final', async () => {
    const { get } = server({
      7: [
        row('LOB-EN001', 'Ultra Rare', 'Unlimited', 90, 11, 1),
        row('DP07-EN001', 'Common', 'Normal', 0.5, 13, 3),
        row('MZMI-EN083', 'Rare', '1st Edition', 0.21, 12, 2),
        row('MZMI-EN083', 'Rare', 'Unlimited', 0.12, 14, 2),
      ],
    })

    const { prices, updated } = await fetchCardPrices(7, get)

    expect(updated).toBe('2026-10-11')
    expect(prices.map((price) => [price.set, price.code, price.edition])).toEqual([
      ['Maze of Millennia', 'MZMI-EN083', '1st Edition'],
      ['Maze of Millennia', 'MZMI-EN083', 'Unlimited'],
      ['Legend of Blue Eyes White Dragon', 'LOB-EN001', 'Unlimited'],
      ['Duelist Pack 7', 'DP07-EN001', 'Normal'],
    ])
    expect(prices[0]).toEqual({ set: 'Maze of Millennia', code: 'MZMI-EN083', rarity: 'Rare', edition: '1st Edition', market: 0.21, url: 'https://www.tcgplayer.com/product/12', productId: 12, variant: '' })
  })

  it('pide el índice y un solo archivo, el de la carta, y no los repite en la sesión', async () => {
    const { urls, get } = server({ 7: [row('LOB-EN001', 'Rare', 'Normal', 1, 11, 1)], 11: [row('LOB-EN002', 'Rare', 'Normal', 2, 12, 1)], 8: [row('LOB-EN003', 'Rare', 'Normal', 3, 13, 1)] })

    await fetchCardPrices(7, get)
    await fetchCardPrices(11, get) // el mismo archivo (7 % 4 = 11 % 4): no se vuelve a pedir
    await fetchCardPrices(8, get) // otro archivo

    expect(urls).toEqual(['/prices/index.json', '/prices/cards/3.json', '/prices/cards/0.json'])
  })

  it('una carta sin precios devuelve una lista vacía, y un set que el índice no conoce se ignora', async () => {
    const { get } = server({ 7: [row('XXXX-EN001', 'Rare', 'Normal', 1, 11, 99), row('LOB-EN001', 'Rare', 'Normal', 1, 12, 1)] })

    expect((await fetchCardPrices(5, get)).prices).toEqual([])
    expect((await fetchCardPrices(7, get)).prices.map((price) => price.code)).toEqual(['LOB-EN001'])
  })

  it('si un pedido falla, el siguiente intento lo vuelve a pedir', async () => {
    let fail = true
    const urls: string[] = []
    const get = async (url: string) => {
      urls.push(url)

      if (fail) throw new Error('sin red')

      return url.endsWith('/index.json') ? { updated: '2026-10-11', shards: 4, groups: GROUPS } : {}
    }

    await expect(fetchCardPrices(7, get)).rejects.toThrow('sin red')

    fail = false

    expect((await fetchCardPrices(7, get)).prices).toEqual([])
    expect(urls.filter((url) => url.endsWith('/index.json'))).toHaveLength(2)
  })

  it('el buscador compara código y rareza, sin mayúsculas ni signos, con todas las palabras', () => {
    const prices: PrintingPrice[] = [
      { set: 'Maze of Millennia', code: 'MZMI-EN083', rarity: "Collector's Rare", edition: '1st Edition', market: 5, url: 'u1', productId: 1, variant: '' },
      { set: 'Maze of Millennia', code: 'MZMI-EN084', rarity: 'Ultra Rare', edition: '1st Edition', market: 2, url: 'u2', productId: 2, variant: 'Extended Art' },
    ]
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
    // Sí en el arte ("Extended Art"): es lo que distingue una impresión de otra de la misma rareza.
    expect(codes('extended')).toEqual(['MZMI-EN084'])
    expect(codes('ultra extended')).toEqual(['MZMI-EN084'])
    expect(codes('alternate')).toEqual([])
    expect(codes('maze')).toEqual([])
    expect(codes('1st')).toEqual([])
    // Una palabra no cruza del código a la rareza ("...084" + "ultra").
    expect(codes('084ultra')).toEqual([])
  })

  it('la imagen del sobre sale del prefijo del código del set', () => {
    expect(setImageUrl('JUSH-EN016')).toBe('https://images.ygoprodeck.com/images/sets/JUSH.jpg')
    expect(setImageUrl('RA05-EN091')).toBe('https://images.ygoprodeck.com/images/sets/RA05.jpg')
  })
})

describe('expansiones', () => {
  const groups = [
    [1, 'Legend of Blue Eyes White Dragon', '2002-03-08', 3],
    [2, 'Maze of Millennia', '2024-01-19', 4],
    [3, 'Duelist Pack 7', '', 2],
    [4, 'Otro de 2024', '2024-01-19', 5, 'OTRO'],
    [5, 'Sin cantidad', '2010-01-01'],
  ]

  function sets() {
    const urls: string[] = []
    const get = async (url: string) => {
      urls.push(url)

      if (url.endsWith('/index.json')) return { updated: '2026-10-11', shards: 4, groups }

      return [
        ['MAZE-EN001', 'Rare', 'Unlimited', 0.5, 21, 100, 'Mulcharmy Purulia'],
        ['MAZE-EN002', 'Common', '1st Edition', null, 22, 101, 'Ash Blossom & Joyous Spring'],
      ]
    }

    return { urls, get }
  }

  it('las expansiones salen con las más nuevas primero (a igual fecha, la de id más alto) y las sin fecha al final', async () => {
    const { get } = sets()
    const { expansions, updated } = await fetchExpansions(get)

    expect(updated).toBe('2026-10-11')
    expect(expansions.map((expansion) => expansion.id)).toEqual([4, 2, 5, 1, 3])
    expect(expansions[0]).toEqual({ id: 4, name: 'Otro de 2024', date: '2024-01-19', count: 5, code: 'OTRO' })
    // Un índice sin la cantidad (de antes de que existiera) no rompe: cuenta cero.
    expect(expansions.find((expansion) => expansion.id === 5)).toMatchObject({ count: 0, code: '' })
  })

  it('las cartas de una expansión salen de su archivo, con el link al producto, y se piden una sola vez', async () => {
    const { urls, get } = sets()
    const cards = await fetchExpansionCards(2, get)

    expect(urls).toEqual(['/prices/sets/2.json'])
    expect(cards).toEqual([
      { cardId: 100, name: 'Mulcharmy Purulia', code: 'MAZE-EN001', rarity: 'Rare', edition: 'Unlimited', market: 0.5, url: 'https://www.tcgplayer.com/product/21', productId: 21, variant: '' },
      { cardId: 101, name: 'Ash Blossom & Joyous Spring', code: 'MAZE-EN002', rarity: 'Common', edition: '1st Edition', market: null, url: 'https://www.tcgplayer.com/product/22', productId: 22, variant: '' },
    ])

    await fetchExpansionCards(2, get)
    await fetchExpansions(get)
    await fetchExpansions(get)
    expect(urls).toEqual(['/prices/sets/2.json', '/prices/index.json'])
  })

  it('el arte chico de una carta sale de su id', () => {
    expect(cardSmallImageUrl(89631139)).toBe('https://images.ygoprodeck.com/images/cards_small/89631139.jpg')
  })
})

describe('impresiones con arte distinto (overframe, extended, alternativas)', () => {
  it('cada impresión trae su producto (de ahí sale su imagen) y de qué arte es, vacío si es el de siempre', async () => {
    const { get } = server({
      7: [row('MZMI-EN083', 'Ultra Rare', '1st Edition', 7.1, 705, 2), row('MZMI-EN083', 'Ultra Rare', '1st Edition', 153.4, 706, 2, 'Extended Art')],
    })
    const { prices } = await fetchCardPrices(7, get)

    expect(prices.map((price) => [price.productId, price.variant])).toEqual([[705, ''], [706, 'Extended Art']])
  })

  it('las cartas de una expansión también traen su producto y su arte', async () => {
    const get = async (url: string) =>
      url.endsWith('/index.json')
        ? { updated: '2026-10-11', shards: 4, groups: [[2, 'Maze of Millennia', '2024-01-19', 2, 'MAZE']] }
        : [['MAZE-EN003', 'Ultra Rare', '1st Edition', 153.4, 706, 41350417, 'Dark Magical Curtain', 'Extended Art'], ['MAZE-EN003', 'Ultra Rare', '1st Edition', 7.1, 705, 41350417, 'Dark Magical Curtain']]

    const cards = await fetchExpansionCards(2, get)

    expect(cards.map((card) => [card.productId, card.variant])).toEqual([[706, 'Extended Art'], [705, '']])
  })

  it('la imagen de una impresión es la de su producto en TCGplayer, de 200 o de 400 px de ancho', () => {
    expect(printImageUrl(714706)).toBe('https://tcgplayer-cdn.tcgplayer.com/product/714706_200w.jpg')
    expect(printImageUrl(714706, '400w')).toBe('https://tcgplayer-cdn.tcgplayer.com/product/714706_400w.jpg')
  })
})
