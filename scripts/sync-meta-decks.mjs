import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createServer } from 'vite'

/**
 * Baja los Tournament Meta Decks de YGOPRODeck (las listas de torneo que el sitio carga a mano) y escribe:
 * - src/data/meta-decks.json: cada deck con sus datos de torneo y sólo sus hand traps (lo que lee el tier list).
 * - src/data/meta-decklists.json: las listas completas (Main, Extra y Side), que la app baja recién al abrir un deck.
 * Lo corre todos los días el workflow sync-meta-decks; a mano: `npm run sync:meta`.
 */
const DECKS_ENDPOINT = 'https://ygoprodeck.com/api/decks/getDecks.php'
const CARDINFO_ENDPOINT = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
/** Las dos categorías de torneo del sitio; cada deck queda etiquetado con su región. */
const DECK_FORMATS = [
  { region: 'tcg', format: 'Tournament Meta Decks' },
  { region: 'ocg', format: 'Tournament Meta Decks OCG' },
]
// El endpoint ignora `limit`: siempre son 20 por página, del más nuevo al más viejo.
const DECKS_PER_PAGE = 20
const MAX_PAGES = 120
const MAX_DECKS = 1500
/** Ocho semanas: lo que dura un meta entre banlists, y suficiente para ver la tendencia semana a semana. */
const WINDOW_DAYS = 56
const REQUEST_DELAY_MS = 300
const REQUEST_TIMEOUT_MS = 30_000
const REQUEST_ATTEMPTS = 3
const RETRY_DELAY_MS = 1500
const CARDS_PER_REQUEST = 200
/** Si falta más que esto de las cartas pedidas, algo anda mal con la API: mejor no escribir decks truncados. */
const MAX_UNKNOWN_CARD_RATIO = 0.005
/** Una hand trap es genérica: la juegan al menos tantos arquetipos distintos, y no es el arquetipo del deck. */
const MIN_ARCHETYPES = 3
const MAX_ARCHETYPE_NAME_MATCH = 0.5
const MAX_COPIES_PER_CARD = 60
const MAX_CARDS_PER_ZONE = 100
/** Tamaños legales: una lista cargada con menos de 40 en el Main (o más de 15 en Extra o Side) es un error del sitio y se descarta. */
const MAIN_DECK_SIZE = { min: 40, max: 60 }
const RAIL_DECK_MAX = 15
const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/meta-decks.json')
const DECKLISTS_PATH = path.resolve(process.cwd(), 'src/data/meta-decklists.json')
const USER_AGENT = 'YGO Probability Lab sync (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'
const EXTRA_DECK_FRAMES = new Set(['fusion', 'synchro', 'xyz', 'link', 'fusion_pendulum', 'synchro_pendulum', 'xyz_pendulum'])
const ZONES = ['main', 'extra', 'side']
const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

async function main() {
  // El instante completo en UTC: la app lo muestra en la hora del usuario (sólo la fecha en UTC podía ir un día adelantada).
  const fetchedAt = new Date().toISOString()
  // La app cuenta semanas enteras hacia atrás desde el snapshot: un deck de justo WINDOW_DAYS días atrás ya cae en la semana 9.
  const cutoff = shiftDate(fetchedAt, -(WINDOW_DAYS - 1))
  const decks = []

  for (const { region, format } of DECK_FORMATS) {
    const regionDecks = await fetchRecentDecks(format, region, cutoff)
    console.log(`${regionDecks.length} decks ${region.toUpperCase()} desde ${cutoff}`)
    decks.push(...regionDecks)
  }

  decks.sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)

  const engine = await loadEngine()

  try {
    const ids = uniqueCardIds(decks)
    const cards = await fetchCards(engine.parser, ids)
    const aliases = await resolveAliases(engine.parser, cards, ids)
    const unknown = ids.filter((id) => !cards.has(id) && !aliases.has(id))

    // Una carta que la API no conoce se omite de las listas; muchas seguidas es una falla de la API, no del dato.
    if (unknown.length > Math.max(2, ids.length * MAX_UNKNOWN_CARD_RATIO)) {
      throw new Error(`Faltan ${unknown.length} cartas de ${ids.length}; por ejemplo ${unknown.slice(0, 8).join(', ')}.`)
    }

    if (unknown.length > 0) {
      console.warn(`Cartas desconocidas para la API, omitidas: ${unknown.join(', ')}`)
    }

    const canonicalById = buildCanonicalIds(cards, aliases)
    const handtraps = pickHandtraps(engine.classification, decks, cards, canonicalById)
    const payload = buildPayload(fetchedAt, decks, handtraps, canonicalById)
    const decklists = buildDecklists(decks, canonicalById)

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
    await writeFile(OUTPUT_PATH, formatPayload(payload), 'utf8')
    await writeFile(DECKLISTS_PATH, formatDecklists(decklists), 'utf8')
    console.log(`${Object.keys(payload.cards).length} hand traps en ${payload.decks.length} decks: ${OUTPUT_PATH}`)
  } finally {
    await engine.close()
  }
}

// Decks

async function fetchRecentDecks(format, region, cutoff) {
  const decks = new Map()

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ format, offset: String(page * DECKS_PER_PAGE) })
    const items = await requestJson(`${DECKS_ENDPOINT}?${params}`)

    if (!Array.isArray(items) || items.length === 0) {
      break
    }

    const parsed = items.map((raw) => readDeck(raw, format, region)).filter(Boolean)

    // Si cambió el formato de la respuesta no se escribe un archivo vacío: el workflow falla y se ve.
    if (page === 0 && parsed.length === 0) {
      throw new Error(`YGOPRODeck devolvió decks de "${format}", pero ninguno con la forma esperada.`)
    }

    for (const deck of parsed) {
      if (deck.date >= cutoff) {
        decks.set(deck.id, deck)
      }
    }

    // La lista viene por fecha de carga: cuando una página entera es anterior a la ventana, ya no hay más.
    if (parsed.every((deck) => deck.date < cutoff) || decks.size >= MAX_DECKS) {
      break
    }

    await sleep(REQUEST_DELAY_MS)
  }

  if (decks.size === 0) {
    throw new Error(`YGOPRODeck no devolvió decks de "${format}" dentro de la ventana.`)
  }

  return [...decks.values()]
}

function readDeck(raw, format, region) {
  if (!isRecord(raw) || raw.format !== format) {
    return null
  }

  const id = Number(raw.deckNum)
  const name = readText(raw.deck_name, 80)
  const date = readTournamentDate(raw.deck_description)
  const main = readCardList(raw.main_deck)
  const extra = readCardList(raw.extra_deck)
  const side = readCardList(raw.side_deck)

  if (!Number.isInteger(id) || id <= 0 || !name || !date || !main || !extra || !side) {
    return null
  }

  const mainSize = countCards(main)

  if (mainSize < MAIN_DECK_SIZE.min || mainSize > MAIN_DECK_SIZE.max || countCards(extra) > RAIL_DECK_MAX || countCards(side) > RAIL_DECK_MAX) {
    console.warn(`Deck ${id} (${name}) descartado: ${mainSize} en Main, ${countCards(extra)} en Extra, ${countCards(side)} en Side.`)
    return null
  }

  const players = Number(raw.tournamentPlayerCount)
  const cover = Number(raw.cover_card)

  return {
    id,
    region,
    name,
    date,
    tournament: readText(raw.tournamentName, 120),
    placement: readText(raw.tournamentPlacement, 40),
    players: Number.isInteger(players) && players > 0 ? players : null,
    player: readText(raw.tournamentPlayerName, 80),
    cover: Number.isInteger(cover) && cover > 0 ? cover : null,
    url: typeof raw.pretty_url === 'string' && /^[\w-]{1,120}$/.test(raw.pretty_url) ? raw.pretty_url : null,
    main,
    extra,
    side,
  }
}

/** La fecha exacta sólo viene en la descripción: "Tournament: YCS Guayaquil &ndash; October 3rd 2026". */
function readTournamentDate(description) {
  if (typeof description !== 'string') {
    return null
  }

  const match = /Tournament:[^<]*?(?:&ndash;|&#8211;|–|-)\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(description)

  if (!match) {
    return null
  }

  const month = MONTHS[match[1].toLowerCase()]
  const day = Number(match[2])
  const year = Number(match[3])

  if (!month || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return null
  }

  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return Number.isNaN(Date.parse(date)) ? null : date
}

/** Las zonas vienen como string JSON con los ids repetidos por copia: '["123","123","456"]'. */
function readCardList(value) {
  let ids

  try {
    ids = JSON.parse(value)
  } catch {
    return null
  }

  if (!Array.isArray(ids) || ids.length > MAX_CARDS_PER_ZONE) {
    return null
  }

  const copies = new Map()

  for (const entry of ids) {
    const id = Number(entry)

    if (!Number.isInteger(id) || id <= 0) {
      return null
    }

    copies.set(id, (copies.get(id) ?? 0) + 1)
  }

  return copies
}

function countCards(zone) {
  let total = 0

  for (const count of zone.values()) {
    total += count
  }

  return total
}

// Cartas

function uniqueCardIds(decks) {
  const ids = new Set()

  for (const deck of decks) {
    for (const zone of ZONES) {
      for (const id of deck[zone].keys()) {
        ids.add(id)
      }
    }
  }

  return [...ids]
}

async function fetchCards(parser, ids) {
  const cards = new Map()

  for (let start = 0; start < ids.length; start += CARDS_PER_REQUEST) {
    for (const card of await fetchCardChunk(parser, ids.slice(start, start + CARDS_PER_REQUEST))) {
      cards.set(card.ygoprodeckId, card)
    }
  }

  return cards
}

/**
 * Un id desconocido hace fallar la consulta entera (400): se parte el lote hasta aislarlo y se lo omite.
 * Cualquier otra falla se reintenta y, si persiste, corta el sync: una carta que existe nunca se descarta en silencio.
 */
async function fetchCardChunk(parser, ids) {
  await sleep(REQUEST_DELAY_MS)

  const response = await requestWithRetry(`${CARDINFO_ENDPOINT}?${new URLSearchParams({ id: ids.join(',') })}`)

  if (response.ok) {
    return parser.parseSearchResponse(response.payload).results
  }

  if (ids.length === 1) {
    return []
  }

  const half = Math.ceil(ids.length / 2)
  return [...(await fetchCardChunk(parser, ids.slice(0, half))), ...(await fetchCardChunk(parser, ids.slice(half)))]
}

/**
 * En una consulta de varios ids la API funde las artes alternativas en una sola carta y devuelve los ids de
 * prelanzamiento del OCG con el id definitivo: los ids pedidos que no vinieron se consultan de a uno y se
 * anotan como alias del id que la API devuelve para ellos.
 */
async function resolveAliases(parser, cards, ids) {
  const aliases = new Map()

  for (const id of ids.filter((requested) => !cards.has(requested))) {
    const [card] = await fetchCardChunk(parser, [id])

    if (card) {
      cards.set(card.ygoprodeckId, card)
      aliases.set(id, card.ygoprodeckId)
    }
  }

  return aliases
}

/** Las artes alternativas tienen otro id: cada nombre se unifica en el id más chico. Un id desconocido no aparece. */
function buildCanonicalIds(cards, aliases) {
  const smallestByName = new Map()

  for (const card of cards.values()) {
    const current = smallestByName.get(card.name)

    if (current === undefined || card.ygoprodeckId < current) {
      smallestByName.set(card.name, card.ygoprodeckId)
    }
  }

  const canonicalById = new Map([...cards.values()].map((card) => [card.ygoprodeckId, smallestByName.get(card.name)]))

  for (const [requestedId, actualId] of aliases) {
    canonicalById.set(requestedId, canonicalById.get(actualId))
  }

  return canonicalById
}

/**
 * Hand traps según el clasificador de la app, con un filtro de genericidad: las que juegan varios
 * arquetipos y no llevan el nombre del deck (el clasificador también marca monstruos de engine con
 * efectos rápidos). Las del listado conocido entran siempre.
 */
function pickHandtraps(classification, decks, cards, canonicalById) {
  const deckNamesByCard = new Map()

  for (const deck of decks) {
    for (const zone of ['main', 'side']) {
      for (const id of deck[zone].keys()) {
        const canonicalId = canonicalById.get(id)

        if (canonicalId !== undefined) {
          const names = deckNamesByCard.get(canonicalId) ?? new Set()
          names.add(deck.name.toLowerCase())
          deckNamesByCard.set(canonicalId, names)
        }
      }
    }
  }

  const handtraps = new Map()

  for (const card of cards.values()) {
    const deckNames = deckNamesByCard.get(card.ygoprodeckId)

    // Sólo la carta canónica de cada nombre, y sólo las que van en Main o Side.
    if (canonicalById.get(card.ygoprodeckId) !== card.ygoprodeckId || !deckNames || EXTRA_DECK_FRAMES.has(card.frameType)) {
      continue
    }

    const suggestion = classification.classifyCard(card, card.name)

    if (!suggestion.roles.includes('handtrap')) {
      continue
    }

    const known = classification.KNOWN_CARDS_MAP.get(classification.normalizeCardNameForLookup(card.name))
    const archetype = card.archetype?.toLowerCase() ?? ''
    const namedAfterArchetype = archetype ? [...deckNames].filter((deckName) => deckName.includes(archetype)).length / deckNames.size : 0
    const generic = suggestion.origin === 'non_engine' && deckNames.size >= MIN_ARCHETYPES && namedAfterArchetype < MAX_ARCHETYPE_NAME_MATCH

    if (known?.roles.includes('handtrap') || generic) {
      // El estado en las banlists de hoy: una carta prohibida no va al tier list de esa región aunque los decks viejos la lleven.
      handtraps.set(card.ygoprodeckId, { name: card.name, image: card.imageUrlSmall, ban: { tcg: card.banlist.tcg, ocg: card.banlist.ocg } })
    }
  }

  return handtraps
}

// Salida

function buildPayload(fetchedAt, decks, handtraps, canonicalById) {
  const cards = {}

  for (const [canonicalId, handtrap] of [...handtraps].sort((left, right) => left[0] - right[0])) {
    cards[String(canonicalId)] = handtrap
  }

  return {
    fetchedAt,
    windowDays: WINDOW_DAYS,
    source: 'https://ygoprodeck.com/deck-search/',
    cards,
    decks: decks.map((deck) => ({
      id: deck.id,
      region: deck.region,
      name: deck.name,
      date: deck.date,
      tournament: deck.tournament,
      placement: deck.placement,
      players: deck.players,
      player: deck.player,
      cover: deck.cover,
      url: deck.url,
      main: zoneEntries(deck.main, canonicalById, handtraps),
      side: zoneEntries(deck.side, canonicalById, handtraps),
    })),
  }
}

function buildDecklists(decks, canonicalById) {
  const decklists = {}

  for (const deck of decks) {
    decklists[String(deck.id)] = {
      main: zoneEntries(deck.main, canonicalById),
      extra: zoneEntries(deck.extra, canonicalById),
      side: zoneEntries(deck.side, canonicalById),
    }
  }

  return decklists
}

/** [id canónico, copias] en el orden de la lista original; con `only` se queda sólo con esos ids. */
function zoneEntries(zone, canonicalById, only = null) {
  const copies = new Map()

  for (const [id, count] of zone) {
    const canonicalId = canonicalById.get(id)

    if (canonicalId !== undefined && (only === null || only.has(canonicalId))) {
      copies.set(canonicalId, Math.min(MAX_COPIES_PER_CARD, (copies.get(canonicalId) ?? 0) + count))
    }
  }

  return [...copies]
}

/** Un deck por línea: el diff diario se lee. */
function formatPayload({ decks, ...head }) {
  const headJson = JSON.stringify(head, null, 2)
  const deckLines = decks.map((deck) => `    ${JSON.stringify(deck)}`).join(',\n')

  return `${headJson.slice(0, -2)},\n  "decks": [\n${deckLines}\n  ]\n}\n`
}

function formatDecklists(decklists) {
  const lines = Object.entries(decklists).map(([id, zones]) => `  ${JSON.stringify(id)}: ${JSON.stringify(zones)}`)
  return `{\n${lines.join(',\n')}\n}\n`
}

// Utilidades

/** El clasificador y el parser de la app son TypeScript: Vite los carga sin compilarlos aparte. */
async function loadEngine() {
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
  })

  try {
    const [classification, parser] = await Promise.all([
      server.ssrLoadModule('/src/app/classification-engine.ts'),
      server.ssrLoadModule('/src/ygoprodeck/parser.ts'),
    ])

    return { classification, parser, close: () => server.close() }
  } catch (error) {
    await server.close()
    throw error
  }
}

async function requestJson(url) {
  const response = await requestWithRetry(url)

  if (!response.ok) {
    throw new Error(`${url} respondió ${response.status}`)
  }

  return response.payload
}

/**
 * Un 400 es un pedido inválido (p. ej. un id que no existe) y se devuelve como tal; cualquier otra falla
 * (red, 429, 5xx) se reintenta con una pausa y, si persiste, se lanza.
 */
async function requestWithRetry(url) {
  for (let attempt = 1; ; attempt += 1) {
    let response

    try {
      response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (attempt >= REQUEST_ATTEMPTS) {
        throw error
      }

      await sleep(RETRY_DELAY_MS * attempt)
      continue
    }

    if (response.ok) {
      return { ok: true, status: response.status, payload: await response.json() }
    }

    if (response.status === 400) {
      return { ok: false, status: response.status, payload: null }
    }

    if (attempt >= REQUEST_ATTEMPTS) {
      throw new Error(`${url} respondió ${response.status}`)
    }

    await sleep(RETRY_DELAY_MS * attempt)
  }
}

function readText(value, maxLength) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text ? text.slice(0, maxLength) : null
}

function shiftDate(date, days) {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
