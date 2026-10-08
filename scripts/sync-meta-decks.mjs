import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createServer } from 'vite'

/**
 * Baja los Tournament Meta Decks de YGOPRODeck (las listas de torneo que el sitio carga a mano), se queda
 * con las hand traps del Main y el Side de cada uno y escribe src/data/meta-decks.json.
 * Lo corre todos los días el workflow sync-meta-decks; a mano: `npm run sync:meta`.
 */
const DECKS_ENDPOINT = 'https://ygoprodeck.com/api/decks/getDecks.php'
const CARDINFO_ENDPOINT = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const DECK_FORMAT = 'Tournament Meta Decks'
// El endpoint ignora `limit`: siempre son 20 por página, del más nuevo al más viejo.
const DECKS_PER_PAGE = 20
const MAX_PAGES = 120
const MAX_DECKS = 1500
/** Ocho semanas: lo que dura un meta entre banlists, y suficiente para ver la tendencia semana a semana. */
const WINDOW_DAYS = 56
const REQUEST_DELAY_MS = 300
const REQUEST_TIMEOUT_MS = 30_000
const CARDS_PER_REQUEST = 200
/** Una hand trap es genérica: la juegan al menos tantos arquetipos distintos, y no es el arquetipo del deck. */
const MIN_ARCHETYPES = 3
const MAX_ARCHETYPE_NAME_MATCH = 0.5
const MAX_COPIES_PER_CARD = 60
const MAX_CARDS_PER_ZONE = 100
const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/meta-decks.json')
const USER_AGENT = 'YGO Probability Lab sync (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'
const EXTRA_DECK_FRAMES = new Set(['fusion', 'synchro', 'xyz', 'link', 'fusion_pendulum', 'synchro_pendulum', 'xyz_pendulum'])
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
  const fetchedAt = new Date().toISOString().slice(0, 10)
  const cutoff = shiftDate(fetchedAt, -WINDOW_DAYS)
  const decks = await fetchRecentDecks(cutoff)
  console.log(`${decks.length} decks desde ${cutoff}`)

  const engine = await loadEngine()

  try {
    const cards = await fetchCards(engine.parser, uniqueCardIds(decks))
    const handtraps = pickHandtraps(engine.classification, decks, cards)
    const payload = buildPayload(fetchedAt, decks, handtraps)

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
    await writeFile(OUTPUT_PATH, formatPayload(payload), 'utf8')
    console.log(`${Object.keys(payload.cards).length} hand traps en ${payload.decks.length} decks: ${OUTPUT_PATH}`)
  } finally {
    await engine.close()
  }
}

// Decks

async function fetchRecentDecks(cutoff) {
  const decks = new Map()

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ format: DECK_FORMAT, offset: String(page * DECKS_PER_PAGE) })
    const items = await requestJson(`${DECKS_ENDPOINT}?${params}`)

    if (!Array.isArray(items) || items.length === 0) {
      break
    }

    const parsed = items.map(readDeck).filter(Boolean)

    // Si cambió el formato de la respuesta no se escribe un archivo vacío: el workflow falla y se ve.
    if (page === 0 && parsed.length === 0) {
      throw new Error('YGOPRODeck devolvió decks, pero ninguno con la forma esperada.')
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
    throw new Error('YGOPRODeck no devolvió Tournament Meta Decks dentro de la ventana.')
  }

  return [...decks.values()].sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)
}

function readDeck(raw) {
  if (!isRecord(raw) || raw.format !== DECK_FORMAT) {
    return null
  }

  const id = Number(raw.deckNum)
  const name = readText(raw.deck_name, 80)
  const date = readTournamentDate(raw.deck_description)
  const main = readCardList(raw.main_deck)
  const side = readCardList(raw.side_deck)

  if (!Number.isInteger(id) || id <= 0 || !name || !date || !main || !side) {
    return null
  }

  const players = Number(raw.tournamentPlayerCount)

  return {
    id,
    name,
    date,
    tournament: readText(raw.tournamentName, 120),
    placement: readText(raw.tournamentPlacement, 40),
    players: Number.isInteger(players) && players > 0 ? players : null,
    url: typeof raw.pretty_url === 'string' && /^[\w-]{1,120}$/.test(raw.pretty_url) ? raw.pretty_url : null,
    main,
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

// Cartas

function uniqueCardIds(decks) {
  const ids = new Set()

  for (const deck of decks) {
    for (const zone of [deck.main, deck.side]) {
      for (const id of zone.keys()) {
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

    await sleep(REQUEST_DELAY_MS)
  }

  return cards
}

/** Un id desconocido hace fallar la consulta entera: se parte el lote hasta aislarlo y se lo ignora. */
async function fetchCardChunk(parser, ids) {
  try {
    const payload = await requestJson(`${CARDINFO_ENDPOINT}?${new URLSearchParams({ id: ids.join(',') })}`)
    return parser.parseSearchResponse(payload).results
  } catch (error) {
    if (ids.length === 1) {
      console.warn(`Carta ${ids[0]} ignorada: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }

    const half = Math.ceil(ids.length / 2)
    return [...(await fetchCardChunk(parser, ids.slice(0, half))), ...(await fetchCardChunk(parser, ids.slice(half)))]
  }
}

/**
 * Hand traps según el clasificador de la app, con un filtro de genericidad: las que juegan varios
 * arquetipos y no llevan el nombre del deck (el clasificador también marca monstruos de engine con
 * efectos rápidos). Las artes alternativas se unifican por nombre en el id más chico.
 */
function pickHandtraps(classification, decks, cards) {
  const byName = new Map()

  for (const card of cards.values()) {
    if (EXTRA_DECK_FRAMES.has(card.frameType)) {
      continue
    }

    const group = byName.get(card.name) ?? { canonicalId: card.ygoprodeckId, card, ids: new Set(), deckNames: new Set() }
    group.ids.add(card.ygoprodeckId)

    if (card.ygoprodeckId < group.canonicalId) {
      group.canonicalId = card.ygoprodeckId
      group.card = card
    }

    byName.set(card.name, group)
  }

  const groupById = new Map()

  for (const group of byName.values()) {
    for (const id of group.ids) {
      groupById.set(id, group)
    }
  }

  for (const deck of decks) {
    for (const zone of [deck.main, deck.side]) {
      for (const id of zone.keys()) {
        groupById.get(id)?.deckNames.add(deck.name.toLowerCase())
      }
    }
  }

  const handtraps = new Map()

  for (const group of byName.values()) {
    const { card } = group
    const suggestion = classification.classifyCard(card, card.name)

    if (!suggestion.roles.includes('handtrap')) {
      continue
    }

    const known = classification.KNOWN_CARDS_MAP.get(classification.normalizeCardNameForLookup(card.name))
    const archetype = card.archetype?.toLowerCase() ?? ''
    const namedAfterArchetype = archetype
      ? [...group.deckNames].filter((deckName) => deckName.includes(archetype)).length / Math.max(1, group.deckNames.size)
      : 0
    const generic =
      suggestion.origin === 'non_engine' && group.deckNames.size >= MIN_ARCHETYPES && namedAfterArchetype < MAX_ARCHETYPE_NAME_MATCH

    if (known?.roles.includes('handtrap') || generic) {
      handtraps.set(group.canonicalId, { name: card.name, image: card.imageUrlSmall, ids: group.ids })
    }
  }

  return handtraps
}

// Salida

function buildPayload(fetchedAt, decks, handtraps) {
  const canonicalById = new Map()

  for (const [canonicalId, handtrap] of handtraps) {
    for (const id of handtrap.ids) {
      canonicalById.set(id, canonicalId)
    }
  }

  const cards = {}

  for (const [canonicalId, handtrap] of [...handtraps].sort((left, right) => left[0] - right[0])) {
    cards[String(canonicalId)] = { name: handtrap.name, image: handtrap.image }
  }

  return {
    fetchedAt,
    windowDays: WINDOW_DAYS,
    source: `https://ygoprodeck.com/deck-search/?format=${encodeURIComponent(DECK_FORMAT)}`,
    cards,
    decks: decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      date: deck.date,
      tournament: deck.tournament,
      placement: deck.placement,
      players: deck.players,
      url: deck.url,
      main: handtrapEntries(deck.main, canonicalById),
      side: handtrapEntries(deck.side, canonicalById),
    })),
  }
}

function handtrapEntries(zone, canonicalById) {
  const copies = new Map()

  for (const [id, count] of zone) {
    const canonicalId = canonicalById.get(id)

    if (canonicalId !== undefined) {
      copies.set(canonicalId, Math.min(MAX_COPIES_PER_CARD, (copies.get(canonicalId) ?? 0) + count))
    }
  }

  return [...copies].sort((left, right) => left[0] - right[0])
}

/** Un deck por línea: el diff diario se lee. */
function formatPayload({ decks, ...head }) {
  const headJson = JSON.stringify(head, null, 2)
  const deckLines = decks.map((deck) => `    ${JSON.stringify(deck)}`).join(',\n')

  return `${headJson.slice(0, -2)},\n  "decks": [\n${deckLines}\n  ]\n}\n`
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
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`${url} respondió ${response.status}`)
  }

  return response.json()
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
