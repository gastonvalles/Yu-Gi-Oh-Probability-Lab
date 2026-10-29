import { cardData, createDataLoader, DATA_UNAVAILABLE, DataUnavailableError, httpSource, preloadedReaders, rowOfApiCard, type CardRow, type DataSource } from '../app/auto/auto-data'
import type { ApiCardReference } from '../types'

const row = (id: number, type: number, extra: Partial<CardRow> = {}): CardRow => ({ id, alias: 0, setcode: '0', type, atk: 1000, def: 1000, level: 4, race: '1', attribute: 1, name: `card ${id}`, ...extra })
const EFFECT = 0x21
const NORMAL = 0x11
const TOKEN = 0x4011

/** Una fuente de mentira: cuenta lo que se le pide. */
function fakeSource(version = 'v1') {
  const rows = new Map([row(100, EFFECT, { strs: ['Add 1 card'] }), row(200, EFFECT), row(300, EFFECT), row(400, NORMAL), row(900, TOKEN)].map((card) => [card.id, card]))
  const scripts: Record<string, string> = {
    'constant.lua': '-- constants',
    'utility.lua': 'Duel.LoadScript("proc_a.lua")',
    'proc_a.lua': "Duel.LoadScript('proc_b.lua')",
    'proc_b.lua': '-- end of the chain',
    'c100.lua': 'local s,id=GetID()',
    'c200.lua': 'local s,id=GetID()',
  }
  const calls = { cards: [] as number[][], scripts: [] as string[] }
  const source: DataSource = {
    manifest: async () => ({ version, tokens: [900], filler: [400] }),
    cards: async (codes) => (calls.cards.push([...codes]), codes.flatMap((code) => (rows.has(code) ? [rows.get(code)!] : []))),
    script: async (name) => (calls.scripts.push(name), scripts[name] ?? null),
  }

  return { source, calls }
}

/** Una `CacheStorage` en memoria (la de los navegadores no existe en Node). */
function memoryCaches() {
  const boxes = new Map<string, Map<string, Response>>()

  return {
    boxes,
    storage: {
      keys: async () => [...boxes.keys()],
      delete: async (key: string) => boxes.delete(key),
      open: async (key: string) => {
        const box = boxes.get(key) ?? new Map<string, Response>()

        boxes.set(key, box)
        return { match: async (request: string) => box.get(String(request))?.clone(), put: async (request: string, response: Response) => void box.set(String(request), response) }
      },
    } as unknown as CacheStorage,
  }
}

const deck = { main: [[100, 3], [300, 1], [400, 2], [999, 1]], extra: [[200, 1]] } as const

describe('los datos de un duelo automático', () => {
  it('una carta que no está en ninguna base juega con la fila que armó la app (sin script: sin efectos); la de la base siempre gana', async () => {
    const { source } = fakeSource()
    const spare = row(999, EFFECT, { name: 'Recién salida', atk: 1800 })
    const data = await createDataLoader(source, null).load([{ ...deck, rows: [spare, row(100, NORMAL, { name: 'No pisa' })] }])

    expect(data.decks[0]).toEqual({ main: [100, 100, 100, 300, 400, 400, 999], extra: [200], missing: [], noRules: [300, 999] })
    expect(data.cards.find((card) => card.code === 999)).toMatchObject({ code: 999, type: EFFECT, attack: 1800 })
    expect(data.names[999]).toBe('Recién salida')
    expect(data.names[100]).toBe('card 100')
    expect(data.scripts['c999.lua']).toBeUndefined()
  })

  it('la fila de una carta con los datos de YGOPRODeck: tipo, Atributo, Tipo de monstruo, Nivel, escalas y ATK/DEF; lo que no da, neutro', () => {
    const api = (patch: Partial<ApiCardReference>) => ({ cardType: 'Effect Monster', race: 'Spellcaster', attribute: 'DARK', level: 4, linkValue: null, scale: null, atk: '1800', def: '?', ...patch }) as ApiCardReference

    expect(rowOfApiCard(1, 'Mago', api({}))).toEqual({ id: 1, alias: 0, setcode: '0', type: 0x21, atk: 1800, def: -2, level: 4, race: '2', attribute: 0x20, name: 'Mago' })
    expect(rowOfApiCard(2, 'Péndulo', api({ cardType: 'Pendulum Tuner Effect Monster', scale: 5, race: 'Dragon', attribute: 'LIGHT' }))).toMatchObject({ type: 0x1 | 0x20 | 0x1000 | 0x1000000, level: 4 | (5 << 16) | (5 << 24), race: String(0x2000), attribute: 0x10 })
    // Un Link: su número es el Nivel y sin flechas (YGOPRODeck no las da en nuestra carta: `def` 0).
    expect(rowOfApiCard(3, 'Link', api({ cardType: 'Link Monster', level: null, linkValue: 3, def: null, race: 'Cyberse' }))).toMatchObject({ type: 0x1 | 0x20 | 0x4000000, level: 3, def: 0, race: String(0x1000000) })
    expect(rowOfApiCard(4, 'Xyz', api({ cardType: 'XYZ Monster', level: 4 }))).toMatchObject({ type: 0x1 | 0x20 | 0x800000, level: 4 })
    expect(rowOfApiCard(5, 'Normal', api({ cardType: 'Normal Monster' }))).toMatchObject({ type: 0x11 })
    expect(rowOfApiCard(6, 'Rápida', api({ cardType: 'Spell Card', race: 'Quick-Play', attribute: null, level: null, atk: null, def: null }))).toEqual({ id: 6, alias: 0, setcode: '0', type: 0x2 | 0x10000, atk: 0, def: 0, level: 0, race: '0', attribute: 0, name: 'Rápida' })
    expect(rowOfApiCard(7, 'Contraefecto', api({ cardType: 'Trap Card', race: 'Counter' }))).toMatchObject({ type: 0x4 | 0x100000, atk: 0, attribute: 0 })
  })

  it('arma el cierre de scripts en cadena, sin pedir scripts para los Normales, y dice qué cartas faltan o no tienen reglas', async () => {
    const { source, calls } = fakeSource()
    const progress: [number, number][] = []
    const data = await createDataLoader(source, null).load([deck], (done, total) => progress.push([done, total]))

    expect(Object.keys(data.scripts).sort()).toEqual(['c100.lua', 'c200.lua', 'constant.lua', 'proc_a.lua', 'proc_b.lua', 'utility.lua'])
    expect(calls.scripts).not.toContain('c400.lua')
    expect(data.decks[0]).toEqual({ main: [100, 100, 100, 300, 400, 400], extra: [200], missing: [999], noRules: [300] })
    // Las fichas vienen con las cartas, en el mismo pedido.
    expect(calls.cards).toHaveLength(1)
    expect(data.cards.map((card) => card.code).sort()).toEqual([100, 200, 300, 400, 900])
    expect(data.names[900]).toBe('card 900')
    // Los rótulos de los efectos, sólo de las cartas que los traen.
    expect(data.texts).toEqual({ 100: ['Add 1 card'] })
    expect(progress.at(-1)).toEqual([1 + calls.scripts.length, 1 + calls.scripts.length])
    expect(progress.every(([done, total]) => done <= total)).toBe(true)
  })

  it('no vuelve a pedir lo que ya tiene: en memoria, y con la Cache API también otro cargador', async () => {
    const { source, calls } = fakeSource()
    const { storage, boxes } = memoryCaches()
    const loader = createDataLoader(source, storage)

    await loader.load([deck])
    const asked = { cards: calls.cards.length, scripts: calls.scripts.length }

    await loader.load([deck])
    expect({ cards: calls.cards.length, scripts: calls.scripts.length }).toEqual(asked)

    const again = await createDataLoader(source, storage).load([deck])

    expect({ cards: calls.cards.length, scripts: calls.scripts.length }).toEqual(asked)
    expect(again.decks[0]!.noRules).toEqual([300])
    expect([...boxes.keys()]).toEqual(['auto-data-v1'])

    // Datos nuevos (otra versión): la caché vieja se borra y se baja de nuevo.
    const fresh = fakeSource('v2')

    await createDataLoader(fresh.source, storage).load([deck])
    expect([...boxes.keys()]).toEqual(['auto-data-v2'])
    expect(fresh.calls.scripts.length).toBeGreaterThan(0)
  })

  it('baja también las filas que el núcleo lee por las cartas del deck: su alias y las que nombran sus scripts (también con una caché de antes)', async () => {
    // 500 «se trata como» 600 y 601 es un arte alternativo de 600: al mirar su arquetipo el núcleo lee la fila de 600. 100 cambia de nombre a 700 o a 800.
    const rows = new Map([row(100, EFFECT), row(500, NORMAL, { alias: 600 }), row(601, NORMAL, { alias: 600 }), row(600, NORMAL), row(700, NORMAL), row(800, NORMAL), row(900, TOKEN)].map((card) => [card.id, card]))
    const scripts: Record<string, string> = { 'constant.lua': 'CARD_EIGHT_HUNDRED = 800', 'utility.lua': '', 'c100.lua': 'local s,id=GetID()\ns.listed_names={CARD_EIGHT_HUNDRED,700,id}' }
    const calls: number[][] = []
    const source: DataSource = {
      manifest: async () => ({ version: 'v1', tokens: [900], filler: [] }),
      cards: async (codes) => (calls.push([...codes]), codes.flatMap((code) => (rows.has(code) ? [rows.get(code)!] : []))),
      script: async (name) => scripts[name] ?? null,
    }
    const { storage } = memoryCaches()
    const old = Object.fromEntries([100, 500, 601, 900].map((code) => [code, rows.get(code)]))

    await (await storage.open('auto-data-v1')).put('https://auto-data.cache/cards/all2', new Response(JSON.stringify({ value: old })))
    const data = await createDataLoader(source, storage).load([{ main: [[100, 1], [500, 1], [601, 1]] }])

    expect(calls).toEqual([[600, 800, 700]])
    expect(data.cards.map((card) => card.code).sort()).toEqual([100, 500, 600, 601, 700, 800, 900])
    expect(data.decks[0]).toEqual({ main: [100, 500, 601], extra: [], missing: [], noRules: [] })
  })

  it('un pedido que falló no queda guardado: el próximo intento (reintentar) lo vuelve a pedir', async () => {
    const { source, calls } = fakeSource()
    // Falla primero el manifiesto, después las cartas, después un script; la cuarta vez anda.
    const broken = ['manifest', 'cards', 'script']
    const fails = (what: string) => broken[0] === what && broken.shift() !== undefined
    const flaky: DataSource = {
      manifest: async () => (fails('manifest') ? Promise.reject(new TypeError('Failed to fetch')) : source.manifest()),
      cards: async (codes) => (fails('cards') ? Promise.reject(new TypeError('Failed to fetch')) : source.cards(codes)),
      script: async (name) => (fails('script') ? Promise.reject(new TypeError('Failed to fetch')) : source.script(name)),
    }
    const loader = createDataLoader(flaky, null)

    for (let i = 0; i < 3; i += 1) await expect(loader.load([deck])).rejects.toThrow('Failed to fetch')
    const data = await loader.load([deck])

    expect(data.decks[0]).toEqual({ main: [100, 100, 100, 300, 400, 400], extra: [200], missing: [999], noRules: [300] })
    expect(Object.keys(data.scripts).sort()).toEqual(['c100.lua', 'c200.lua', 'constant.lua', 'proc_a.lua', 'proc_b.lua', 'utility.lua'])
    expect(calls.cards).toHaveLength(1)
  })

  it('lee las filas del .cdb como el núcleo: escalas, flechas de Link y setcodes de 4 × u16', () => {
    expect(cardData(row(1, 0x1000021, { level: 4 | (3 << 16) | (5 << 24), setcode: String((0x10an << 16n) | 0x2bn) }))).toMatchObject({ level: 4, lscale: 5, rscale: 3, setcodes: [0x2b, 0x10a] })
    expect(cardData(row(2, 0x4000021, { def: 0b101, race: '-1' }))).toMatchObject({ defense: 0, link_marker: 5, race: 2n ** 64n - 1n })
  })

  it('por HTTP: un 404 es «no existe»; el código que el servidor manda en { error } llega tal cual, y otro fallo dice dónde', async () => {
    const responses: Record<string, () => Response> = {
      '/d/script/c1.lua': () => new Response('not found', { status: 404 }),
      '/d/manifest': () => Response.json({ error: DATA_UNAVAILABLE }, { status: 503 }),
      '/d/cards?codes=1': () => new Response('<html>', { status: 502 }),
    }

    vi.stubGlobal('fetch', vi.fn(async (url: string) => responses[url]!()))
    const source = httpSource('/d')
    const failure = await source.manifest().catch((error: unknown) => error)

    await expect(source.script('c1.lua')).resolves.toBeNull()
    expect(failure).toBeInstanceOf(DataUnavailableError)
    expect((failure as Error).message).toBe(DATA_UNAVAILABLE)
    await expect(source.cards([1])).rejects.toThrow('auto-data: 502 on /cards?codes=1')
    vi.unstubAllGlobals()
  })

  it('los lectores precargados avisan una vez por carta que el núcleo pide y no está', () => {
    const faults: unknown[] = []
    const readers = preloadedReaders({ cards: [cardData(row(100, EFFECT))], scripts: { 'c100.lua': 'x' } }, (event) => faults.push(event))

    expect(readers.cardReader(100)?.code).toBe(100)
    expect(readers.cardReader(5)).toBeNull()
    expect(readers.cardReader(5)).toBeNull()
    expect(readers.scriptReader('c100.lua')).toBe('x')
    expect(readers.scriptReader('c5.lua')).toBeNull()
    expect(faults).toEqual([{ t: 'fault', kind: 'script', message: 'card data not preloaded: 5', cards: [5] }])
  })
})
