import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Baja los precios de TCGplayer de todas las impresiones de Yu-Gi-Oh! desde TCGCSV (un espejo diario de sus datos:
 * TCGplayer ya no da keys nuevas para su API) y escribe archivos estáticos que la app lee sin servidor:
 * - public/prices/index.json: los sets (id, nombre, abreviatura y fecha de salida) y la fecha de la última actualización.
 * - public/prices/<id del set>.json: una fila por impresión y edición, con una fila por línea para que git sólo vea lo que cambió:
 *   [código del set, rareza, edición, precio de mercado, precio mínimo, id del producto en TCGplayer].
 * Lo corre todos los días el workflow sync-meta-decks; a mano: `npm run sync:prices`.
 */
const TCGCSV = 'https://tcgcsv.com/tcgplayer/2' // categoría 2 = Yu-Gi-Oh!
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'prices')
/** TCGCSV es un proyecto de una sola persona: pide un User-Agent que diga quién consulta, y se lo trata con pocos pedidos a la vez. */
const USER_AGENT = 'ygo-probability-lab (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'
const CONCURRENCY = 4
const PAUSE_MS = 150
const ATTEMPTS = 4
/** Si falla más que esto, algo cambió en TCGCSV: mejor no tocar nada que publicar datos a medias. */
const MAX_FAILED_SHARE = 0.05
/** Con menos sets con precios que esto, TCGCSV cambió de forma o está vacío: mejor fallar que publicar casi nada (hoy son unos 610). */
const MIN_SETS = 400

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson(url) {
  let lastError

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })

      if (!response.ok) {
        throw new Error(`${response.status} ${url}`)
      }

      return await response.json()
    } catch (error) {
      lastError = error
      await sleep(600 * attempt)
    }
  }

  throw lastError
}

const fieldOf = (product, name) => product.extendedData?.find((entry) => entry.name === name)?.value ?? ''
/** Las fechas de salida reales terminan en T00:00:00; unos sets viejos traen en su lugar la hora del último sync de TCGCSV. */
const releaseDate = (publishedOn) => (publishedOn.endsWith('T00:00:00') ? publishedOn.slice(0, 10) : '')

/** Las filas de un set: sólo cartas (los productos con código de set), una por edición con precio, en un orden fijo. */
export function buildRows(products, prices) {
  const byProduct = new Map(products.map((product) => [product.productId, product]))
  const rows = []

  for (const price of prices) {
    const product = byProduct.get(price.productId)
    const code = product ? fieldOf(product, 'Number') : ''

    if (!code || (price.marketPrice == null && price.lowPrice == null)) {
      continue
    }

    rows.push([code, fieldOf(product, 'Rarity'), price.subTypeName ?? '', price.marketPrice ?? null, price.lowPrice ?? null, product.productId])
  }

  return rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[5] - b[5])
}

const rowsFile = (rows) => `{"rows":[\n${rows.map((row) => JSON.stringify(row)).join(',\n')}\n]}\n`

async function writeIfChanged(file, content) {
  const current = await readFile(file, 'utf8').catch(() => null)

  if (current !== content) {
    await writeFile(file, content)
    return true
  }

  return false
}

async function mapLimit(items, limit, work) {
  const results = new Array(items.length)
  let next = 0

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next
        next += 1
        results[index] = await work(items[index])
        await sleep(PAUSE_MS)
      }
    }),
  )

  return results
}

async function main() {
  const { results: groups } = await getJson(`${TCGCSV}/groups`)
  console.log(`${groups.length} sets en TCGCSV`)

  let done = 0
  const fetched = await mapLimit(groups, CONCURRENCY, async (group) => {
    try {
      const [products, prices] = await Promise.all([getJson(`${TCGCSV}/${group.groupId}/products`), getJson(`${TCGCSV}/${group.groupId}/prices`)])
      const rows = buildRows(products.results, prices.results)

      done += 1
      if (done % 100 === 0) console.log(`  ${done}/${groups.length}`)

      return { group, rows, ok: true }
    } catch (error) {
      console.error(`Falló el set ${group.groupId} (${group.name}): ${error.message}`)
      return { group, rows: [], ok: false }
    }
  })

  const failed = fetched.filter((entry) => !entry.ok)

  if (failed.length / groups.length > MAX_FAILED_SHARE) {
    throw new Error(`Fallaron ${failed.length} de ${groups.length} sets: no se escribe nada.`)
  }

  if (fetched.filter((entry) => entry.ok && entry.rows.length > 0).length < MIN_SETS) {
    throw new Error(`Menos de ${MIN_SETS} sets con precios: no se escribe nada.`)
  }

  await mkdir(OUT_DIR, { recursive: true })
  const kept = []
  let changed = 0

  for (const { group, rows, ok } of fetched) {
    const file = path.join(OUT_DIR, `${group.groupId}.json`)
    const hasPreviousFile = await readFile(file, 'utf8').then(() => true, () => false)

    // Un set que falló conserva el archivo de ayer; uno sin cartas con precio (sellados, accesorios) no se publica.
    if ((ok && rows.length > 0) || (!ok && hasPreviousFile)) {
      if (ok && (await writeIfChanged(file, rowsFile(rows)))) changed += 1
      kept.push(group)
    }
  }

  kept.sort((a, b) => a.groupId - b.groupId)
  const index = `{"updated":"${new Date().toISOString().slice(0, 10)}","groups":[\n${kept
    .map((group) => JSON.stringify([group.groupId, group.name, group.abbreviation ?? '', releaseDate(group.publishedOn ?? '')]))
    .join(',\n')}\n]}\n`

  await writeFile(path.join(OUT_DIR, 'index.json'), index)

  // Sets que ya no existen en TCGCSV: se borra su archivo para que no queden huérfanos.
  const keptNames = new Set([...kept.map((group) => `${group.groupId}.json`), 'index.json'])

  for (const name of await readdir(OUT_DIR)) {
    if (!keptNames.has(name)) {
      await unlink(path.join(OUT_DIR, name))
    }
  }

  console.log(`Listo: ${kept.length} sets con precios (${changed} archivos cambiaron, ${failed.length} fallaron y conservan lo anterior).`)
}

// Se puede importar sin que corra (para los tests); como script, baja todo.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
