import { cardData, createDataLoader, DataUnavailableError, httpSource, preloadedReaders, type CardRow, type DataSource } from '../app/auto/auto-data'

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

  it('lee las filas del .cdb como el núcleo: escalas, flechas de Link y setcodes de 4 × u16', () => {
    expect(cardData(row(1, 0x1000021, { level: 4 | (3 << 16) | (5 << 24), setcode: String((0x10an << 16n) | 0x2bn) }))).toMatchObject({ level: 4, lscale: 5, rscale: 3, setcodes: [0x2b, 0x10a] })
    expect(cardData(row(2, 0x4000021, { def: 0b101, race: '-1' }))).toMatchObject({ defense: 0, link_marker: 5, race: 2n ** 64n - 1n })
  })

  it('por HTTP: un 404 es «no existe»; lo que el servidor explica en { error } llega tal cual, y otro fallo dice dónde', async () => {
    const responses: Record<string, () => Response> = {
      '/d/script/c1.lua': () => new Response('not found', { status: 404 }),
      '/d/manifest': () => Response.json({ error: 'Los datos del duelo automático no están disponibles ahora' }, { status: 503 }),
      '/d/cards?codes=1': () => new Response('<html>', { status: 502 }),
    }

    vi.stubGlobal('fetch', vi.fn(async (url: string) => responses[url]!()))
    const source = httpSource('/d')
    const failure = await source.manifest().catch((error: unknown) => error)

    await expect(source.script('c1.lua')).resolves.toBeNull()
    expect(failure).toBeInstanceOf(DataUnavailableError)
    expect((failure as Error).message).toBe('Los datos del duelo automático no están disponibles ahora')
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
