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
 * Las listas nuevas aparecen en Yugipedia antes que en lflist.conf (que llega con días de atraso), y las del TCG se anuncian en partes durante varios días
 * (la página lleva `{{Incomplete}}` hasta que están todas). Por eso, después de leer lflist.conf se prueban las páginas de los tres meses siguientes a la
 * última lista de cada región: de cada una que exista se toman las cartas (los nombres de `forbidden`, `limited` y `semi_limited`, uno por línea y con
 * anotaciones tras `//`), se pasan a ids por nombre con el catálogo de YGOPRODeck y se agrega la lista, con `partial: true` si la página sigue incompleta.
 * Cuando lflist.conf trae la lista de ese mes, manda la suya y se descarta la de la wiki. Mientras no, el archivo anterior conserva la lista de la wiki si
 * Yugipedia no responde un día. Una carta que no se encuentra por nombre se descarta y se cuenta.
 *
 * La wiki tarda en tener cada parte del anuncio: `scripts/banlist-supplements.json` es un parche a mano para ese desfase. Cada entrada ({ region, month, note,
 * forbidden, limited, semiLimited, unlimited } con nombres de carta) pasa esas cartas al estado indicado en la lista de ese mes, mientras sea una lista de la wiki
 * que sigue incompleta; con la lista oficial de lflist.conf, o con la página ya completa, el parche se ignora. Aplicarlo dos veces da lo mismo.
 *
 * Lo corre todos los días el workflow sync-meta-decks; a mano: `npm run sync:banlists`.
 */
const LFLIST_URL = 'https://raw.githubusercontent.com/Fluorohydride/ygopro/master/lflist.conf'
const YUGIPEDIA_API = 'https://yugipedia.com/api.php'
const WIKI_BATCH = 50
/** Cuántos meses después de la última lista de lflist.conf se busca la página de una lista nueva en Yugipedia. */
const WIKI_AHEAD_MONTHS = 3
const YGOPRODECK_CARDS = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const SUPPLEMENTS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'banlist-supplements.json')
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

/** El mes (AAAA-MM) de la última lista de cada región. */
const latestMonths = (lists) => lists.reduce((latest, list) => latest.set(list.region, [latest.get(list.region) ?? '', list.date.slice(0, 7)].sort().at(-1)), new Map())

/** Los títulos de las páginas de Yugipedia de las listas que pueden venir después de la última de cada región: los `months` meses siguientes. */
export function upcomingWikiTitles(lists, months = WIKI_AHEAD_MONTHS) {
  return [...latestMonths(lists)].flatMap(([region, month]) => {
    const [year, number] = month.split('-').map(Number)

    return Array.from({ length: months }, (_, i) => wikiTitles(region, `${year + Math.floor((number + i) / 12)}-${String(((number + i) % 12) + 1).padStart(2, '0')}`)[0])
  })
}

/**
 * De la página de una lista en Yugipedia a { region, date, partial, forbidden, limited, semiLimited } con los NOMBRES de las cartas, o null si no tiene la
 * plantilla. Cada sección de la plantilla trae un nombre por línea, con anotaciones tras `//` ("Called by the Grave // prev::Limited") que se ignoran.
 * `partial`: la página lleva `{{Incomplete}}` (faltan partes del anuncio).
 */
export function wikiListCards(text) {
  const head = wikiListDate(text)

  if (!head) {
    return null
  }

  const section = (name) =>
    (new RegExp(String.raw`\|\s*${name}\s*=([\s\S]*?)(?=\n\s*\|\s*\w+\s*=|\n\s*\}\})`).exec(text)?.[1] ?? '')
      .split('\n')
      .map((line) => line.split('//')[0].trim())
      .filter(Boolean)

  return { ...head, partial: /\{\{\s*Incomplete\b/i.test(text), forbidden: section('forbidden'), limited: section('limited'), semiLimited: section('semi_limited') }
}

/** Para comparar nombres de Yugipedia con los de YGOPRODeck: sin tildes, mayúsculas, comillas curvas, ☆/★ y ♥/♡ (cada par igual) ni los < > de "Maliss <P> Dormouse". */
const looseName = (name) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[☆★]/g, '*')
    .replace(/[♥♡]/g, '^')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** De un nombre de carta (en inglés) a { id, name } de YGOPRODeck: primero el nombre exacto y, si no, parecido (una carta que se confunde con otra no se resuelve). */
export function buildNameLookup(cards) {
  const exact = new Map()
  const loose = new Map()

  for (const card of cards) {
    const key = looseName(card.name)

    exact.set(card.name, { id: card.id, name: card.name })
    loose.set(key, loose.has(key) && loose.get(key)?.id !== card.id ? null : { id: card.id, name: card.name })
  }

  return (name) => exact.get(name) ?? loose.get(looseName(name)) ?? undefined
}

/** La lista de la wiki con los ids de YGOPRODeck en lugar de los nombres (como una de lflist.conf), y los nombres que no encontró. */
export function resolveWikiList(wiki, find) {
  const unresolved = []
  const ids = (names) =>
    names.flatMap((name) => {
      const card = find(name)

      if (!card) {
        unresolved.push(name)
      }

      return card ? [card.id] : []
    })

  return {
    list: { region: wiki.region, date: wiki.date, partial: wiki.partial, forbidden: ids(wiki.forbidden), limited: ids(wiki.limited), semiLimited: ids(wiki.semiLimited) },
    unresolved,
  }
}

const listSize = (list) => list.forbidden.length + list.limited.length + list.semiLimited.length

/**
 * Las listas del archivo anterior que lflist.conf todavía no trae (las que vinieron de Yugipedia, con sus ids): si un día Yugipedia no responde, no
 * desaparecen. Se van solas cuando lflist.conf trae la lista de ese mes.
 */
export function carriedLists(text, lists) {
  const latest = latestMonths(lists)

  try {
    return JSON.parse(text).lists.filter((list) => list.date.slice(0, 7) > (latest.get(list.region) ?? '9999'))
  } catch {
    return []
  }
}

/**
 * Aplica los suplementos a mano a las listas de la wiki que siguen incompletas (`partial`): cada carta de un suplemento de esa región y mes (por nombre) sale
 * de los tres estados y entra en el que dice su sección (`unlimited` sólo la saca). Devuelve las listas, los nombres que no encontró y los suplementos que no
 * tocaron ninguna lista (el mes ya tiene su lista oficial o su página completa: se pueden borrar).
 */
export function applySupplements(lists, supplements, find) {
  const unresolved = []
  const used = new Set()
  const applied = lists.map((list) => {
    const matching = list.partial ? supplements.filter((supplement) => supplement.region === list.region && supplement.month === list.date.slice(0, 7)) : []
    const states = { forbidden: new Set(list.forbidden), limited: new Set(list.limited), semiLimited: new Set(list.semiLimited) }

    for (const supplement of matching) {
      used.add(supplement)

      for (const target of ['forbidden', 'limited', 'semiLimited', 'unlimited']) {
        for (const name of supplement[target] ?? []) {
          const card = find(name)

          if (!card) {
            unresolved.push(name)
            continue
          }

          Object.values(states).forEach((cards) => cards.delete(card.id))
          states[target]?.add(card.id)
        }
      }
    }

    return matching.length > 0 ? { ...list, forbidden: [...states.forbidden], limited: [...states.limited], semiLimited: [...states.semiLimited] } : list
  })

  return { lists: applied, unresolved, unused: supplements.filter((supplement) => !used.has(supplement)) }
}

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
    .map((list) => ({
      region: list.region,
      date: list.date,
      forbidden: resolve(list.forbidden),
      limited: resolve(list.limited),
      semiLimited: resolve(list.semiLimited),
      ...(list.partial ? { partial: true } : {}),
    }))
    // Las más viejas primero dentro de cada región; con el mismo día, el orden del archivo (sort estable).
    .sort((a, b) => a.region.localeCompare(b.region) || a.date.localeCompare(b.date))

  return { lists: built, names: new Map([...names].sort((a, b) => a[0] - b[0])), unknown }
}

/** El archivo: una carta por línea y una lista por línea, para que git sólo vea lo que cambió. */
export function banlistsFile({ lists, names }, fetchedAt) {
  const lines = (entries) => entries.join(',\n')
  const cards = [...names].map(([id, name]) => `${JSON.stringify(String(id))}:${JSON.stringify(name)}`)
  const rows = lists.map((list) =>
    JSON.stringify({ region: list.region, date: list.date, forbidden: list.forbidden, limited: list.limited, semiLimited: list.semiLimited, ...(list.partial ? { partial: true } : {}) }),
  )

  return `{\n"fetchedAt":${JSON.stringify(fetchedAt)},\n"cards":{\n${lines(cards)}\n},\n"lists":[\n${lines(rows)}\n]\n}\n`
}

async function getText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })

  if (!response.ok) {
    throw new Error(`${response.status} ${url}`)
  }

  return response.text()
}

/** El texto de la sección de arriba de cada página de Yugipedia que existe, de a 50 títulos. */
async function fetchWikiPages(titles) {
  const contents = []

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

    contents.push(...result.pages.filter((page) => !page.missing).map((page) => page.revisions?.[0]?.content ?? ''))
  }

  return contents
}

/**
 * Los días de Yugipedia de las listas pedidas (región|AAAA-MM → AAAA-MM-DD): de a 50 páginas, con las dos formas de nombrar la de cada lista; de cada una
 * se toma la que dice ser de esa región y de ese mes, así una página equivocada (o la de otra región del mismo mes) no cambia nada.
 */
async function fetchWikiDates(pending) {
  const titles = [...new Set(pending.flatMap((list) => wikiTitles(list.region, list.date)))]
  const wanted = new Set(pending.map((list) => monthKey(list.region, list.date)))
  const exact = new Map()

  for (const content of await fetchWikiPages(titles)) {
    const found = wikiListDate(content)

    if (found && wanted.has(monthKey(found.region, found.date))) {
      exact.set(monthKey(found.region, found.date), found.date)
    }
  }

  return exact
}

/** Los suplementos a mano; si el archivo no existe no hay ninguno, y si está mal escrito se avisa y se sigue sin ellos. */
async function readSupplements() {
  const text = await readFile(SUPPLEMENTS_FILE, 'utf8').catch(() => '[]')

  try {
    return JSON.parse(text)
  } catch (error) {
    console.warn(`banlist-supplements.json no es JSON válido (${error.message}): se ignora.`)
    return []
  }
}

/**
 * Las listas que lflist.conf todavía no trae, con las cartas ya como ids: las de Yugipedia (si no responde, las del archivo anterior) con los suplementos a
 * mano aplicados. Una página que da menos de la mitad de las cartas de la última lista de su región (vacía, de sólo los cambios, o con YGOPRODeck sin poder
 * resolver los nombres) no sirve para mostrar la lista entera y se salta.
 */
export async function fetchNewLists(lists, previous, find, supplements) {
  const latest = latestMonths(lists)
  const newest = (region) => lists.filter((list) => list.region === region).reduce((a, b) => (b.date > a.date ? b : a))
  const fresh = new Map()
  const unresolved = []

  try {
    for (const content of await fetchWikiPages(upcomingWikiTitles(lists))) {
      const wiki = wikiListCards(content)

      if (!wiki || wiki.date.slice(0, 7) <= (latest.get(wiki.region) ?? '9999')) {
        continue
      }

      const resolved = resolveWikiList(wiki, find)

      if (listSize(resolved.list) < listSize(newest(wiki.region)) / 2) {
        console.warn(`La lista ${wiki.region.toUpperCase()} ${wiki.date} de Yugipedia trae sólo ${listSize(resolved.list)} cartas: se salta.`)
        continue
      }

      fresh.set(monthKey(wiki.region, wiki.date), resolved.list)
      unresolved.push(...resolved.unresolved)
    }
  } catch (error) {
    console.warn(`Yugipedia no respondió (${error.message}): las listas nuevas quedan como en el archivo anterior.`)
  }

  const carried = carriedLists(previous ?? '', lists).filter((list) => !fresh.has(monthKey(list.region, list.date)))
  const supplemented = applySupplements([...fresh.values(), ...carried], supplements, find)

  for (const supplement of supplemented.unused) {
    console.log(`Suplemento sin efecto (ya hay lista oficial o la página está completa): ${supplement.region} ${supplement.month}${supplement.note ? ` · ${supplement.note}` : ''}.`)
  }

  return { lists: supplemented.lists, unresolved: [...unresolved, ...supplemented.unresolved] }
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

  const added = await fetchNewLists(lists, previous, buildNameLookup(cards), await readSupplements())
  const built = buildBanlists([...lists, ...added.lists], buildCardLookup(cards))
  const total = new Set(lists.flatMap((list) => [...list.forbidden, ...list.limited, ...list.semiLimited])).size

  // Unas pocas cartas muy nuevas pueden no estar todavía en YGOPRODeck; muchas, no: es que algo cambió.
  if (built.unknown.size / total > 0.05) {
    throw new Error(`YGOPRODeck no conoce ${built.unknown.size} de ${total} códigos de las listas: no se escribe nada.`)
  }

  for (const list of built.lists.filter((list) => added.lists.some((extra) => extra.region === list.region && extra.date === list.date))) {
    console.log(`Desde Yugipedia: ${list.region.toUpperCase()} ${list.date}${list.partial ? ' (en partes)' : ''}: ${list.forbidden.length} prohibidas, ${list.limited.length} limitadas, ${list.semiLimited.length} semi-limitadas.`)
  }

  if (added.unresolved.length > 0) {
    console.log(`Nombres que no se encontraron en YGOPRODeck (${added.unresolved.length}): ${added.unresolved.join(', ')}.`)
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
