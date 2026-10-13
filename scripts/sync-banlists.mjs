import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Baja las banlists históricas del TCG y del OCG y las deja en src/data/banlists.json.
 *
 * Las listas salen de `lflist.conf` de YGOPro (Fluorohydride/ygopro, que sus mantenedores actualizan en cada lista nueva): un archivo con todas
 * las listas desde 2011 (TCG) y 2013 (OCG), cada una completa, con las cartas prohibidas (0), limitadas (1) y semi-limitadas (2) por código de
 * pasaporte. Los códigos de los artes alternativos (una carta puede tener varios) y los nombres salen del catálogo de YGOPRODeck, así que cada
 * carta queda una vez, con su id de siempre y su nombre en inglés.
 *
 * El formato del archivo: una lista por encabezado `!<año>.<mes>[.<día>][ TCG]` (sin "TCG" es del OCG, salvo las cuatro primeras, que son del TCG
 * y no llevan la etiqueta), con sus secciones `#forbidden`, `#limit` y `#semi limit` y una carta por línea (`<código> <límite> --<nombre>`).
 * Sólo trae el mes (a veces el día). El día exacto en que entró en vigencia cada lista sale de Yugipedia: la página de cada lista ("May 2026 Lists
 * (TCG)") tiene una plantilla `Limitation list` con `start_date` y `medium` (TCG u OCG). Se piden de a 50 páginas y sólo las listas que todavía no
 * tienen día (el archivo ya escrito se reusa: una lista nueva es un pedido, y ninguno si todas lo tienen). Si Yugipedia no responde o todavía no tiene
 * la página de una lista nueva, esa lista queda con el mes y al día siguiente se vuelve a probar: la bajada no falla por eso.
 *
 * Lo corre todos los días el workflow sync-meta-decks; a mano: `npm run sync:banlists`.
 */
const LFLIST_URL = 'https://raw.githubusercontent.com/Fluorohydride/ygopro/master/lflist.conf'
const YUGIPEDIA_API = 'https://yugipedia.com/api.php'
const WIKI_BATCH = 50
const YGOPRODECK_CARDS = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const OUT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'banlists.json')
const USER_AGENT = 'ygo-probability-lab (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'
const TIMEOUT_MS = 90_000

/** Las listas del TCG que el archivo no etiqueta como tales (son anteriores a que se separaran de las del OCG). */
const UNLABELED_TCG = new Set(['2013.3.1', '2012.9.1', '2012.3.1', '2011.9.1'])
/** Hoy hay 104 listas (52 por región): con menos, el archivo cambió de forma. */
const MIN_LISTS_PER_REGION = 40
/** Con menos cartas que esto, YGOPRODeck cambió de forma o falló (hoy son unas 14.600). */
const MIN_CARDS = 10_000

const STATUS_BY_LIMIT = { 0: 'forbidden', 1: 'limited', 2: 'semiLimited' }
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026.9 TCG" → "2026-09"; "2013.10.11 TCG" → "2013-10-11". Una etiqueta que no empieza con año y mes no es una lista. */
export function listDate(header) {
  const match = /^(\d{4})\.(\d{1,2})(?:\.(\d{1,2}))?(?!\d)/.exec(header.trim())

  if (!match) {
    return null
  }

  return [match[1], match[2].padStart(2, '0'), match[3]?.padStart(2, '0')].filter(Boolean).join('-')
}

export const regionOf = (header) => (/\sTCG$/i.test(header.trim()) || UNLABELED_TCG.has(header.trim()) ? 'tcg' : 'ocg')

/** Todas las listas del archivo, en el orden en que vienen: { header, region, date, forbidden, limited, semiLimited } con los códigos de pasaporte. */
export function parseLflist(text) {
  const lists = []
  let current = null

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()

    if (line.startsWith('!')) {
      const header = line.slice(1).trim()
      const date = listDate(header)

      current = date ? { header, region: regionOf(header), date, forbidden: [], limited: [], semiLimited: [] } : null

      if (current) {
        lists.push(current)
      }
    } else if (current && /^\d+\s+[012](\s|$)/.test(line)) {
      const [code, limit] = line.split(/\s+/)

      current[STATUS_BY_LIMIT[limit]].push(Number(code))
    }
  }

  return lists
}

const monthKey = (region, date) => `${region}|${date.slice(0, 7)}`

/** Los títulos con que Yugipedia puede llamar a la página de una lista: "September 2026 Lists (TCG)", o sin la región las más viejas. */
export function wikiTitles(region, date) {
  const [year, month] = date.split('-')
  const base = `${MONTH_NAMES[Number(month) - 1]} ${year} Lists`

  return [`${base} (${region.toUpperCase()})`, base]
}

/**
 * De la página de una lista en Yugipedia a { region, date: AAAA-MM-DD }, el día en que entró en vigencia ("start_date = September 21, 2026", a veces con un
 * punto al final), o null si no tiene la plantilla (una página de desambiguación, por ejemplo).
 */
export function wikiListDate(text) {
  const field = (name) => new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n|]*)`).exec(text)?.[1]?.trim() ?? ''
  const start = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(field('start_date'))
  const month = MONTH_NAMES.findIndex((name) => name.toLowerCase() === start?.[1].toLowerCase())
  const region = field('medium').toLowerCase()

  if (!start || month < 0 || (region !== 'tcg' && region !== 'ocg')) {
    return null
  }

  return { region, date: `${start[3]}-${String(month + 1).padStart(2, '0')}-${start[2].padStart(2, '0')}` }
}

/** Las fechas con día que ya tiene el archivo escrito la vez anterior: región|AAAA-MM → AAAA-MM-DD. */
export function knownDates(text) {
  try {
    const { lists } = JSON.parse(text)

    return new Map(lists.filter((list) => list.date.length > 7).map((list) => [monthKey(list.region, list.date), list.date]))
  } catch {
    return new Map()
  }
}

/** Las listas que todavía tienen sólo el mes y no están en `known`. */
export const listsNeedingDay = (lists, known) => lists.filter((list) => list.date.length === 7 && !known.has(monthKey(list.region, list.date)))

/** Cambia la fecha de cada lista por la que trae `exact` (región|AAAA-MM → AAAA-MM-DD), si la tiene: el resto queda como está. */
export const withExactDates = (lists, exact) => lists.map((list) => ({ ...list, date: exact.get(monthKey(list.region, list.date)) ?? list.date }))

/** De cada código de imagen de YGOPRODeck (el de la carta y los de sus artes alternativos) a la carta: { id, name }. */
export function buildCardLookup(cards) {
  const lookup = new Map()

  for (const card of cards) {
    const entry = { id: card.id, name: card.name }

    lookup.set(card.id, entry)

    for (const image of card.card_images ?? []) {
      if (!lookup.has(image.id)) {
        lookup.set(image.id, entry)
      }
    }
  }

  return lookup
}

const byNumber = (a, b) => a - b

/**
 * Las listas con las cartas por su id de siempre (sin repetir y en orden) y los nombres de las que aparecen. Los códigos que YGOPRODeck no conoce
 * se descartan (se cuentan en `unknown`).
 */
export function buildBanlists(lists, lookup) {
  const names = new Map()
  const unknown = new Set()
  const resolve = (codes) =>
    [
      ...new Set(
        codes.flatMap((code) => {
          const card = lookup.get(code)

          if (!card) {
            unknown.add(code)
            return []
          }

          names.set(card.id, card.name)
          return [card.id]
        }),
      ),
    ].sort(byNumber)

  const built = lists
    .map((list) => ({ region: list.region, date: list.date, forbidden: resolve(list.forbidden), limited: resolve(list.limited), semiLimited: resolve(list.semiLimited) }))
    // Las más viejas primero dentro de cada región; con el mismo día, el orden del archivo (sort estable).
    .sort((a, b) => a.region.localeCompare(b.region) || a.date.localeCompare(b.date))

  return { lists: built, names: new Map([...names].sort((a, b) => a[0] - b[0])), unknown }
}

/** El archivo: una carta por línea y una lista por línea, para que git sólo vea lo que cambió. */
export function banlistsFile({ lists, names }, fetchedAt) {
  const lines = (entries) => entries.join(',\n')
  const cards = [...names].map(([id, name]) => `${JSON.stringify(String(id))}:${JSON.stringify(name)}`)
  const rows = lists.map((list) => JSON.stringify({ region: list.region, date: list.date, forbidden: list.forbidden, limited: list.limited, semiLimited: list.semiLimited }))

  return `{\n"fetchedAt":${JSON.stringify(fetchedAt)},\n"cards":{\n${lines(cards)}\n},\n"lists":[\n${lines(rows)}\n]\n}\n`
}

async function getText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })

  if (!response.ok) {
    throw new Error(`${response.status} ${url}`)
  }

  return response.text()
}

/**
 * Los días de Yugipedia de las listas pedidas (región|AAAA-MM → AAAA-MM-DD): de a 50 páginas, con las dos formas de nombrar la de cada lista; de cada una
 * se toma la que dice ser de esa región y de ese mes, así una página equivocada (o la de otra región del mismo mes) no cambia nada.
 */
async function fetchWikiDates(pending) {
  const titles = [...new Set(pending.flatMap((list) => wikiTitles(list.region, list.date)))]
  const wanted = new Set(pending.map((list) => monthKey(list.region, list.date)))
  const exact = new Map()

  for (let i = 0; i < titles.length; i += WIKI_BATCH) {
    const query = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvsection: '0',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      titles: titles.slice(i, i + WIKI_BATCH).join('|'),
    })
    const { query: result } = JSON.parse(await getText(`${YUGIPEDIA_API}?${query}`))

    for (const page of result.pages) {
      const found = page.missing ? null : wikiListDate(page.revisions?.[0]?.content ?? '')

      if (found && wanted.has(monthKey(found.region, found.date))) {
        exact.set(monthKey(found.region, found.date), found.date)
      }
    }
  }

  return exact
}

async function main() {
  const parsed = parseLflist(await getText(LFLIST_URL))
  const previous = await readFile(OUT_FILE, 'utf8').catch(() => null)
  const exact = knownDates(previous ?? '')
  const pending = listsNeedingDay(parsed, exact)

  if (pending.length > 0) {
    try {
      for (const [key, date] of await fetchWikiDates(pending)) {
        exact.set(key, date)
      }
    } catch (error) {
      console.warn(`Yugipedia no respondió (${error.message}): las listas nuevas quedan con el mes.`)
    }
  }

  const lists = withExactDates(parsed, exact)

  for (const region of ['tcg', 'ocg']) {
    const count = lists.filter((list) => list.region === region).length

    if (count < MIN_LISTS_PER_REGION) {
      throw new Error(`Sólo ${count} listas del ${region.toUpperCase()} en lflist.conf (se esperan al menos ${MIN_LISTS_PER_REGION}): no se escribe nada.`)
    }
  }

  const { data: cards } = JSON.parse(await getText(YGOPRODECK_CARDS))

  if (!Array.isArray(cards) || cards.length < MIN_CARDS) {
    throw new Error(`YGOPRODeck devolvió ${Array.isArray(cards) ? cards.length : 'nada'} cartas (se esperan más de ${MIN_CARDS}): no se escribe nada.`)
  }

  const built = buildBanlists(lists, buildCardLookup(cards))
  const total = new Set(lists.flatMap((list) => [...list.forbidden, ...list.limited, ...list.semiLimited])).size

  // Unas pocas cartas muy nuevas pueden no estar todavía en YGOPRODeck; muchas, no: es que algo cambió.
  if (built.unknown.size / total > 0.05) {
    throw new Error(`YGOPRODeck no conoce ${built.unknown.size} de ${total} códigos de las listas: no se escribe nada.`)
  }

  const content = banlistsFile(built, new Date().toISOString().slice(0, 10))

  // Si sólo cambió la fecha de la bajada no se reescribe: el commit diario no tiene por qué cambiar este archivo.
  if (previous && previous.replace(/"fetchedAt":"[^"]*"/, '') === content.replace(/"fetchedAt":"[^"]*"/, '')) {
    console.log(`Sin novedades: ${built.lists.length} listas.`)
    return
  }

  await writeFile(OUT_FILE, content)
  console.log(`Listo: ${built.lists.length} listas (${built.lists.filter((list) => list.region === 'tcg').length} del TCG y ${built.lists.filter((list) => list.region === 'ocg').length} del OCG) con ${built.names.size} cartas; ${built.unknown.size} códigos sin carta en YGOPRODeck.`)
}

// Se puede importar sin que corra (para los tests); como script, baja todo.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
