import { describe, expect, it } from 'vitest'

import { SHARDS, buildCardRows, buildCodeIndex, buildRows, carryOver, shardFile, shardOf } from '../../scripts/sync-card-prices.mjs'

/** [código del set, rareza, edición, precio de mercado, id del producto] */
type SetRow = [string, string, string, number | null, number]
/** Lo mismo, ya asignado a una carta y con el id del set al final. */
type CardRow = [string, string, string, number | null, number, number]

const product = (productId: number, number: string, rarity: string) => ({
  productId,
  extendedData: [
    { name: 'Number', value: number },
    { name: 'Rarity', value: rarity },
  ],
})
const set = (code: string, rarity: string, edition: string, market: number | null, productId: number): SetRow => [code, rarity, edition, market, productId]

describe('scripts/sync-card-prices.mjs: de TCGCSV a archivos por carta', () => {
  it('las filas de un set son sólo cartas con algún precio, sin el precio mínimo y en orden fijo', () => {
    const rows = buildRows(
      [product(2, 'MZMI-EN084', 'Rare'), product(1, 'MZMI-EN083', 'Rare'), product(3, '', 'Rare'), product(4, 'MZMI-EN085', 'Common')],
      [
        { productId: 2, marketPrice: 1.5, lowPrice: 1, subTypeName: 'Unlimited' },
        { productId: 1, marketPrice: 0.2, lowPrice: 0.1, subTypeName: '1st Edition' },
        { productId: 1, marketPrice: null, lowPrice: 0.05, subTypeName: 'Unlimited' },
        { productId: 3, marketPrice: 9, lowPrice: 9, subTypeName: 'Normal' }, // sin código de set: no es una carta
        { productId: 4, marketPrice: null, lowPrice: null, subTypeName: 'Normal' }, // sin ningún precio
        { productId: 99, marketPrice: 3, lowPrice: 3, subTypeName: 'Normal' }, // producto desconocido
      ],
    )

    expect(rows).toEqual([
      ['MZMI-EN083', 'Rare', '1st Edition', 0.2, 1],
      ['MZMI-EN083', 'Rare', 'Unlimited', null, 1],
      ['MZMI-EN084', 'Rare', 'Unlimited', 1.5, 2],
    ])
  })

  it('el índice de códigos junta las cartas que salieron con cada código y sus rarezas, sin signos ni mayúsculas', () => {
    const index = buildCodeIndex([
      { id: 1, card_sets: [{ set_code: 'LOB-EN001', set_rarity: "Collector's Rare" }, { set_code: 'LOB-EN001', set_rarity: 'Ultra Rare' }] },
      { id: 2, card_sets: [{ set_code: 'LOB-EN001', set_rarity: 'Common' }, { set_code: 'DP07-EN002', set_rarity: 'Common' }] },
      { id: 3 },
    ])

    expect([...index.get('LOB-EN001')!.keys()]).toEqual([1, 2])
    expect([...index.get('LOB-EN001')!.get(1)!]).toEqual(['collectorsrare', 'ultrarare'])
    expect([...index.get('DP07-EN002')!.get(2)!]).toEqual(['common'])
    expect(index.has('XXXX-EN000')).toBe(false)
  })

  it('cada fila va a la carta que salió con ese código, sólo con las rarezas con que salió; si ninguna coincide, con todas', () => {
    const index = buildCodeIndex([
      { id: 10, card_sets: [{ set_code: 'MZMI-EN083', set_rarity: 'Rare' }] },
      { id: 11, card_sets: [{ set_code: 'MZMI-EN084', set_rarity: 'Rareza rara' }] },
    ])
    const { byCard, matched, total } = buildCardRows(
      [
        {
          groupId: 5,
          rows: [set('MZMI-EN083', 'Rare', '1st Edition', 0.2, 1), set('MZMI-EN083', 'Super Rare', '1st Edition', 1.5, 2), set('MZMI-EN084', 'Common', 'Normal', 0.1, 3), set('ZZZZ-EN001', 'Common', 'Normal', 9, 4)],
        },
      ],
      index,
    )

    // La 10 salió como Rare: no se lleva la Super Rare. La 11 salió con una rareza que TCGplayer llama distinto: se lleva la que hay.
    expect(byCard.get(10)).toEqual([['MZMI-EN083', 'Rare', '1st Edition', 0.2, 1, 5]])
    expect(byCard.get(11)).toEqual([['MZMI-EN084', 'Common', 'Normal', 0.1, 3, 5]])
    // ZZZZ-EN001 no es de ninguna carta de YGOPRODeck: cuenta en el total pero no cruza.
    expect([matched, total]).toEqual([3, 4])
  })

  it('las filas de una carta quedan ordenadas por set, código, rareza y edición, vengan de donde vengan', () => {
    const index = buildCodeIndex([
      { id: 1, card_sets: [{ set_code: 'AAA-EN001', set_rarity: 'Common' }, { set_code: 'BBB-EN001', set_rarity: 'Common' }] },
    ])
    const { byCard } = buildCardRows(
      [
        { groupId: 9, rows: [set('AAA-EN001', 'Common', 'Unlimited', 1, 20), set('AAA-EN001', 'Common', '1st Edition', 2, 21)] },
        { groupId: 3, rows: [set('BBB-EN001', 'Common', 'Normal', 3, 22)] },
      ],
      index,
    )

    expect(byCard.get(1)!.map((row: CardRow) => [row[5], row[0], row[2]])).toEqual([
      [3, 'BBB-EN001', 'Normal'],
      [9, 'AAA-EN001', '1st Edition'],
      [9, 'AAA-EN001', 'Unlimited'],
    ])
  })

  it('un set que falló conserva sus filas de ayer, y sólo las de ese set', () => {
    const fresh = new Map<number, CardRow[]>([[1, [['AAA-EN001', 'Common', 'Normal', 1, 10, 1]]]])
    const previous = new Map<number, CardRow[]>([
      [
        1,
        [
          ['AAA-EN001', 'Common', 'Normal', 0.9, 10, 1], // set 1 anduvo hoy: vale lo nuevo
          ['BBB-EN001', 'Rare', 'Normal', 5, 11, 2], // set 2 falló: se conserva
        ],
      ],
      [2, [['CCC-EN001', 'Rare', 'Normal', 7, 12, 2]]], // una carta que hoy no tiene filas nuevas, de un set que falló
      [3, [['DDD-EN001', 'Rare', 'Normal', 8, 13, 4]]], // de un set que no falló: no se conserva
    ])

    const merged = carryOver(previous, new Set([2]), fresh)

    expect(merged.get(1)).toEqual([
      ['AAA-EN001', 'Common', 'Normal', 1, 10, 1],
      ['BBB-EN001', 'Rare', 'Normal', 5, 11, 2],
    ])
    expect(merged.get(2)).toEqual([['CCC-EN001', 'Rare', 'Normal', 7, 12, 2]])
    expect(merged.has(3)).toBe(false)
  })

  it('un archivo por carta tiene una carta por línea, en orden de id, y es JSON válido; vacío es {}', () => {
    const text = shardFile([
      [30, [['B-EN001', 'Rare', 'Normal', 2, 21, 7]]],
      [4, [['A-EN001', 'Common', '1st Edition', null, 20, 7], ['A-EN001', 'Common', 'Unlimited', 0.5, 22, 7]]],
    ])

    expect(text.split('\n')).toEqual([
      '{',
      '"4":[["A-EN001","Common","1st Edition",null,20,7],["A-EN001","Common","Unlimited",0.5,22,7]],',
      '"30":[["B-EN001","Rare","Normal",2,21,7]]',
      '}',
      '',
    ])
    expect(Object.keys(JSON.parse(text))).toEqual(['4', '30'])
    expect(shardFile([])).toBe('{}\n')
  })

  it('el archivo de una carta es su id módulo la cantidad de archivos', () => {
    expect(SHARDS).toBe(256)
    expect(shardOf(14558127)).toBe(14558127 % 256)
    expect(shardOf(256)).toBe(0)
    expect(shardOf(255)).toBe(255)
  })
})
