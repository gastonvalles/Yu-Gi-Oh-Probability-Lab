import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Baja los precios de TCGplayer de todas las impresiones de Yu-Gi-Oh! desde TCGCSV (un espejo diario de sus datos:
 * TCGplayer ya no da keys nuevas para su API), los cruza con las cartas de YGOPRODeck por código de set y escribe
 * archivos estáticos que la app lee sin servidor, indexados por carta para que abrir una sola baje unos pocos KB
 * (no un archivo por cada expansión en la que salió):
 * - public/prices/index.json: la fecha de la última actualización, cuántos archivos hay y los sets (id, nombre, fecha de salida, cuántas impresiones tiene
 *   y el prefijo de sus códigos, "LOB" de "LOB-EN001", que es el nombre de la imagen de su sobre en YGOPRODeck).
 * - public/prices/cards/<n>.json, con n = id de la carta % SHARDS: un objeto { "<id de la carta>": filas }, una carta por línea
 *   para que git sólo vea lo que cambió. Cada fila es una impresión y edición:
 *   [código del set, rareza, edición, precio de mercado, id del producto en TCGplayer, id del set] y, sólo si la impresión es de un arte distinto
 *   ("Extended Art", "Alternate Art"...), el nombre de ese arte al final. La imagen de cada impresión es la de su producto: `product/<id>_200w.jpg`
 *   en el CDN de TCGplayer (así se ven las overframe, las de arte extendido y las alternativas, que YGOPRODeck no tiene).
 * - public/prices/sets/<id del set>.json: lo mismo pero por expansión (para ver qué cartas trae y a cuánto está cada una): un arreglo con una
 *   impresión por línea, [código del set, rareza, edición, precio de mercado, id del producto en TCGplayer, id de la carta, nombre de la carta] y, si
 *   la impresión es de un arte distinto, el nombre de ese arte al final.
 * Lo corre todos los días el workflow sync-meta-decks; a mano: `npm run sync:prices`.
 */
const TCGCSV = 'https://tcgcsv.com/tcgplayer/2' // categoría 2 = Yu-Gi-Oh!
const YGOPRODECK_CARDS = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'prices')
const CARDS_DIR = path.join(OUT_DIR, 'cards')
const SETS_DIR = path.join(OUT_DIR, 'sets')
/** Cuántos archivos por carta: con unas 14.000 cartas con precio, cada uno pesa unos 4 KB comprimidos. La app lo lee del índice. */
export const SHARDS = 256
/** TCGCSV es un proyecto de una sola persona: pide un User-Agent que diga quién consulta, y se lo trata con pocos pedidos a la vez. */
const USER_AGENT = 'ygo-probability-lab (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'
const CONCURRENCY = 4
const PAUSE_MS = 150
const ATTEMPTS = 4
/** Si falla más que esto, algo cambió en TCGCSV: mejor no tocar nada que publicar datos a medias. */
const MAX_FAILED_SHARE = 0.05
/** Con menos sets con precios que esto, TCGCSV cambió de forma o está vacío: mejor fallar que publicar casi nada (hoy son unos 610). */
const MIN_SETS = 400
/** Con menos cartas que esto, YGOPRODeck cambió de forma o falló (hoy son unas 14.600). */
const MIN_CARDS = 10_000
/** Del total de filas, al menos esta parte tiene que cruzar con una carta (hoy cruza el 98,6 %: el resto son productos sin carta). */
const MIN_MATCHED_SHARE = 0.9

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
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '')
/** Las fechas de salida reales terminan en T00:00:00; unos sets viejos traen en su lugar la hora del último sync de TCGCSV. */
const releaseDate = (publishedOn) => (publishedOn.endsWith('T00:00:00') ? publishedOn.slice(0, 10) : '')

export const shardOf = (cardId) => cardId % SHARDS

/**
 * El arte de una impresión, del nombre de su producto en TCGplayer: lo que va entre paréntesis y no es la rareza ni su sigla ni el código del set.
 * "Dark Magical Curtain (Starlight Rare) (Extended Art)" → "Extended Art"; "Polymerization (B) (HERO Art) (Platinum Secret Rare)" → "HERO Art";
 * "Dark Magical Curtain (GMR)" o "Dark Magical Curtain" → "". Si hay más de uno se unen con " · ".
 */
export function variantOf(name, rarity) {
  const rarityKey = normalize(rarity ?? '')
  const labels = [...(name ?? '').matchAll(/\(([^)]*)\)/g)].map((match) => match[1].trim())

  return labels
    .filter((label) => {
      const key = normalize(label)

      // Vacío, una sigla ("UR", "GMR", "B"), el código del set o la rareza (entera o abreviada, como "Secret" por "Secret Rare"): no dicen de qué arte es.
      return key !== '' && !/^[A-Z0-9]{1,5}$/.test(label) && !/^[A-Z0-9]+-[A-Z0-9]+$/.test(label) && !(rarityKey !== '' && (rarityKey.includes(key) || key.includes(rarityKey)))
    })
    .join(' · ')
}

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

    const rarity = fieldOf(product, 'Rarity')
    const variant = variantOf(product.name, rarity)

    rows.push([code, rarity, price.subTypeName ?? '', price.marketPrice ?? null, product.productId, ...(variant ? [variant] : [])])
  }

  return rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[4] - b[4])
}

/** De YGOPRODeck: cada código de set con las cartas que salieron con él y las rarezas (normalizadas) de cada una. */
export function buildCodeIndex(cards) {
  const index = new Map()

  for (const card of cards) {
    for (const printing of card.card_sets ?? []) {
      const byCard = index.get(printing.set_code) ?? new Map()
      const rarities = byCard.get(card.id) ?? new Set()

      rarities.add(normalize(printing.set_rarity ?? ''))
      byCard.set(card.id, rarities)
      index.set(printing.set_code, byCard)
    }
  }

  return index
}

const byRow = (a, b) => a[5] - b[5] || a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[4] - b[4]

/**
 * Pasa los precios de "filas por set" a "filas por carta": cada fila del set va a las cartas que salieron con ese código.
 * Si YGOPRODeck lista la carta con ciertas rarezas para ese código, sólo van las filas de esas rarezas; si ninguna
 * coincide (la rareza se llama distinto en TCGplayer), van todas las del código.
 * Devuelve las filas por carta ([código, rareza, edición, mercado, producto, set]), las filas por set ([código, rareza, edición, mercado, producto,
 * id de la carta]: lo mismo visto desde la expansión) y cuántas filas cruzaron con una carta.
 */
export function buildCardRows(sets, codeIndex) {
  const byCard = new Map()
  const bySet = new Map()
  let matched = 0
  let total = 0

  for (const { groupId, rows } of sets) {
    const byCode = new Map()

    for (const row of rows) {
      byCode.set(row[0], [...(byCode.get(row[0]) ?? []), row])
    }

    for (const [code, codeRows] of byCode) {
      total += codeRows.length

      const cards = codeIndex.get(code)

      if (!cards) {
        continue
      }

      matched += codeRows.length

      for (const [cardId, rarities] of cards) {
        const strict = codeRows.filter((row) => rarities.has(normalize(row[1])))
        const list = byCard.get(cardId) ?? []
        const inSet = bySet.get(groupId) ?? []

        for (const [, rarity, edition, market, productId, variant] of strict.length > 0 ? strict : codeRows) {
          list.push([code, rarity, edition, market, productId, groupId, ...(variant ? [variant] : [])])
          inSet.push([code, rarity, edition, market, productId, cardId, ...(variant ? [variant] : [])])
        }

        byCard.set(cardId, list)
        bySet.set(groupId, inSet)
      }
    }
  }

  for (const rows of byCard.values()) {
    rows.sort(byRow)
  }

  for (const rows of bySet.values()) {
    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[4] - b[4] || a[5] - b[5])
  }

  return { byCard, bySet, matched, total }
}

/** El prefijo de los códigos de un set ("LOB" de "LOB-EN001"): el más común entre sus filas (un set de varias cartas sueltas puede mezclar), vacío si no hay. */
export function setCodeOf(rows) {
  const counts = new Map()

  for (const row of rows) {
    const prefix = row[0].split('-')[0]

    counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
  }

  // El más repetido; con empate, el primero que apareció (el orden de las filas es por código).
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best), ['', 0])[0]
}

/** El contenido del archivo de un set: un arreglo con una impresión por línea (y el nombre de la carta al final); vacío, `[]`. */
export function setFile(rows, names) {
  return rows.length > 0 ? `[\n${rows.map((row) => JSON.stringify([...row.slice(0, 6), names.get(row[5]) ?? '', ...row.slice(6)])).join(',\n')}\n]\n` : '[]\n'
}

/** Un set que falló conserva lo de ayer: se suman a las filas nuevas las filas anteriores de esos sets. */
export function carryOver(previous, failedGroupIds, byCard) {
  for (const [cardId, rows] of previous) {
    const kept = rows.filter((row) => failedGroupIds.has(row[5]))

    if (kept.length > 0) {
      byCard.set(cardId, [...(byCard.get(cardId) ?? []), ...kept].sort(byRow))
    }
  }

  return byCard
}

/** El contenido de un archivo por carta: una carta por línea, en orden de id. Vacío, `{}`. */
export function shardFile(entries) {
  const lines = [...entries].sort((a, b) => a[0] - b[0]).map(([cardId, rows]) => `"${cardId}":${JSON.stringify(rows)}`)

  return lines.length > 0 ? `{\n${lines.join(',\n')}\n}\n` : '{}\n'
}

async function readPreviousCards() {
  const previous = new Map()

  for (let n = 0; n < SHARDS; n += 1) {
    const text = await readFile(path.join(CARDS_DIR, `${n}.json`), 'utf8').catch(() => null)

    for (const [cardId, rows] of Object.entries(text ? JSON.parse(text) : {})) {
      previous.set(Number(cardId), rows)
    }
  }

  return previous
}

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

  // Todas las cartas de YGOPRODeck en un solo pedido (unos 20 MB, una vez al día): de ahí sale a qué carta le toca cada código.
  const { data: cards } = await getJson(YGOPRODECK_CARDS)

  if (!Array.isArray(cards) || cards.length < MIN_CARDS) {
    throw new Error(`YGOPRODeck devolvió ${Array.isArray(cards) ? cards.length : 'nada'} cartas (se esperan más de ${MIN_CARDS}): no se escribe nada.`)
  }

  const sets = fetched.filter((entry) => entry.ok).map((entry) => ({ groupId: entry.group.groupId, rows: entry.rows }))
  const { byCard, bySet, matched, total } = buildCardRows(sets, buildCodeIndex(cards))
  const names = new Map(cards.map((card) => [card.id, card.name]))

  if (matched / total < MIN_MATCHED_SHARE) {
    throw new Error(`Sólo ${matched} de ${total} filas cruzaron con una carta: no se escribe nada.`)
  }

  if (failed.length > 0) {
    carryOver(await readPreviousCards(), new Set(failed.map((entry) => entry.group.groupId)), byCard)
  }

  const usedGroupIds = new Set()

  for (const rows of byCard.values()) {
    for (const row of rows) usedGroupIds.add(row[5])
  }

  const kept = groups.filter((group) => usedGroupIds.has(group.groupId)).sort((a, b) => a.groupId - b.groupId)

  await mkdir(CARDS_DIR, { recursive: true })

  const shards = Array.from({ length: SHARDS }, () => [])

  for (const entry of byCard) {
    shards[shardOf(entry[0])].push(entry)
  }

  let changed = 0

  for (let n = 0; n < SHARDS; n += 1) {
    if (await writeIfChanged(path.join(CARDS_DIR, `${n}.json`), shardFile(shards[n]))) changed += 1
  }

  // Un archivo por set. Uno que falló hoy conserva el de ayer (y la cantidad de impresiones que tenía en el índice).
  await mkdir(SETS_DIR, { recursive: true })

  const previousIndex = JSON.parse((await readFile(path.join(OUT_DIR, 'index.json'), 'utf8').catch(() => null)) ?? '{"groups":[]}')
  const previousCounts = new Map(previousIndex.groups.map(([id, , , count]) => [id, count ?? 0]))
  const previousCodes = new Map(previousIndex.groups.map(([id, , , , code]) => [id, code ?? '']))
  const setCounts = new Map()
  const setCodes = new Map()
  let changedSets = 0

  for (const group of kept) {
    const rows = bySet.get(group.groupId)

    if (rows) {
      setCounts.set(group.groupId, rows.length)
      setCodes.set(group.groupId, setCodeOf(rows))

      if (await writeIfChanged(path.join(SETS_DIR, `${group.groupId}.json`), setFile(rows, names))) changedSets += 1
    } else {
      setCounts.set(group.groupId, previousCounts.get(group.groupId) ?? 0)
      setCodes.set(group.groupId, previousCodes.get(group.groupId) ?? '')
    }
  }

  const keptSetFiles = new Set(kept.map((group) => `${group.groupId}.json`))

  for (const name of await readdir(SETS_DIR)) {
    if (!keptSetFiles.has(name)) {
      await rm(path.join(SETS_DIR, name), { force: true })
    }
  }

  const index = `{"updated":"${new Date().toISOString().slice(0, 10)}","shards":${SHARDS},"groups":[\n${kept
    .map((group) => JSON.stringify([group.groupId, group.name, releaseDate(group.publishedOn ?? ''), setCounts.get(group.groupId) ?? 0, setCodes.get(group.groupId) ?? '']))
    .join(',\n')}\n]}\n`

  await writeFile(path.join(OUT_DIR, 'index.json'), index)

  // Lo que sobra (los archivos por set de antes, o los que ya no corresponden) se borra para que no queden huérfanos.
  const shardNames = new Set(Array.from({ length: SHARDS }, (_, n) => `${n}.json`))

  for (const name of await readdir(OUT_DIR)) {
    if (name !== 'index.json' && name !== 'cards' && name !== 'sets') {
      await rm(path.join(OUT_DIR, name), { force: true })
    }
  }

  for (const name of await readdir(CARDS_DIR)) {
    if (!shardNames.has(name)) {
      await rm(path.join(CARDS_DIR, name), { force: true })
    }
  }

  console.log(`Listo: ${byCard.size} cartas con precio en ${kept.length} sets (${changed} de ${SHARDS} archivos por carta y ${changedSets} de ${kept.length} por set cambiaron, ${failed.length} sets fallaron y conservan lo anterior).`)
}

// Se puede importar sin que corra (para los tests); como script, baja todo.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
