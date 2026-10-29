import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { gzipSync } from 'node:zlib'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { autoDataHandler } from '../../api/auto-data'
import { DATA_UNAVAILABLE } from '../app/auto/auto-data'
import { buildAutoData, cardsByCodes, versionOf } from '../../scripts/build-auto-data.mjs'

const ROOT = new URL('../../', import.meta.url)
const lock = JSON.parse(readFileSync(new URL('auto-data.lock.json', ROOT), 'utf8')) as { CardScripts: { commit: string; date: string }; BabelCDB: { commit: string; date: string; files: string[]; released: Record<string, number> } }
/** El de verdad con bases y ascensos inventados: `cards.cdb`, una `release-*` y una `prerelease-*`; la 700 (de preestreno) ya tiene el passcode 710, y la 701 el 100, que ya está. */
const testLock = { ...lock, BabelCDB: { ...lock.BabelCDB, files: ['cards.cdb', 'release-x.cdb', 'prerelease-y.cdb'], released: { 700: 710, 701: 100 } } }
const TOP = `CardScripts-${lock.CardScripts.commit}`
/** Un setcode de 4 × u16 que no entra en un double ni en un int64 con signo: así lo guarda el `.cdb`. */
const SETCODE = (0x8001n << 48n) | (0x2n << 32n) | (0x3n << 16n) | 0x4n
const EFFECT = 0x21
const NORMAL = 0x11

/** Un `.cdb` inventado con el esquema de BabelCDB (ninguna fila es de verdad: el de Project Ignis no tiene licencia). Sin `extra`, las filas de `cards.cdb`. */
function inventedCdb(file: string, extra?: readonly (readonly [number, string])[]) {
  const db = new DatabaseSync(file)

  db.exec(`create table datas(id integer primary key, ot integer, alias integer, setcode integer, type integer, atk integer, def integer, level integer, race integer, attribute integer, category integer);
    create table texts(id integer primary key, name text, desc text, ${Array.from({ length: 16 }, (_, i) => `str${i + 1} text`).join(', ')});`)
  const card = db.prepare('insert into datas values (?, ?, ?, ?, ?, 1000, 1200, ?, ?, 1, 0)')
  const text = db.prepare(`insert into texts (id, name, desc, str1, str2, str3, str4) values (?, ?, '', ?, ?, ?, '')`)

  if (extra) {
    for (const [id, name] of extra) {
      card.run(id, 3, 0, 0n, EFFECT, 4, 1n)
      text.run(id, name, 'Su efecto', '', '')
    }
    return db.close()
  }
  // Desordenadas a propósito: lo que se sirve va por código.
  for (const [id, ot, alias, setcode, type, level, race] of [
    [404, 3, 0, 0n, NORMAL, 4, 1n],
    [100, 3, 0, BigInt.asIntN(64, SETCODE), EFFECT, 4 | (3 << 16) | (5 << 24), -1n],
    [200, 3, 0, 0x2bn, EFFECT, 3, 2n],
    [300, 1, 0, 0n, EFFECT, 2, 2n],
    [400, 1, 0, 0n, NORMAL, 3, 1n],
    [401, 2, 0, 0n, NORMAL, 3, 1n],
    [402, 3, 400, 0n, NORMAL, 3, 1n],
    [403, 4, 0, 0n, NORMAL, 3, 1n],
    [900, 3, 0, 0n, 0x4011, 1, 1n],
    [901, 3, 0, 0n, 0x4021, 1, 1n],
  ] as const) {
    card.run(id, ot, alias, setcode, type, level, race)
  }
  for (const [id, name, ...strs] of [
    [100, 'Carta 100', 'Agregá 1 carta', '', 'Robá 1'],
    [200, 'Carta 200', '', '', ''],
    [400, 'Normal 400', '', '', ''],
    [404, 'Normal 404', '', '', ''],
    [900, 'Ficha 900', '', '', ''],
  ] as const) {
    text.run(id, name, ...strs)
  }
  db.close()
}

/** Un tar como el de GitHub: la cabecera global de pax, la carpeta `<repo>-<commit>/` y un nombre largo por pax. */
function inventedTar(entries: readonly { name: string; body?: string; type?: string }[]): Buffer {
  const parts: Buffer[] = []

  for (const { name, body = '', type = '0' } of entries) {
    const bytes = Buffer.from(body, 'utf8')
    const header = Buffer.alloc(512)

    header.write(name, 0)
    header.write(bytes.length.toString(8).padStart(11, '0'), 124)
    header.write(type, 156)
    header.write('ustar\0', 257)
    header.write('00', 263)
    parts.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512))
  }

  return Buffer.concat([...parts, Buffer.alloc(1024)])
}
const pax = (key: string, value: string) => {
  const tail = ` ${key}=${value}\n`
  let length = tail.length + 1

  while (String(length).length + tail.length !== length) length += 1
  return `${length}${tail}`
}
const SCRIPTS = [
  { name: 'pax_global_header', type: 'g', body: pax('comment', lock.CardScripts.commit) },
  { name: `${TOP}/`, type: '5' },
  { name: `${TOP}/official/c100.lua`, body: '--真炎王 ポニクス\nlocal s,id=GetID()' },
  { name: `${TOP}/pre-release/c100.lua`, body: 'la de pre-release (no se sirve)' },
  { name: `${TOP}/pre-release/c200.lua`, body: 'c200 de pre-release' },
  { name: `${TOP}/official/c401.lua`, body: 'un Normal con script' },
  { name: `${TOP}/pre-release/c700.lua`, body: 'c700 de preestreno' },
  { name: `${TOP}/constant.lua`, body: '-- constantes' },
  { name: `${TOP}/utility.lua`, body: 'Duel.LoadScript("proc_x.lua")' },
  { name: `${TOP}/unofficial/utility.lua`, body: 'la de unofficial (no se sirve)' },
  { name: `${TOP}/unofficial/proc_x.lua`, body: 'biblioteca de unofficial' },
  { name: `${TOP}/unofficial/c300.lua`, body: 'carta de unofficial (no se sirve)' },
  { name: `${TOP}/official/nested/c500.lua`, body: 'en una subcarpeta (no se sirve)' },
  { name: `${TOP}/README.md`, body: '# no es un script' },
  { name: `${TOP}/PaxHeaders/c999.lua`, type: 'x', body: pax('path', `${TOP}/official/c999.lua`) },
  { name: `${TOP}/official/c99`, body: 'c999, con el nombre en pax' },
]

const work = mkdtempSync(join(tmpdir(), 'auto-data-api-'))
const cdbFile = join(work, 'cards.cdb')
const extraCdbs: Record<string, readonly (readonly [number, string])[]> = {
  'release-x.cdb': [
    [100, 'Otra 100'],
    [500, 'Release 500'],
  ],
  'prerelease-y.cdb': [
    [500, 'Pre 500'],
    [700, 'Pre 700'],
    [701, 'Pre 701'],
  ],
}
const out = join(work, 'out')
const GET = autoDataHandler(out)
const get = async (search: string) => GET(new Request(`https://ygo.example/api/auto-data${search}`))
const stubDownloads = () => {
  const fetchMock = vi.fn(async (url: string) => {
    const babel = url.startsWith(`https://github.com/ProjectIgnis/BabelCDB/raw/${lock.BabelCDB.commit}/`) ? url.slice(url.lastIndexOf('/') + 1) : ''

    if (babel === 'cards.cdb') return new Response(new Uint8Array(readFileSync(cdbFile)))
    if (Object.hasOwn(extraCdbs, babel)) return new Response(new Uint8Array(readFileSync(join(work, babel))))
    if (url === `https://github.com/ProjectIgnis/CardScripts/archive/${lock.CardScripts.commit}.tar.gz`) return new Response(new Uint8Array(gzipSync(inventedTar(SCRIPTS))))
    return new Response('not found', { status: 404 })
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeAll(async () => {
  inventedCdb(cdbFile)
  for (const [name, rows] of Object.entries(extraCdbs)) inventedCdb(join(work, name), rows)
  stubDownloads()
  expect(await buildAutoData({ outDir: out, env: { VERCEL: '1' }, lock: testLock })).toBe(true)
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
afterAll(() => rmSync(work, { recursive: true, force: true }))

describe('los datos del duelo automático en producción (scripts/build-auto-data.mjs + api/auto-data.ts)', () => {
  it('las filas son las mismas que da la consulta de desarrollo: cada carta una vez, por código, sin las que no existen', async () => {
    const db = new DatabaseSync(cdbFile, { readOnly: true })
    // Lo que el plugin de desarrollo saca de `codes=300,100,abc,100,0100,999,900,7`: sólo números, en ese orden.
    const dev = JSON.stringify(cardsByCodes(db, [300, 100, 100, 100, 999, 900, 7]))
    const response = await get('?path=cards&codes=300,100,abc,100,0100,999,900,7')

    db.close()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(await response.text()).toBe(dev)
    expect(JSON.parse(dev).map((row: { id: number }) => row.id)).toEqual([100, 300, 900])
  })

  it('cada fila como la lee el núcleo: los int64 como texto sin signo, el nombre si lo hay y los rótulos sin los vacíos del final', async () => {
    const rows = (await (await get('?path=cards&codes=100,200,300')).json()) as Record<string, unknown>[]

    expect(rows[0]).toEqual({ id: 100, alias: 0, setcode: SETCODE.toString(), type: EFFECT, atk: 1000, def: 1200, level: 4 | (3 << 16) | (5 << 24), race: '18446744073709551615', attribute: 1, name: 'Carta 100', strs: ['Agregá 1 carta', '', 'Robá 1'] })
    expect(rows[1]).toEqual({ id: 200, alias: 0, setcode: '43', type: EFFECT, atk: 1000, def: 1200, level: 3, race: '2', attribute: 1, name: 'Carta 200' })
    expect(rows[2]).not.toHaveProperty('name')
  })

  it('el manifiesto: la versión sale del lock, las fichas, y de relleno los Normales TCG/OCG sin arte alternativo ni script', async () => {
    const response = await get('?path=manifest')

    expect(await response.text()).toBe(JSON.stringify({ version: versionOf(testLock), tokens: [900, 901], filler: [400, 404] }))
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=86400')
  })

  it('con AUTO_ONLINE=0 en el build el manifiesto apaga el duelo automático por enlace (sin tocar código); sin él no dice nada (encendido)', async () => {
    const dir = join(work, 'sin-online')

    stubDownloads()
    expect(await buildAutoData({ outDir: dir, env: { VERCEL: '1', AUTO_ONLINE: '0' }, lock: testLock })).toBe(true)
    const response = await autoDataHandler(dir)(new Request('https://ygo.example/api/auto-data?path=manifest'))

    expect(await response.json()).toEqual({ version: versionOf(testLock), tokens: [900, 901], filler: [400, 404], features: { online: false } })
  })

  it('junta las bases en el orden del lock (un id repetido lo gana la que va antes) y asciende las de preestreno con passcode, con su script', async () => {
    const rows = (await (await get('?path=cards&codes=100,500,700,701,710')).json()) as Record<string, unknown>[]

    // La 701 no se asciende: su passcode (100) ya es de otra carta, que no se pisa.
    expect(rows.map((row) => [row.id, row.alias, row.name])).toEqual([
      [100, 0, 'Carta 100'],
      [500, 0, 'Release 500'],
      [700, 0, 'Pre 700'],
      [701, 0, 'Pre 701'],
      [710, 700, 'Pre 700'],
    ])
    expect(rows[4]).toMatchObject({ type: EFFECT, strs: ['Su efecto'] })
    expect(await (await get('?path=script/c710.lua')).text()).toBe('c700 de preestreno')
  })

  it('los scripts, con el orden de búsqueda de desarrollo, enteros (también con letras de varios bytes) y sin ninguna ruta', async () => {
    const script = async (name: string) => {
      const response = await get(`?path=script/${name}`)

      return response.status === 200 ? await response.text() : response.status
    }

    expect(await script('c100.lua')).toBe('--真炎王 ポニクス\nlocal s,id=GetID()')
    expect(await script('c200.lua')).toBe('c200 de pre-release')
    expect(await script('utility.lua')).toBe('Duel.LoadScript("proc_x.lua")')
    expect(await script('proc_x.lua')).toBe('biblioteca de unofficial')
    expect(await script('constant.lua')).toBe('-- constantes')
    expect(await script('c999.lua')).toBe('c999, con el nombre en pax')
    // Las cartas sólo de `official/` y `pre-release/`; nada de subcarpetas ni de otra cosa que no sea `.lua`.
    for (const name of ['c300.lua', 'c500.lua', 'README.md', 'c1.lua', '../constant.lua', 'unofficial/proc_x.lua', 'constant.txt']) expect(await script(name), name).toBe(404)
    expect((await get('?path=otra-cosa')).status).toBe(404)

    const response = await GET(new Request('https://ygo.example/api/auto-data/script/c100.lua'))

    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=86400')
    expect(await response.text()).toContain('GetID')
  })

  it('sin los datos (un build que no los pudo armar) contesta 503 con el código que la beta traduce', async () => {
    const response = await autoDataHandler(join(work, 'nada'))(new Request('https://ygo.example/api/auto-data?path=manifest'))

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: DATA_UNAVAILABLE })
  })

  it('un build común no toca la red: sólo arma los datos en Vercel o con AUTO_DATA_BUILD', async () => {
    const fetchMock = stubDownloads()
    const dir = join(work, 'comun')

    expect(await buildAutoData({ outDir: dir, env: {} })).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(existsSync(dir)).toBe(false)
  })

  it('si GitHub falla, avisa y sigue sin datos (el sitio se despliega igual); con AUTO_DATA_STRICT el build se rompe', async () => {
    const dir = join(work, 'sin-red')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mkdirSync(dir)
    writeFileSync(join(dir, 'data.json'), '{}')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }))))

    expect(await buildAutoData({ outDir: dir, env: { VERCEL: '1' } })).toBe(false)
    // Nada a medias ni de antes: la función contesta 503.
    expect(existsSync(dir)).toBe(false)
    expect(warn.mock.calls.join('\n')).toMatch(/AVISO: no se armaron los datos del duelo automático \(beta\): fetch failed \(ENOTFOUND\)[^]*Redeploy/)
    await expect(buildAutoData({ outDir: dir, env: { VERCEL: '1', AUTO_DATA_STRICT: '1' } })).rejects.toThrow('fetch failed')
  })

  it('el lock sólo guarda commits, fechas, qué bases se juntan y los passcodes de las de preestreno, y los datos armados nunca se suben', () => {
    expect(Object.keys(lock).sort()).toEqual(['BabelCDB', 'CardScripts'])
    expect(Object.keys(lock.CardScripts).sort()).toEqual(['commit', 'date'])
    expect(Object.keys(lock.BabelCDB).sort()).toEqual(['commit', 'date', 'files', 'released'])
    for (const entry of Object.values(lock)) {
      expect(entry.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(new Date(entry.date).toISOString().slice(0, 19)).toBe(entry.date.slice(0, 19))
    }
    // `cards.cdb` primero (gana un id repetido) y nada de Rush.
    expect(lock.BabelCDB.files[0]).toBe('cards.cdb')
    for (const name of lock.BabelCDB.files.slice(1)) expect(name).toMatch(/^(pre)?release-(?!.*rush)[\w-]+\.cdb$/)
    for (const [pre, code] of Object.entries(lock.BabelCDB.released)) expect([pre, code]).toEqual([expect.stringMatching(/^\d{9}$/), expect.any(Number)])
    expect(readFileSync(new URL('.gitignore', ROOT), 'utf8').split(/\r?\n/)).toContain('.auto-data/')
  })
})
