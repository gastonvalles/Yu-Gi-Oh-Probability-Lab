import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applySupplements,
  banlistsFile,
  buildBanlists,
  buildCardLookup,
  buildNameLookup,
  carriedLists,
  fetchNewLists,
  knownDates,
  listDate,
  listsNeedingDay,
  parseLflist,
  regionOf,
  resolveWikiList,
  upcomingWikiTitles,
  wikiListCards,
  wikiListDate,
  wikiTitles,
  withExactDates,
} from '../../scripts/sync-banlists.mjs'

const SAMPLE = `#[2026.10][2026.9 TCG]
#[2026.5 TCG][2013.3.1]
!2026.10
#forbidden
20292186 0 --アーティファクト－デスサイズ
#limit
4280258 1 --Apollousa
#semi limit
62320425 2 --Agido
!2026.9 TCG
#forbidden
4280258 0 --Apollousa, Bow of the Goddess
4280259 0 --Apollousa, Bow of the Goddess
#limit
#semi limit
99999999 2 --Carta desconocida

!2013.10.11 TCG
#forbidden
62320425 0 --Agido
!2013.3.1
#forbidden
20292186 0 --Death Scythe
`

describe('scripts/sync-banlists.mjs: de lflist.conf a las banlists', () => {
  it('la fecha de una lista sale de su encabezado, con el mes siempre de dos dígitos y el día sólo si lo trae', () => {
    expect(listDate('2026.9 TCG')).toBe('2026-09')
    expect(listDate('2026.10')).toBe('2026-10')
    expect(listDate('2013.10.11 TCG')).toBe('2013-10-11')
    expect(listDate('2013.3.1')).toBe('2013-03-01')
    expect(listDate('Goat Format')).toBeNull()
    expect(listDate('')).toBeNull()
  })

  it('es del TCG si el encabezado lo dice o es una de las cuatro primeras (sin etiqueta); si no, del OCG', () => {
    expect(regionOf('2026.9 TCG')).toBe('tcg')
    expect(regionOf('2014.1.1 TCG')).toBe('tcg')
    expect(regionOf('2011.9.1')).toBe('tcg')
    expect(regionOf('2013.3.1')).toBe('tcg')
    expect(regionOf('2026.10')).toBe('ocg')
    expect(regionOf('2013.9')).toBe('ocg')
  })

  it('lee cada lista con sus prohibidas (0), limitadas (1) y semi-limitadas (2), ignorando comentarios y líneas en blanco', () => {
    const lists = parseLflist(SAMPLE)

    expect(lists.map((list) => [list.header, list.region, list.date])).toEqual([
      ['2026.10', 'ocg', '2026-10'],
      ['2026.9 TCG', 'tcg', '2026-09'],
      ['2013.10.11 TCG', 'tcg', '2013-10-11'],
      ['2013.3.1', 'tcg', '2013-03-01'],
    ])
    expect(lists[0]).toMatchObject({ forbidden: [20292186], limited: [4280258], semiLimited: [62320425] })
    expect(lists[1]).toMatchObject({ forbidden: [4280258, 4280259], limited: [], semiLimited: [99999999] })
    expect(parseLflist('')).toEqual([])
    // Un encabezado que no es una fecha (un formato como Goat) no abre una lista: sus cartas no se mezclan en la anterior.
    expect(parseLflist('!2026.9 TCG\n1 0 --A\n!Goat\n2 0 --B\n').map((list) => list.forbidden)).toEqual([[1]])
  })

  it('el catálogo lleva de cada código de imagen (el de la carta y los de sus artes alternativos) a la carta', () => {
    const lookup = buildCardLookup([
      { id: 4280258, name: 'Apollousa, Bow of the Goddess', card_images: [{ id: 4280258 }, { id: 4280259 }] },
      { id: 20292186, name: 'Artifact Scythe' },
    ])

    expect(lookup.get(4280259)).toEqual({ id: 4280258, name: 'Apollousa, Bow of the Goddess' })
    expect(lookup.get(4280258)).toEqual({ id: 4280258, name: 'Apollousa, Bow of the Goddess' })
    expect(lookup.get(20292186)).toEqual({ id: 20292186, name: 'Artifact Scythe' })
    expect(lookup.has(1)).toBe(false)
  })

  it('las listas quedan con cada carta una vez (aunque tenga dos códigos), por id, y las más viejas primero en cada región; lo desconocido se descarta', () => {
    const lookup = buildCardLookup([
      { id: 4280258, name: 'Apollousa, Bow of the Goddess', card_images: [{ id: 4280258 }, { id: 4280259 }] },
      { id: 20292186, name: 'Artifact Scythe' },
      { id: 62320425, name: 'Agido the Ancient Sentry' },
    ])
    const { lists, names, unknown } = buildBanlists(parseLflist(SAMPLE), lookup)

    expect(lists.map((list: { region: string; date: string }) => [list.region, list.date])).toEqual([
      ['ocg', '2026-10'],
      ['tcg', '2013-03-01'],
      ['tcg', '2013-10-11'],
      ['tcg', '2026-09'],
    ])
    expect(lists[3]).toMatchObject({ forbidden: [4280258], semiLimited: [] })
    expect([...unknown]).toEqual([99999999])
    expect([...names]).toEqual([
      [4280258, 'Apollousa, Bow of the Goddess'],
      [20292186, 'Artifact Scythe'],
      [62320425, 'Agido the Ancient Sentry'],
    ])
  })

  it('Yugipedia llama a la página de cada lista por mes y año, con la región o sin ella', () => {
    expect(wikiTitles('tcg', '2026-09')).toEqual(['September 2026 Lists (TCG)', 'September 2026 Lists'])
    expect(wikiTitles('ocg', '2013-03-01')).toEqual(['March 2013 Lists (OCG)', 'March 2013 Lists'])
  })

  it('el día sale de la plantilla de la página (a veces con un punto al final) y tiene que decir de qué región es', () => {
    const page = (start: string, medium: string) => `These are the '''lists'''.\n\n{{Limitation list\n| start_date   = ${start}\n| end_date     = May 18, 2026\n| medium       = ${medium}\n| prev         = X\n| forbidden    = \nAbyss Dweller`

    expect(wikiListDate(page('September 21, 2026', 'TCG'))).toEqual({ region: 'tcg', date: '2026-09-21' })
    expect(wikiListDate(page('February 7, 2022.', 'TCG'))).toEqual({ region: 'tcg', date: '2022-02-07' })
    expect(wikiListDate(page('October 1, 2026', 'OCG'))).toEqual({ region: 'ocg', date: '2026-10-01' })
    // Sin plantilla (una página de desambiguación), sin región conocida o sin fecha: no es una lista.
    expect(wikiListDate('Esta página lleva a: [[X]]')).toBeNull()
    expect(wikiListDate(page('September 21, 2026', 'Anime'))).toBeNull()
    expect(wikiListDate(page('Septembre', 'TCG'))).toBeNull()
    expect(wikiListDate('')).toBeNull()
  })

  it('se reusan los días que el archivo ya tiene y sólo se piden los de las listas que sólo traen el mes', () => {
    const file = JSON.stringify({
      lists: [
        { region: 'tcg', date: '2026-05-18' },
        { region: 'ocg', date: '2026-07' },
      ],
    })
    const known = knownDates(file)

    expect([...known]).toEqual([['tcg|2026-05', '2026-05-18']])
    expect(knownDates('')).toEqual(new Map())
    expect(knownDates('no es json')).toEqual(new Map())

    const lists = parseLflist(SAMPLE)

    // La 2026.10 del OCG y la 2026.9 del TCG sólo traen el mes; las 2013 ya traen el día.
    expect(listsNeedingDay(lists, new Map()).map((list: { header: string }) => list.header)).toEqual(['2026.10', '2026.9 TCG'])
    expect(listsNeedingDay(lists, new Map([['tcg|2026-09', '2026-09-21']])).map((list: { header: string }) => list.header)).toEqual(['2026.10'])
  })

  it('con el día de Yugipedia la lista cambia de fecha (y se ordena por ella); la que no lo tiene queda con el mes', () => {
    const lookup = buildCardLookup([{ id: 20292186, name: 'Artifact Scythe' }])
    const exact = new Map([['tcg|2026-09', '2026-09-21']])
    const { lists } = buildBanlists(withExactDates(parseLflist(SAMPLE), exact), lookup)

    expect(lists.map((list: { region: string; date: string }) => [list.region, list.date])).toEqual([
      ['ocg', '2026-10'],
      ['tcg', '2013-03-01'],
      ['tcg', '2013-10-11'],
      ['tcg', '2026-09-21'],
    ])
  })

  it('el archivo trae una carta por línea y una lista por línea, y es JSON válido', () => {
    const text = banlistsFile(
      {
        lists: [{ region: 'tcg', date: '2026-09', forbidden: [2, 5], limited: [3], semiLimited: [] }],
        names: new Map([[2, 'Dos'], [3, 'Tres "con comillas"'], [5, 'Cinco']]),
      },
      '2026-10-13',
    )

    expect(text.split('\n')).toEqual([
      '{',
      '"fetchedAt":"2026-10-13",',
      '"cards":{',
      '"2":"Dos",',
      '"3":"Tres \\"con comillas\\"",',
      '"5":"Cinco"',
      '},',
      '"lists":[',
      '{"region":"tcg","date":"2026-09","forbidden":[2,5],"limited":[3],"semiLimited":[]}',
      ']',
      '}',
      '',
    ])
    expect(JSON.parse(text).cards['3']).toBe('Tres "con comillas"')
  })
})

// Una página de Yugipedia como la de octubre de 2026: incompleta, con anotaciones tras // y nombres con comillas y ☆.
const WIKI_PAGE = (head = '{{Incomplete}}\n\n', tail = '| no_longer_on_list = \n}}\n\n== References ==\n<references />') =>
  head +
  "These are the '''October 2026 Lists'''.<ref>{{cite web | url = https://x.test | title = Forbidden & Limited | date = October 16, 2026}}</ref>\n\n" +
  '{{Limitation list\n| start_date        = October 19, 2026\n| end_date          = \n| medium            = TCG\n| prev              = September 2026 Lists (TCG)\n| next              =  \n' +
  '| forbidden         = \nApollousa, Bow of the Goddess\nCalled by the Grave // prev::Limited\nMaliss P Dormouse // force-smw\n\n' +
  '| limited           = \n"A Case for K9"\nCupsy☆Yummy\nPerfectron Hydradrive Dragon // unreleased::true; prev::Not yet released\n' +
  '| semi_limited      = \nBranded in High Spirits\n' +
  tail

const CARDS = [
  { id: 4280258, name: 'Apollousa, Bow of the Goddess' },
  { id: 24224830, name: 'Called by the Grave' },
  { id: 32061192, name: 'Maliss <P> Dormouse' },
  { id: 1, name: '"A Case for K9"' },
  { id: 2, name: 'Cupsy☆Yummy' },
  { id: 3, name: 'Perfectron Hydradrive Dragon' },
  { id: 4, name: 'Branded in High Spirits' },
  { id: 5, name: 'Génesis Ü' },
]

describe('scripts/sync-banlists.mjs: listas nuevas de Yugipedia', () => {
  it('se prueban las páginas de los meses siguientes a la última lista de cada región, también al pasar de año', () => {
    const lists = [
      { region: 'ocg', date: '2026-11' },
      { region: 'tcg', date: '2026-09-21' },
      { region: 'tcg', date: '2026-05-18' },
    ]

    expect(upcomingWikiTitles(lists).sort()).toEqual(
      [
        'October 2026 Lists (TCG)',
        'November 2026 Lists (TCG)',
        'December 2026 Lists (TCG)',
        'December 2026 Lists (OCG)',
        'January 2027 Lists (OCG)',
        'February 2027 Lists (OCG)',
      ].sort(),
    )
  })

  it('de la plantilla salen los nombres de cada sección, sin las anotaciones ni las líneas en blanco, y si la página sigue incompleta', () => {
    expect(wikiListCards(WIKI_PAGE())).toEqual({
      region: 'tcg',
      date: '2026-10-19',
      partial: true,
      forbidden: ['Apollousa, Bow of the Goddess', 'Called by the Grave', 'Maliss P Dormouse'],
      limited: ['"A Case for K9"', 'Cupsy☆Yummy', 'Perfectron Hydradrive Dragon'],
      semiLimited: ['Branded in High Spirits'],
    })
    // Sin {{Incomplete}} es una lista como cualquier otra, y la plantilla puede terminar justo después de semi_limited.
    expect(wikiListCards(WIKI_PAGE('', '}}'))).toMatchObject({ partial: false, semiLimited: ['Branded in High Spirits'] })
    expect(wikiListCards('Esta página lleva a: [[X]]')).toBeNull()
  })

  it('los nombres de la wiki se pasan a la carta de YGOPRODeck aunque cambien los < >, las tildes, las comillas curvas o ☆/★; sin carta o ambiguo no se resuelve', () => {
    const find = buildNameLookup([...CARDS, { id: 6, name: 'Twin★Star' }, { id: 7, name: 'Twin☆Star' }])

    expect(find('Maliss P Dormouse')).toEqual({ id: 32061192, name: 'Maliss <P> Dormouse' })
    expect(find('Cupsy★Yummy')).toEqual({ id: 2, name: 'Cupsy☆Yummy' })
    expect(find('"A Case for K9"')).toEqual({ id: 1, name: '"A Case for K9"' })
    expect(find('“A Case for K9”')).toEqual({ id: 1, name: '"A Case for K9"' })
    expect(find('genesis u')).toEqual({ id: 5, name: 'Génesis Ü' })
    // Con el nombre exacto siempre se encuentra la suya; con otro parecido que podría ser cualquiera de las dos, ninguna.
    expect(find('Twin☆Star')).toEqual({ id: 7, name: 'Twin☆Star' })
    expect(find('Twin*Star')).toBeUndefined()
    expect(find('Carta que no existe')).toBeUndefined()
  })

  it('la lista de la wiki queda con ids como una de lflist.conf, con la marca de incompleta y los nombres que no encontró', () => {
    const find = buildNameLookup(CARDS.filter((card) => card.id !== 3))
    const { list, unresolved } = resolveWikiList(wikiListCards(WIKI_PAGE()), find)

    expect(list).toEqual({ region: 'tcg', date: '2026-10-19', partial: true, forbidden: [4280258, 24224830, 32061192], limited: [1, 2], semiLimited: [4] })
    expect(unresolved).toEqual(['Perfectron Hydradrive Dragon'])

    // La marca pasa a la lista final sólo si es verdadera: una lista completa queda como las demás.
    const { lists } = buildBanlists([list, { ...list, region: 'ocg', partial: false }], buildCardLookup(CARDS))

    expect(lists.find((entry: { region: string }) => entry.region === 'tcg')).toMatchObject({ partial: true })
    expect('partial' in lists.find((entry: { region: string }) => entry.region === 'ocg')!).toBe(false)
  })

  it('el archivo trae la marca de incompleta en la línea de la lista, y sólo en esa', () => {
    const text = banlistsFile(
      {
        lists: [
          { region: 'tcg', date: '2026-09-21', forbidden: [2], limited: [], semiLimited: [] },
          { region: 'tcg', date: '2026-10-19', forbidden: [2], limited: [3], semiLimited: [], partial: true },
        ],
        names: new Map([[2, 'Dos'], [3, 'Tres']]),
      },
      '2026-10-17',
    )

    expect(text.split('\n').slice(-5, -2)).toEqual([
      '{"region":"tcg","date":"2026-09-21","forbidden":[2],"limited":[],"semiLimited":[]},',
      '{"region":"tcg","date":"2026-10-19","forbidden":[2],"limited":[3],"semiLimited":[],"partial":true}',
      ']',
    ])
  })

  it('las listas del archivo anterior que lflist.conf todavía no trae se conservan; las que ya trae, no', () => {
    const file = JSON.stringify({
      lists: [
        { region: 'tcg', date: '2026-09-21', forbidden: [1] },
        { region: 'tcg', date: '2026-10-19', forbidden: [2], partial: true },
        { region: 'ocg', date: '2026-10-01', forbidden: [3] },
      ],
    })

    expect(carriedLists(file, parseLflist(SAMPLE)).map((list: { date: string }) => list.date)).toEqual(['2026-10-19'])
    // Con la lista de octubre del TCG en lflist.conf, la de la wiki ya no hace falta.
    expect(carriedLists(file, parseLflist(`${SAMPLE}!2026.10 TCG\n#forbidden\n1 0 --A\n`))).toEqual([])
    expect(carriedLists('', parseLflist(SAMPLE))).toEqual([])
  })
})

describe('scripts/sync-banlists.mjs: suplementos a mano', () => {
  const list = { region: 'tcg', date: '2026-10-19', partial: true, forbidden: [1], limited: [2, 3], semiLimited: [4] }
  const find = buildNameLookup([1, 2, 3, 4, 5].map((id) => ({ id, name: `Carta ${id}` })))
  const supplement = { region: 'tcg', month: '2026-10', note: 'Parte 2', forbidden: ['Carta 2', 'Carta 5'], limited: ['Carta 4'], unlimited: ['Carta 3', 'Carta 99'] }

  it('cada carta pasa al estado del suplemento y sale de los otros; lo que no se encuentra se cuenta', () => {
    const { lists, unresolved, unused } = applySupplements([list], [supplement], find)

    expect(lists).toEqual([{ ...list, forbidden: [1, 2, 5], limited: [4], semiLimited: [] }])
    expect(unresolved).toEqual(['Carta 99'])
    expect(unused).toEqual([])
  })

  it('aplicarlo dos veces da lo mismo, y una carta que ya está en ese estado no cambia nada', () => {
    const once = applySupplements([list], [supplement], find).lists

    expect(applySupplements(once, [supplement], find).lists).toEqual(once)
    expect(applySupplements([list], [{ region: 'tcg', month: '2026-10', forbidden: ['Carta 1'] }], find).lists[0]).toEqual(list)
  })

  it('sólo toca la lista de su región y mes mientras sigue incompleta; con la página completa o de otro mes no hace nada y queda sin uso', () => {
    const lists = [{ ...list, partial: false }, { ...list, region: 'ocg' }, { ...list, date: '2026-11-02' }]
    const result = applySupplements(lists, [supplement], find)

    expect(result.lists).toEqual(lists)
    expect(result.unused).toEqual([supplement])
  })
})

describe('scripts/sync-banlists.mjs: de Yugipedia a las listas nuevas', () => {
  afterEach(() => vi.unstubAllGlobals())

  const find = buildNameLookup(CARDS)
  // La última del TCG en lflist.conf es septiembre, con unas cuantas cartas (una página con muy pocas no sirve).
  const septiembre = { region: 'tcg', date: '2026-09-21', forbidden: [4280258, 24224830], limited: [1, 2], semiLimited: [4] }
  const lflist = [septiembre, { region: 'ocg', date: '2026-10-01', forbidden: [4280258], limited: [], semiLimited: [] }]
  const wikiResponse = (...pages: string[]) => ({ ok: true, text: async () => JSON.stringify({ query: { pages: pages.map((content) => ({ revisions: [{ content }] })) } }) })

  it('la página que existe se suma como lista del mes, incompleta, con los ids de las cartas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(wikiResponse(WIKI_PAGE())))

    const { lists, unresolved } = await fetchNewLists(lflist, null, find, [])

    expect(lists).toEqual([{ region: 'tcg', date: '2026-10-19', partial: true, forbidden: [4280258, 24224830, 32061192], limited: [1, 2, 3], semiLimited: [4] }])
    expect(unresolved).toEqual([])
  })

  it('con el suplemento la parte que la wiki todavía no tiene queda aplicada, y la lista sigue incompleta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(wikiResponse(WIKI_PAGE())))

    const { lists } = await fetchNewLists(lflist, null, find, [{ region: 'tcg', month: '2026-10', forbidden: ['"A Case for K9"'], limited: ['Branded in High Spirits'] }])

    expect(lists[0]).toMatchObject({ partial: true, forbidden: [4280258, 24224830, 32061192, 1], limited: [2, 3, 4], semiLimited: [] })
  })

  it('si lflist.conf ya trae la lista de ese mes, la de la wiki (y el suplemento) se descartan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(wikiResponse(WIKI_PAGE())))

    const oficial = { region: 'tcg', date: '2026-10', forbidden: [4280258], limited: [], semiLimited: [] }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { lists } = await fetchNewLists([...lflist, oficial], null, find, [{ region: 'tcg', month: '2026-10', forbidden: ['Called by the Grave'] }])

    expect(lists).toEqual([])
    // El suplemento ya no hace falta y se avisa para que se pueda borrar.
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Suplemento sin efecto'))
    log.mockRestore()
  })

  it('una página que trae menos de la mitad de las cartas de la última lista no sirve y se salta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(wikiResponse(WIKI_PAGE().replace(/\nCupsy☆Yummy|\n"A Case for K9"|\nCalled by the Grave[^\n]*|\nBranded in High Spirits|\nPerfectron[^\n]*/g, ''))))

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect((await fetchNewLists(lflist, null, find, [])).lists).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('si Yugipedia no responde, la lista del archivo anterior sigue (con los suplementos) en lugar de desaparecer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')))

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const previous = JSON.stringify({ lists: [septiembre, { region: 'tcg', date: '2026-10-19', partial: true, forbidden: [4280258], limited: [], semiLimited: [] }] })
    const { lists } = await fetchNewLists(lflist, previous, find, [{ region: 'tcg', month: '2026-10', forbidden: ['Called by the Grave'] }])

    expect(lists).toEqual([{ region: 'tcg', date: '2026-10-19', partial: true, forbidden: [4280258, 24224830], limited: [], semiLimited: [] }])
    warn.mockRestore()
  })
})
