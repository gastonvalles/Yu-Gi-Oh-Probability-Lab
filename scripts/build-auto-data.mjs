#!/usr/bin/env node
/**
 * Los datos del duelo automático en producción: los sirve `api/auto-data.ts` en las mismas rutas que el plugin `autoDataDev`
 * (vite.config.ts) en desarrollo, y las filas y el manifiesto salen de las mismas funciones (las de acá), así que dan lo mismo.
 *
 * Corre antes de cada `npm run build` pero sólo trabaja en el de Vercel (`VERCEL`) o con `AUTO_DATA_BUILD=1`: un build común (local, CI,
 * pruebas) no toca la red ni necesita `node:sqlite`. Baja de GitHub las versiones de `auto-data.lock.json` (las bases de
 * ProjectIgnis/BabelCDB que nombra, que junta `mergeCdbs`, y el tarball de ProjectIgnis/CardScripts) y deja en `.auto-data/` (fuera del repo: el `.cdb` no tiene licencia)
 * lo que la función lleva consigo, entero, en su paquete:
 * - `data.json`: el manifiesto (`version`, `tokens`, `filler` y, con `AUTO_ONLINE=0`, `features: { online: false }`), las filas de todas las cartas (`cards`, por código) y dónde está cada
 *   script dentro del paquete (`scripts`: nombre → [inicio, largo], en bytes).
 * - `scripts.pack`: los scripts que se sirven, uno detrás del otro. Viajan con la función (y no se le piden a GitHub en cada pedido): el
 *   sitio no depende de GitHub para jugar y nadie ve desde allá qué cartas se usan.
 *
 * Si algo falla (GitHub caído o limitando, un Node sin `node:sqlite`) avisa en el log y sigue sin datos: el sitio se despliega igual (la
 * beta es opcional) y la función contesta 503, que la beta muestra como «no disponible». Con `AUTO_DATA_STRICT=1` el fallo rompe el
 * build. `AUTO_DATA_GITHUB` reemplaza `https://github.com` (para probar el build sin GitHub).
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCK = path.join(ROOT, 'auto-data.lock.json')
/** El lock: el commit de cada repo y, de BabelCDB, qué bases se juntan (`files`) y qué cartas de preestreno ya tienen su passcode (`released`). */
export const readLock = () => JSON.parse(readFileSync(LOCK, 'utf8'))
const OUT_DIR = path.join(ROOT, '.auto-data')
const USER_AGENT = 'YGO Probability Lab build (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'
/** Las bajadas tardan un par de segundos; un GitHub colgado no puede dejar el build esperando. */
const DOWNLOAD_TIMEOUT_MS = 60_000

/** Las columnas de una carta: las de `datas` y, de `texts`, el nombre y los rótulos de los efectos (`str1`…`str16`: lo que `aux.Stringid` nombra en un menú). */
const COLUMNS = ['d.id', 'd.alias', 'd.setcode', 'd.type', 'd.atk', 'd.def', 'd.level', 'd.race', 'd.attribute', 't.name', ...Array.from({ length: 16 }, (_, i) => `t.str${i + 1}`)].join(', ')
const u64 = (value) => BigInt.asUintN(64, BigInt(value)).toString()
const select = (db, sql, ...params) => {
  const query = db.prepare(sql)

  query.setReadBigInts(true)
  return query.all(...params)
}

/** Una fila del `.cdb` (leída con `setReadBigInts`) como la sirve `/auto-data/cards` (`CardRow`): los int64 como texto, sin los rótulos vacíos del final. */
function cardRowOf(row) {
  const strs = Array.from({ length: 16 }, (_, i) => (typeof row[`str${i + 1}`] === 'string' ? row[`str${i + 1}`] : ''))

  while (strs.length > 0 && strs[strs.length - 1] === '') strs.pop()

  return { id: Number(row.id), alias: Number(row.alias), setcode: u64(row.setcode), type: Number(row.type), atk: Number(row.atk), def: Number(row.def), level: Number(row.level), race: u64(row.race), attribute: Number(row.attribute), ...(typeof row.name === 'string' ? { name: row.name } : {}), ...(strs.length > 0 ? { strs } : {}) }
}

/** Las filas de esos códigos, por código (cada una una vez; las que no existen, no vienen): lo que contesta `/auto-data/cards` en desarrollo. */
export const cardsByCodes = (db, codes) => select(db, `select ${COLUMNS} from datas d left join texts t on t.id = d.id where d.id in (select value from json_each(?)) order by d.id`, JSON.stringify(codes)).map(cardRowOf)

/** Todas las filas, por código: lo que lleva la función. */
const allCards = (db) => select(db, `select ${COLUMNS} from datas d left join texts t on t.id = d.id order by d.id`).map(cardRowOf)

/** Las fichas (el núcleo lee sus datos al crearlas) y el rival pasivo: los primeros 40 Monstruos Normales (TCG u OCG, sin arte alternativo) que no tienen script. */
export function manifestCodes(db, hasScript) {
  const ids = (sql) => select(db, sql).map((row) => Number(row.id))

  return {
    tokens: ids('select id from datas where (type & 16384) != 0 order by id'),
    filler: ids('select id from datas where type = 17 and alias = 0 and (ot & 3) != 0 order by id')
      .filter((code) => !hasScript(`c${code}.lua`))
      .slice(0, 40),
  }
}

/** Dónde se busca un script, en orden: las cartas en `official/` y después `pre-release/`; las bibliotecas en la raíz y después `unofficial/`. */
export const scriptDirs = (name) => (/^c\d+\.lua$/.test(name) ? ['official', 'pre-release'] : ['.', 'unofficial'])

/** El script de una carta ascendida (`released`, ver `mergeCdbs`): `c<passcode>.lua` → el de su id de preestreno, mientras no tenga uno propio. */
export const promotedScripts = (lock) => new Map(Object.entries(lock.BabelCDB.released ?? {}).map(([pre, code]) => [`c${code}.lua`, `c${pre}.lua`]))

const DATAS = 'id, ot, alias, setcode, type, atk, def, level, race, attribute, category'
const TEXTS = `id, name, desc, ${Array.from({ length: 16 }, (_, i) => `str${i + 1}`).join(', ')}`

/**
 * Junta en el primero de `files` (ya bajados, en el orden de `files` del lock: `cards.cdb`, las `release-*` y las `prerelease-*`) las filas
 * de los demás. Un id que ya está no se pisa: gana la base que va antes, así la oficial le gana a la de preestreno. Después asciende las
 * cartas de preestreno que ya tienen passcode (`released`: id provisorio → el passcode de YGOPRODeck, el de nuestros decks): una copia de
 * la fila con ese código y `alias` al provisorio (lo que nombren por ese número otros scripts sigue valiendo) que juega con el script del
 * provisorio (`promotedScripts`). Si Project Ignis ya la pasó a una base con su passcode, gana la de ellos.
 */
export async function mergeCdbs(files, released = {}) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(files[0])

  try {
    for (const file of files.slice(1)) {
      db.prepare('attach database ? as extra').run(file)
      db.exec(`insert or ignore into datas (${DATAS}) select ${DATAS} from extra.datas; insert or ignore into texts (${TEXTS}) select ${TEXTS} from extra.texts; detach database extra`)
    }
    const data = db.prepare(`insert or ignore into datas (${DATAS}) select ?, ot, id, setcode, type, atk, def, level, race, attribute, category from datas where id = ?`)
    const text = db.prepare(`insert or ignore into texts (${TEXTS}) select ?, ${TEXTS.slice('id, '.length)} from texts where id = ?`)

    for (const [pre, code] of Object.entries(released)) {
      data.run(code, Number(pre))
      text.run(code, Number(pre))
    }
  } finally {
    db.close()
  }
}

/** Los archivos de un tar (el tarball de GitHub ya descomprimido), con el nombre largo de pax si lo trae. */
function* untar(tar) {
  let long = null

  for (let at = 0; at + 512 <= tar.length && tar[at] !== 0; ) {
    const field = (start, length) => tar.toString('utf8', at + start, at + start + length).replace(/\0[^]*$/, '')
    const size = Number.parseInt(field(124, 12).trim() || '0', 8)
    const type = field(156, 1) || '0'
    const name = long ?? (field(257, 6) === 'ustar' && field(345, 155) ? `${field(345, 155)}/${field(0, 100)}` : field(0, 100))
    const body = tar.subarray(at + 512, at + 512 + size)

    at += 512 + Math.ceil(size / 512) * 512
    long = null
    if (type === 'x') long = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))?.[1] ?? null
    else if (type === '0') yield { path: name, body }
  }
}

/** Los scripts que se sirven, del tarball (`<repo>-<commit>/` adelante), con el orden de `scriptDirs`: el índice y el paquete. Una carta ascendida apunta a los bytes de su script de preestreno (`promoted`). */
function packScripts(files, promoted) {
  const best = new Map()

  for (const { path: file, body } of files) {
    const inside = file.slice(file.indexOf('/') + 1)
    const slash = inside.lastIndexOf('/')
    const name = inside.slice(slash + 1)
    const rank = name.endsWith('.lua') ? scriptDirs(name).indexOf(slash < 0 ? '.' : inside.slice(0, slash)) : -1

    if (rank >= 0 && rank < (best.get(name)?.rank ?? Infinity)) best.set(name, { rank, body })
  }

  const names = [...best.keys()].sort()
  const index = {}
  let offset = 0

  for (const name of names) {
    index[name] = [offset, best.get(name).body.length]
    offset += best.get(name).body.length
  }
  for (const [name, pre] of promoted) if (!Object.hasOwn(index, name) && Object.hasOwn(index, pre)) index[name] = index[pre]

  return { index, pack: Buffer.concat(names.map((name) => best.get(name).body)) }
}

/** La versión del manifiesto (la clave de la caché de la app): cambia sólo con el lock (también si cambian las bases o las cartas ascendidas). */
export const versionOf = (lock) => createHash('sha1').update(JSON.stringify([lock.CardScripts.commit, lock.BabelCDB])).digest('hex').slice(0, 12)

/** Arma `data.json` y `scripts.pack` en `outDir` con lo bajado. `features` va tal cual en el manifiesto (los interruptores del despliegue). */
async function writeAutoData(outDir, { cdbs, tarball, lock, features }) {
  // Se importa recién acá: un build que no arma datos no lo necesita, y un Node sin `node:sqlite` cae en el aviso de `buildAutoData`.
  const { DatabaseSync } = await import('node:sqlite')
  // Los `.cdb` van a una carpeta temporal y no a `outDir`: la función lleva todo lo que haya ahí.
  const temp = mkdtempSync(path.join(os.tmpdir(), 'ygo-lab-auto-data-'))
  const files = lock.BabelCDB.files.map((name) => path.join(temp, name))
  let db = null

  try {
    files.forEach((file, i) => writeFileSync(file, cdbs[i]))
    await mergeCdbs(files, lock.BabelCDB.released)
    db = new DatabaseSync(files[0], { readOnly: true })
    const { index, pack } = packScripts(untar(gunzipSync(tarball)), promotedScripts(lock))
    const data = { version: versionOf(lock), ...manifestCodes(db, (name) => Object.hasOwn(index, name)), ...(features ? { features } : {}), cards: Object.fromEntries(allCards(db).map((row) => [row.id, row])), scripts: index }

    mkdirSync(outDir, { recursive: true })
    // El paquete primero: la función mira `data.json` para saber si hay datos.
    writeFileSync(path.join(outDir, 'scripts.pack'), pack)
    writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(data))
    return data
  } finally {
    db?.close()
    rmSync(temp, { recursive: true, force: true })
  }
}

/** Por qué falló, en una línea (lo de `fetch` viene en `cause`). */
const reasonOf = (error) =>
  error?.code === 'ERR_UNKNOWN_BUILTIN_MODULE'
    ? `este Node (${process.version}) no trae node:sqlite sin banderas (hace falta 22.13 o más nuevo)`
    : `${error instanceof Error ? error.message : String(error)}${error?.cause ? ` (${error.cause.code ?? error.cause.message ?? error.cause})` : ''}`

async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })

  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Arma `.auto-data/` si toca (ver arriba). Devuelve si quedaron datos; sólo falla con `AUTO_DATA_STRICT`. `lock` reemplaza al del repo (las pruebas).
 * @param {{ outDir?: string, env?: Record<string, string | undefined>, lock?: ReturnType<typeof readLock> }} [options]
 */
export async function buildAutoData({ outDir = OUT_DIR, env = process.env, lock: locked } = {}) {
  if (!env.VERCEL && !env.AUTO_DATA_BUILD) return false
  rmSync(outDir, { recursive: true, force: true })

  try {
    const lock = locked ?? readLock()
    const github = env.AUTO_DATA_GITHUB ?? 'https://github.com'
    const [tarball, ...cdbs] = await Promise.all([download(`${github}/ProjectIgnis/CardScripts/archive/${lock.CardScripts.commit}.tar.gz`), ...lock.BabelCDB.files.map((name) => download(`${github}/ProjectIgnis/BabelCDB/raw/${lock.BabelCDB.commit}/${name}`))])
    // `AUTO_ONLINE=0` apaga el duelo automático por enlace sin tocar código (un redeploy): el lobby no lo ofrece y el anfitrión de una sala vieja no lo arranca.
    const data = await writeAutoData(outDir, { cdbs, tarball, lock, features: env.AUTO_ONLINE === '0' ? { online: false } : undefined })

    console.log(`auto-data: ${Object.keys(data.cards).length} cartas y ${Object.keys(data.scripts).length} scripts (versión ${data.version}) en ${outDir}`)
    return true
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true })
    if (env.AUTO_DATA_STRICT) throw error
    console.warn(
      [
        `auto-data AVISO: no se armaron los datos del duelo automático (beta): ${reasonOf(error)}.`,
        'auto-data AVISO: el sitio se despliega igual; la beta dice que sus datos no están disponibles hasta un despliegue que los arme.',
        'auto-data AVISO: para reintentar, volvé a desplegar (Redeploy en Vercel). Con AUTO_DATA_STRICT=1 este fallo rompe el build.',
      ].join('\n'),
    )
    return false
  }
}

// Se puede importar sin que corra (vite.config.ts y las pruebas usan las funciones de arriba); como script, arma los datos.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  buildAutoData().catch((error) => {
    console.error(`auto-data: no se armaron los datos del duelo automático (AUTO_DATA_STRICT): ${reasonOf(error)}`)
    process.exitCode = 1
  })
}
