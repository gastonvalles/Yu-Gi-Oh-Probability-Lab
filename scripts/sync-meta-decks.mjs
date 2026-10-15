import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createServer } from 'vite'

/**
 * Baja los Tournament Meta Decks de YGOPRODeck (las listas de torneo que el sitio carga a mano) y escribe:
 * - src/data/meta-decks.json: cada deck con sus datos de torneo y sólo sus hand traps y boardbreakers (lo que leen los tier lists de
 *   cartas).
 * - src/data/meta-decklists.json: las listas completas (Main, Extra y Side), que la app baja recién al abrir un deck.
 * - src/data/card-rules.json: qué puede hacer cada carta según sus reglas (los scripts de EDOPro leídos por
 *   src/app/card-script-rules.ts), para el clasificador de la app y para saber qué carta es hand trap.
 * Lo corre todos los días el workflow sync-meta-decks; a mano: `npm run sync:meta`.
 */
const DECKS_ENDPOINT = 'https://ygoprodeck.com/api/decks/getDecks.php'
const CARDINFO_ENDPOINT = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
/** Los scripts de EDOPro (Project Ignis): un clon superficial en una carpeta temporal; CARD_SCRIPTS_DIR la cambia. */
const CARD_SCRIPTS_REPO = 'https://github.com/ProjectIgnis/CardScripts.git'
const CARD_SCRIPTS_DIR = process.env.CARD_SCRIPTS_DIR ?? path.join(os.tmpdir(), 'ygo-lab-card-scripts')
/** Cartas publicadas y anunciadas; `unofficial` son las de anime y similares. */
const CARD_SCRIPT_DIRS = ['official', 'pre-release']
/**
 * Excepciones al criterio de reglas, por nombre: `false` saca una carta que por reglas se activa desde la mano pero
 * nadie usa como hand trap; `true` mete una que las reglas no reconocen (el filtro de genericidad se aplica igual).
 */
const HANDTRAP_OVERRIDES = new Map([['Evenly Matched', false]])
/** Con menos hand traps que esto cambió algo en los scripts o en su lectura: mejor fallar que publicar un tier list vacío. */
const MIN_HANDTRAPS = 10
/**
 * Excepciones al criterio de reglas de los boardbreakers, por nombre. El criterio es el del clasificador (isBoardbreakerRules) más que no mencione
 * a su paquete (las piezas de engine que rompen algo no son boardbreakers genéricos).
 * `false` saca una que por reglas le pega al campo del rival pero nadie cuenta como boardbreaker; `true` mete una que las reglas no leen
 * así (las Quick-Play y trampas de siempre) y no pasa por el filtro de genericidad: son cartas que cualquier deck puede llevar.
 */
const BOARDBREAKER_OVERRIDES = new Map([
  ['Pot of Sloth', false],
  ['Triple Tactics Thrust', false],
  ['Contact "C"', false],
  ['Fantastical Dragon Phantazmay', false],
  ['Fydraulis Harmonia', false],
  ['Phara the Primordial Goddess', false],
  ['Fairy Tail - Luna', false],
  ['Nibiru, the Primal Being', true],
  ['Gameciel, the Sea Turtle Kaiju', true],
  ['Thunder King, the Lightningstrike Kaiju', true],
  ['Dogoran, the Mad Flame Kaiju', true],
  ['Gadarla, the Mystery Dust Kaiju', true],
  ['Kumongous, the Sticky String Kaiju', true],
  ['Radian, the Multidimensional Kaiju', true],
  ['Mystical Space Typhoon', true],
  ['Twin Twisters', true],
  ['Cosmic Cyclone', true],
  ['Galaxy Cyclone', true],
  ['Dark Hole', true],
  ['Dark Ruler No More', true],
  ['Forbidden Droplet', true],
  ['Super Polymerization', true],
  ['Book of Eclipse', true],
  ['Torrential Tribute', true],
  ['Compulsory Evacuation Device', true],
  ['Change of Heart', true],
  ['Mind Control', true],
])
const MIN_BOARDBREAKERS = 8
/**
 * De los boardbreakers, los que salen de las reglas y no de BOARDBREAKER_OVERRIDES (hoy son 14): las excepciones solas ya pasan de MIN_BOARDBREAKERS,
 * así que sin este piso las reglas podrían dejar de leer los scripts sin que nada falle.
 */
const MIN_RULE_BOARDBREAKERS = 5
/** Con menos que este tanto de los decks de la corrida anterior (la ventana es la misma y los decks se suman de a pocos por día) la API devolvió una lista cortada. */
const MIN_DECKS_VS_PREVIOUS = 0.5
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
/** Una hand trap es genérica: la juegan al menos tantos decks distintos, y no es el arquetipo del deck (la ayuda del Meta lo dice así). */
const MIN_ARCHETYPES = 3
const MAX_ARCHETYPE_NAME_MATCH = 0.5
const MAX_COPIES_PER_CARD = 60
const MAX_CARDS_PER_ZONE = 100
/** Tamaños legales: una lista cargada con menos de 40 en el Main (o más de 15 en Extra o Side) es un error del sitio y se descarta. */
const MAIN_DECK_SIZE = { min: 40, max: 60 }
const RAIL_DECK_MAX = 15
const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/meta-decks.json')
const DECKLISTS_PATH = path.resolve(process.cwd(), 'src/data/meta-decklists.json')
const CARD_RULES_PATH = path.resolve(process.cwd(), 'src/data/card-rules.json')
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
  const scripts = syncCardScripts()
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
    const deckNames = deckNamesByCard(decks, canonicalById)
    const genericIds = pickGenericCards(cards, canonicalById, deckNames)
    const handtraps = pickHandtraps(engine.rules, scripts.dir, cards, aliases, canonicalById, deckNames, genericIds)
    const boardbreakers = pickBoardbreakers(engine.rules, scripts.dir, cards, aliases, canonicalById, deckNames, genericIds)
    const payload = buildPayload(fetchedAt, decks, trackCards(handtraps, boardbreakers), canonicalById)
    const decklists = buildDecklists(decks, canonicalById)
    const cardRules = buildCardRules(engine.rules, scripts, cards, aliases, genericIds)

    assertPayload(payload, readPreviousDeckCount())

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
    await writeFile(OUTPUT_PATH, formatPayload(payload), 'utf8')
    await writeFile(DECKLISTS_PATH, formatDecklists(decklists), 'utf8')
    await writeFile(CARD_RULES_PATH, formatCardRules(cardRules), 'utf8')
    console.log(`${handtraps.size} hand traps y ${boardbreakers.size} boardbreakers en ${payload.decks.length} decks: ${OUTPUT_PATH}`)
    console.log(`${cardRules.count} cartas con reglas (${genericIds.size} genéricas): ${CARD_RULES_PATH}`)
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
 * Hand traps por reglas (src/app/card-script-rules.ts sobre el script de cada carta) con un filtro de genericidad
 * sobre los decklists: las que juegan varios decks distintos y no llevan el nombre del deck, porque un monstruo
 * de engine también puede tener un efecto rápido desde la mano. Las excepciones a mano van en HANDTRAP_OVERRIDES.
 */
function pickHandtraps(rules, scriptsDir, cards, aliases, canonicalById, deckNames, genericIds) {
  const idsByName = cardIdsByName(cards, aliases)
  const handtraps = new Map()
  const engineOnly = []
  let withoutScript = 0

  for (const card of cards.values()) {
    const names = deckNames.get(card.ygoprodeckId)

    // Sólo la carta canónica de cada nombre, y sólo las que van en Main o Side.
    if (canonicalById.get(card.ygoprodeckId) !== card.ygoprodeckId || !names || EXTRA_DECK_FRAMES.has(card.frameType)) {
      continue
    }

    let handtrap = HANDTRAP_OVERRIDES.get(card.name)

    if (handtrap === undefined) {
      const lua = readCardScript(scriptsDir, idsByName.get(card.name) ?? [card.ygoprodeckId])

      // Los monstruos normales no tienen script; sin script no hay efecto desde la mano.
      if (lua === null) {
        withoutScript += 1
        continue
      }

      handtrap = rules.isHandtrapScript(lua)
    }

    if (!handtrap) {
      continue
    }

    if (!genericIds.has(card.ygoprodeckId)) {
      engineOnly.push(`${card.name} (${names.size})`)
      continue
    }

    // El estado en las banlists de hoy: una carta prohibida no va al tier list de esa región aunque los decks viejos la lleven.
    handtraps.set(card.ygoprodeckId, { name: card.name, image: card.imageUrlSmall, ban: { tcg: card.banlist.tcg, ocg: card.banlist.ocg } })
  }

  if (handtraps.size < MIN_HANDTRAPS) {
    throw new Error(`Sólo ${handtraps.size} hand traps: ¿cambió la forma de los scripts en ${scriptsDir}?`)
  }

  console.log(`${withoutScript} cartas sin script. Con efecto desde la mano pero de un solo deck o de su arquetipo (afuera): ${engineOnly.join(', ')}`)
  return handtraps
}

/**
 * Boardbreakers por reglas (isBoardbreakerRules sobre los bits de cada script: le sacan cartas al rival del campo, o le dan monstruos), con el
 * mismo filtro de genericidad que las hand traps: las que juegan varios decks distintos y no son de su arquetipo.
 */
function pickBoardbreakers(rules, scriptsDir, cards, aliases, canonicalById, deckNames, genericIds) {
  const idsByName = cardIdsByName(cards, aliases)
  const boardbreakers = new Map()
  let byRules = 0

  for (const card of cards.values()) {
    // Sólo la carta canónica de cada nombre, y que vaya en Main o Side.
    if (canonicalById.get(card.ygoprodeckId) !== card.ygoprodeckId || !deckNames.has(card.ygoprodeckId) || EXTRA_DECK_FRAMES.has(card.frameType)) {
      continue
    }

    let boardbreaker = BOARDBREAKER_OVERRIDES.get(card.name)

    // Por reglas, y sólo las genéricas: las que juegan varios decks distintos y no mencionan a su paquete.
    if (boardbreaker === undefined && genericIds.has(card.ygoprodeckId)) {
      const lua = readCardScript(scriptsDir, idsByName.get(card.name) ?? [card.ygoprodeckId])
      const flags = lua === null ? 0 : rules.cardRuleFlags(lua)

      boardbreaker = (flags & rules.CARD_RULE.mentions) === 0 && rules.isBoardbreakerRules(flags, isPlainSpell(card))
      byRules += boardbreaker ? 1 : 0
    }

    if (boardbreaker) {
      boardbreakers.set(card.ygoprodeckId, { name: card.name, image: card.imageUrlSmall, ban: { tcg: card.banlist.tcg, ocg: card.banlist.ocg } })
    }
  }

  if (boardbreakers.size < MIN_BOARDBREAKERS || byRules < MIN_RULE_BOARDBREAKERS) {
    throw new Error(`Sólo ${boardbreakers.size} boardbreakers (${byRules} por reglas): ¿cambió la forma de los scripts en ${scriptsDir}?`)
  }

  console.log(`Boardbreakers: ${[...boardbreakers.values()].map((card) => card.name).sort().join(', ')}`)
  return boardbreakers
}

/** Una magia que no es de juego rápido (el clasificador la lee igual: la API trae "Spell Card" en el tipo y "Quick-Play", "Field"... en race). */
function isPlainSpell(card) {
  return /spell/i.test(card.cardType) && !/quick-play/i.test(`${card.race ?? ''} ${card.cardType}`)
}

/** Las cartas que llevan los tier lists, con lo que son: una carta puede ser hand trap y boardbreaker a la vez (Nibiru). */
function trackCards(handtraps, boardbreakers) {
  const tracked = new Map()

  for (const [kind, cards] of [
    ['handtrap', handtraps],
    ['boardbreaker', boardbreakers],
  ]) {
    for (const [id, card] of cards) {
      tracked.set(id, { ...card, kinds: [...(tracked.get(id)?.kinds ?? []), kind] })
    }
  }

  return tracked
}

/** Los nombres de deck (en minúsculas) que llevan cada carta en Main o Side, por id canónico. */
function deckNamesByCard(decks, canonicalById) {
  const namesByCard = new Map()

  for (const deck of decks) {
    for (const zone of ['main', 'side']) {
      for (const id of deck[zone].keys()) {
        const canonicalId = canonicalById.get(id)

        if (canonicalId !== undefined) {
          const names = namesByCard.get(canonicalId) ?? new Set()
          names.add(deck.name.toLowerCase())
          namesByCard.set(canonicalId, names)
        }
      }
    }
  }

  return namesByCard
}

/**
 * Cartas genéricas: las juegan al menos MIN_ARCHETYPES decks distintos y no llevan el nombre del deck.
 * Deciden qué hand trap va al tier list y, en el clasificador, que una carta es non-engine.
 */
function pickGenericCards(cards, canonicalById, deckNames) {
  const generic = new Set()

  for (const card of cards.values()) {
    const names = deckNames.get(card.ygoprodeckId)

    if (canonicalById.get(card.ygoprodeckId) !== card.ygoprodeckId || !names || names.size < MIN_ARCHETYPES) {
      continue
    }

    const archetype = card.archetype?.toLowerCase() ?? ''
    const namedAfterArchetype = archetype ? [...names].filter((deckName) => deckName.includes(archetype)).length / names.size : 0

    if (namedAfterArchetype < MAX_ARCHETYPE_NAME_MATCH) {
      generic.add(card.ygoprodeckId)
    }
  }

  return generic
}

/** Los ids de cada nombre: las artes alternativas y los ids de prelanzamiento no tienen script propio. */
function cardIdsByName(cards, aliases) {
  const idsByName = new Map()

  for (const card of cards.values()) {
    idsByName.set(card.name, [...(idsByName.get(card.name) ?? []), card.ygoprodeckId])
  }

  for (const [requestedId, actualId] of aliases) {
    const name = cards.get(actualId)?.name

    if (name) {
      idsByName.get(name).push(requestedId)
    }
  }

  return idsByName
}

/** Clona los scripts, o los pone al día si ya están, y devuelve la carpeta y el commit. */
function syncCardScripts() {
  const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim()

  if (existsSync(path.join(CARD_SCRIPTS_DIR, '.git'))) {
    git('-C', CARD_SCRIPTS_DIR, 'fetch', '-q', '--depth', '1', 'origin', 'master')
    git('-C', CARD_SCRIPTS_DIR, 'reset', '-q', '--hard', 'FETCH_HEAD')
  } else {
    git('clone', '-q', '--depth', '1', '--single-branch', '--branch', 'master', CARD_SCRIPTS_REPO, CARD_SCRIPTS_DIR)
  }

  const commit = git('-C', CARD_SCRIPTS_DIR, 'rev-parse', '--short', 'HEAD')
  console.log(`Scripts de EDOPro ${commit} en ${CARD_SCRIPTS_DIR}`)
  return { dir: CARD_SCRIPTS_DIR, commit }
}

/** El script de la carta por cualquiera de sus ids, o null si no tiene. */
function readCardScript(scriptsDir, ids) {
  for (const id of ids) {
    for (const dir of CARD_SCRIPT_DIRS) {
      const file = path.join(scriptsDir, dir, `c${id}.lua`)

      if (existsSync(file)) {
        return readFileSync(file, 'utf8')
      }
    }
  }

  return null
}

/**
 * Los bits de CARD_RULE de cada carta con script (publicadas y anunciadas), más `generic` en las que los decks
 * de torneo juegan en cualquier arquetipo. Agrupado por valor de bits: pesa menos y el diff diario se lee.
 */
function buildCardRules(rules, scripts, cards, aliases, genericIds) {
  const flagsById = new Map()
  const listedNamesById = new Map()

  for (const dir of CARD_SCRIPT_DIRS) {
    const folder = path.join(scripts.dir, dir)

    for (const file of readdirSync(folder)) {
      const id = Number(/^c(\d+)\.lua$/.exec(file)?.[1])

      if (id > 0 && !flagsById.has(id)) {
        const lua = readFileSync(path.join(folder, file), 'utf8')
        flagsById.set(id, rules.cardRuleFlags(lua))
        listedNamesById.set(id, rules.readCardScript(lua).listedNames)
      }
    }
  }

  // Qué cartas nombra cada script: ids sueltos o constantes (CARD_ALBAZ) de los archivos de utilidades.
  const constants = new Map()

  for (const file of readdirSync(scripts.dir).filter((name) => name.endsWith('.lua'))) {
    for (const match of readFileSync(path.join(scripts.dir, file), 'utf8').matchAll(/^(CARD_\w+)\s*=\s*(\d+)/gm)) {
      constants.set(match[1], Number(match[2]))
    }
  }

  for (const [id, listedNames] of listedNamesById) {
    for (const token of listedNames) {
      const referencedId = /^\d+$/.test(token) ? Number(token) : constants.get(token)

      if (referencedId !== undefined && referencedId !== id && flagsById.has(referencedId)) {
        flagsById.set(referencedId, flagsById.get(referencedId) | rules.CARD_RULE.referenced)
      }
    }
  }

  const idsByName = cardIdsByName(cards, aliases)

  for (const id of genericIds) {
    for (const candidate of idsByName.get(cards.get(id)?.name) ?? [id]) {
      if (flagsById.has(candidate)) {
        flagsById.set(candidate, flagsById.get(candidate) | rules.CARD_RULE.generic)
      }
    }
  }

  const groups = new Map()

  for (const [id, flags] of flagsById) {
    groups.set(flags, [...(groups.get(flags) ?? []), id])
  }

  const entries = [...groups].sort((left, right) => left[0] - right[0]).map(([flags, ids]) => [String(flags), ids.sort((left, right) => left - right)])
  return { scripts: scripts.commit, cards: Object.fromEntries(entries), count: flagsById.size }
}

function formatCardRules({ scripts, cards }) {
  const lines = Object.entries(cards).map(([flags, ids]) => `    ${JSON.stringify(flags)}: ${JSON.stringify(ids)}`)
  return `{\n  "scripts": ${JSON.stringify(scripts)},\n  "cards": {\n${lines.join(',\n')}\n  }\n}\n`
}

// Salida

function buildPayload(fetchedAt, decks, tracked, canonicalById) {
  const cards = {}

  for (const [canonicalId, card] of [...tracked].sort((left, right) => left[0] - right[0])) {
    cards[String(canonicalId)] = card
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
      main: zoneEntries(deck.main, canonicalById, tracked),
      side: zoneEntries(deck.side, canonicalById, tracked),
    })),
  }
}

/**
 * Lo último antes de escribir: una falla de la API o de los scripts que no tiró ningún error no debe pisar los datos buenos que ya están en el repo.
 * Toda carta del tier list tiene que decir de qué lista es, y los decks no pueden ser muchos menos que los de la corrida anterior.
 */
function assertPayload(payload, previousDeckCount) {
  const untyped = Object.entries(payload.cards).filter(([, card]) => !Array.isArray(card.kinds) || card.kinds.length === 0)

  if (untyped.length > 0) {
    throw new Error(`${untyped.length} cartas sin tipo (hand trap o boardbreaker); por ejemplo ${untyped.slice(0, 8).map(([id]) => id).join(', ')}.`)
  }

  if (previousDeckCount > 0 && payload.decks.length < previousDeckCount * MIN_DECKS_VS_PREVIOUS) {
    throw new Error(`Sólo ${payload.decks.length} decks contra ${previousDeckCount} de la corrida anterior: ¿devolvió la API una lista cortada?`)
  }
}

/** Cuántos decks tiene el archivo publicado (0 si todavía no hay o no se lee). */
function readPreviousDeckCount() {
  try {
    const previous = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'))

    return Array.isArray(previous.decks) ? previous.decks.length : 0
  } catch {
    return 0
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

/** El lector de reglas y el parser de la app son TypeScript: Vite los carga sin compilarlos aparte. */
async function loadEngine() {
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
  })

  try {
    const [rules, parser] = await Promise.all([
      server.ssrLoadModule('/src/app/card-script-rules.ts'),
      server.ssrLoadModule('/src/ygoprodeck/parser.ts'),
    ])

    return { rules, parser, close: () => server.close() }
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
