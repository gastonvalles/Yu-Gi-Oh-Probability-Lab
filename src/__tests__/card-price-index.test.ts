import { describe, expect, it } from 'vitest'

import { SHARDS, buildCardRows, buildCodeIndex, buildRows, carryOver, setCodeOf, setFile, shardFile, shardOf, variantOf } from '../../scripts/sync-card-prices.mjs'

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

describe('scripts/sync-card-prices.mjs: los archivos por set', () => {
  it('las filas de cada set son las mismas impresiones, con la carta que le tocó a cada una, ordenadas por código, rareza y edición', () => {
    const index = buildCodeIndex([
      { id: 10, card_sets: [{ set_code: 'MZMI-EN083', set_rarity: 'Rare' }] },
      { id: 11, card_sets: [{ set_code: 'MZMI-EN084', set_rarity: 'Common' }] },
    ])
    const { bySet } = buildCardRows(
      [
        { groupId: 5, rows: [set('MZMI-EN084', 'Common', 'Unlimited', 0.1, 3), set('MZMI-EN083', 'Rare', 'Unlimited', 0.5, 2), set('MZMI-EN083', 'Rare', '1st Edition', 0.2, 1), set('ZZZZ-EN001', 'Common', 'Normal', 9, 4)] },
        { groupId: 6, rows: [set('MZMI-EN083', 'Rare', 'Normal', 3, 9)] },
      ],
      index,
    )

    // La de código desconocido no está en ningún set; las demás van a su set con el id de la carta al final.
    expect(bySet.get(5)).toEqual([
      ['MZMI-EN083', 'Rare', '1st Edition', 0.2, 1, 10],
      ['MZMI-EN083', 'Rare', 'Unlimited', 0.5, 2, 10],
      ['MZMI-EN084', 'Common', 'Unlimited', 0.1, 3, 11],
    ])
    expect(bySet.get(6)).toEqual([['MZMI-EN083', 'Rare', 'Normal', 3, 9, 10]])
  })

  it('un código que salió con varias cartas aparece una vez por carta', () => {
    const index = buildCodeIndex([
      { id: 1, card_sets: [{ set_code: 'AAA-EN001', set_rarity: 'Common' }] },
      { id: 2, card_sets: [{ set_code: 'AAA-EN001', set_rarity: 'Common' }] },
    ])
    const { bySet } = buildCardRows([{ groupId: 1, rows: [set('AAA-EN001', 'Common', 'Normal', 1, 7)] }], index)

    expect(bySet.get(1)!.map((row: CardRow) => row[5])).toEqual([1, 2])
  })

  it('el archivo de un set es un arreglo con una impresión por línea y el nombre de la carta al final; vacío es []', () => {
    const names = new Map([[10, 'Mulcharmy Purulia'], [11, 'Ash Blossom']])
    const text = setFile([['A-EN001', 'Rare', '1st Edition', 0.2, 1, 10], ['A-EN002', 'Common', 'Unlimited', null, 2, 11], ['A-EN003', 'Common', 'Unlimited', 1, 3, 99]], names)

    expect(text.split('\n')).toEqual([
      '[',
      '["A-EN001","Rare","1st Edition",0.2,1,10,"Mulcharmy Purulia"],',
      '["A-EN002","Common","Unlimited",null,2,11,"Ash Blossom"],',
      '["A-EN003","Common","Unlimited",1,3,99,""]',
      ']',
      '',
    ])
    expect(JSON.parse(text)).toHaveLength(3)
    expect(setFile([], names)).toBe('[]\n')
  })
})

describe('scripts/sync-card-prices.mjs: el prefijo de los códigos de un set', () => {
  it('es el más común entre las filas (el nombre de la imagen del sobre), y el primero si empatan', () => {
    expect(setCodeOf([['LOB-EN001'], ['LOB-EN002'], ['LOB-EN003']])).toBe('LOB')
    expect(setCodeOf([['CT13-EN008'], ['LOB-EN001'], ['LOB-EN002']])).toBe('LOB')
    expect(setCodeOf([['AAA-EN001'], ['BBB-EN001']])).toBe('AAA')
    expect(setCodeOf([['RA05-EN001', 'Rare']])).toBe('RA05')
    expect(setCodeOf([])).toBe('')
  })
})

describe('scripts/sync-card-prices.mjs: de qué arte es cada impresión', () => {
  it('el arte sale del nombre del producto: lo de entre paréntesis que no es la rareza, su sigla ni el código del set', () => {
    expect(variantOf('Dark Magical Curtain (Starlight Rare) (Extended Art)', 'Starlight Rare')).toBe('Extended Art')
    expect(variantOf('Dark Magical Curtain (Extended Art)', 'Ultra Rare')).toBe('Extended Art')
    expect(variantOf('Polymerization (B) (HERO Art) (Platinum Secret Rare)', 'Platinum Secret Rare')).toBe('HERO Art')
    expect(variantOf('Reinforcement of the Army (Alternate Art) (Starlight Rare)', 'Starlight Rare')).toBe('Alternate Art')
    expect(variantOf('Blue-Eyes White Dragon (SDWD-EN001) (Unlimited Misprint)', 'Ultra Rare')).toBe('Unlimited Misprint')
    expect(variantOf('Dark Magician (New Art) (Quarter Century Secret Rare)', 'Quarter Century Secret Rare')).toBe('New Art')
  })

  it('sin arte distinto es vacío: sin paréntesis, con la rareza (entera, abreviada o en sigla) o sin datos', () => {
    expect(variantOf('Dark Magical Curtain', 'Ultra Rare')).toBe('')
    expect(variantOf('Dark Magical Curtain (GMR)', 'Grand Master Rare')).toBe('')
    expect(variantOf('Dark Time Wizard (Secret Rare)', 'Secret Rare')).toBe('')
    expect(variantOf('Dark Magician (Secret)', 'Secret Rare')).toBe('')
    expect(variantOf('Sage with Eyes of Blue (UTR)', 'Ultimate Rare')).toBe('')
    expect(variantOf(undefined, undefined)).toBe('')
    expect(variantOf('', 'Rare')).toBe('')
  })

  it('con más de un arte se unen; y las filas por set y por carta llevan el arte al final sólo si lo hay', () => {
    expect(variantOf('Card (Alternate Art) (Overframe) (Rare)', 'Rare')).toBe('Alternate Art · Overframe')

    const rows = buildRows(
      [
        { productId: 1, name: 'Dark Magical Curtain (Extended Art)', extendedData: [{ name: 'Number', value: 'MAMO-EN003' }, { name: 'Rarity', value: 'Ultra Rare' }] },
        { productId: 2, name: 'Dark Magical Curtain', extendedData: [{ name: 'Number', value: 'MAMO-EN003' }, { name: 'Rarity', value: 'Ultra Rare' }] },
      ],
      [
        { productId: 1, marketPrice: 153.4, lowPrice: 100, subTypeName: '1st Edition' },
        { productId: 2, marketPrice: 7.1, lowPrice: 6, subTypeName: '1st Edition' },
      ],
    )

    expect(rows).toEqual([
      ['MAMO-EN003', 'Ultra Rare', '1st Edition', 153.4, 1, 'Extended Art'],
      ['MAMO-EN003', 'Ultra Rare', '1st Edition', 7.1, 2],
    ])

    const { byCard, bySet } = buildCardRows([{ groupId: 9, rows }], buildCodeIndex([{ id: 41350417, card_sets: [{ set_code: 'MAMO-EN003', set_rarity: 'Ultra Rare' }] }]))

    // Con todo igual, por producto (el 1, el de arte extendido, antes que el 2).
    expect(byCard.get(41350417)).toEqual([
      ['MAMO-EN003', 'Ultra Rare', '1st Edition', 153.4, 1, 9, 'Extended Art'],
      ['MAMO-EN003', 'Ultra Rare', '1st Edition', 7.1, 2, 9],
    ])
    expect(bySet.get(9)).toEqual([
      ['MAMO-EN003', 'Ultra Rare', '1st Edition', 153.4, 1, 41350417, 'Extended Art'],
      ['MAMO-EN003', 'Ultra Rare', '1st Edition', 7.1, 2, 41350417],
    ])
    expect(JSON.parse(setFile(bySet.get(9), new Map([[41350417, 'Dark Magical Curtain']])))).toEqual([
      ['MAMO-EN003', 'Ultra Rare', '1st Edition', 153.4, 1, 41350417, 'Dark Magical Curtain', 'Extended Art'],
      ['MAMO-EN003', 'Ultra Rare', '1st Edition', 7.1, 2, 41350417, 'Dark Magical Curtain'],
    ])
  })
})
