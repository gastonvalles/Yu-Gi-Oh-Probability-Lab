import replaysJson from '../data/replays.json'
import { getLocale, t, type Locale } from '../i18n'
import { META_DECKS, type MetaDeck } from './meta'
import { normalizeSearchText } from './utils'

export type ReplayChannel = 'eu' | 'tcg'

/** Un replay de un duelo de torneo, de un canal oficial de YouTube. */
export interface ReplayVideo {
  id: string
  channel: ReplayChannel
  /** El título tal cual: "YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.". */
  title: string
  /** "31:38". */
  duration: string
  /** Aproximada (YouTube sólo dice "hace 3 semanas"): ordena y acota la ventana. YYYY-MM-DD. */
  date: string
}

export interface ReplaysData {
  /** Instante del snapshot (ISO, en UTC). */
  fetchedAt: string
  windowDays: number
  channels: Record<ReplayChannel, { name: string; url: string }>
  videos: ReplayVideo[]
}

// Lo escribe scripts/sync-replays.mjs con esta forma exacta.
export const REPLAYS = replaysJson as unknown as ReplaysData

export interface ReplayStage {
  /** "Final", "Top 8", "Ronda 15". */
  label: string
  /** Para ordenar de la final hacia atrás: Final, Semifinal, Top 8, Top 16… y después las rondas, de la última a la primera. */
  rank: number
}

export interface ParsedReplayTitle {
  /** "YCS Paris 2026" (vacío si el título no nombra un torneo). */
  event: string
  stage: ReplayStage | null
  /** Como los escribe el canal: "Timoti B.". */
  players: [string, string]
  /** Los replays del formato Genesys no tienen que ver con los decks del Meta (que son de TCG y OCG). */
  genesys: boolean
}

interface ReplayPlayer {
  name: string
  /** El deck que ese jugador llevó al torneo, si está entre los del Meta. */
  deck: MetaDeck | null
}

export interface ReplayEntry {
  video: ReplayVideo
  event: string
  stage: ReplayStage | null
  players: [ReplayPlayer, ReplayPlayer]
  genesys: boolean
  /** Todo lo que se puede buscar (torneo, instancia, jugadores, decks), sin tildes ni mayúsculas. */
  search: string
}

const VIDEO_ID = /^[\w-]{11}$/
/** Los canales separan las partes del título con " - ", con "//" o con " | " según el evento. */
const SEPARATOR = /\s+-\s+|\s*\/\/\s*|\s+\|\s+/
const VERSUS = /^(.+?)\s+vs\.?\s+(.+)$/i

/** La instancia del torneo ("FINAL", "Top 8", "Round 15", "Semi Final 1"); el resto de las partes ("Day 2") no se usa. */
export function readStage(text: string): ReplayStage | null {
  const value = text.trim()
  const top = /^top\s*(\d+)$/i.exec(value)
  const round = /^(?:swiss\s+)?round\s*(\d+)$/i.exec(value)
  const semifinal = /^semi.?finals?(?:\s+(\d+))?$/i.exec(value)

  // El nombre de la instancia se arma en el idioma de ese momento (el idioma sólo cambia recargando la página).
  if (/^finals?$/i.test(value)) return { label: t('meta.replays.stage.final'), rank: 0 }
  if (semifinal) return { label: semifinal[1] ? t('meta.replays.stage.semifinalN', { number: semifinal[1] }) : t('meta.replays.stage.semifinal'), rank: 1 }
  if (/^quarter.?finals?/i.test(value)) return { label: t('meta.replays.stage.quarterfinal'), rank: 2 }
  if (top) return { label: t('meta.replays.stage.top', { number: Number(top[1]) }), rank: Math.max(1, Math.round(Math.log2(Number(top[1]))) - 1) }
  if (round) return { label: t('meta.replays.stage.round', { number: Number(round[1]) }), rank: 100 - Number(round[1]) }

  return null
}

/** Torneo, instancia y jugadores de un título; null si no es un duelo ("A vs. B"). */
export function parseReplayTitle(title: string): ParsedReplayTitle | null {
  const segments = title
    .split(SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean)
  const versus = segments.findIndex((segment) => VERSUS.test(segment))
  const match = versus < 0 ? null : VERSUS.exec(segments[versus]!)

  if (!match) {
    return null
  }

  const genesys = /genesys/i.test(title)
  // En Genesys el torneo viene al final ("Genesys Championship Day 1 - Round 7 - A. vs. B. | YCS Paris 2026").
  const host = genesys ? segments.slice(versus + 1).at(-1) : undefined

  return {
    event: host ? `${host} · Genesys` : versus === 0 ? '' : segments[0]!,
    stage: segments.slice(1, versus).reduce<ReplayStage | null>((found, segment) => found ?? readStage(segment), null),
    players: [match[1]!.trim(), match[2]!.trim()],
    genesys,
  }
}

// Cruce con los decks del Meta: el torneo y el jugador. El título del video no dice el deck, pero la pestaña Meta sabe quién lo jugó.

const words = (text: string) => normalizeSearchText(text).split(/[^a-z0-9]+/).filter(Boolean)
/** Lo que no distingue un torneo de otro: "YCS Paris" y "WCQ Brussels" se reconocen por la ciudad. */
const GENERIC_EVENT_WORDS = new Set([
  'ycs', 'wcq', 'nawcq', 'regional', 'championship', 'series', 'yu', 'gi', 'oh', 'tcg', 'ocg', 'north', 'american', 'america', 'european', 'europe',
  'world', 'qualifier', 'qualifiers', 'the', 'of', 'duel', 'dragon', 'remote', 'latin', 'genesys', 'day', 'at',
])

/** Un YCS no se confunde con un Regional de la misma ciudad. */
function eventKind(tokens: readonly string[]): 'ycs' | 'wcq' | null {
  if (tokens.includes('ycs')) return 'ycs'
  return tokens.some((token) => token === 'wcq' || token === 'nawcq' || token === 'regional') ? 'wcq' : null
}

interface IndexedDeck {
  deck: MetaDeck
  /** Las palabras que distinguen su torneo. */
  eventWords: string[]
  kind: ReturnType<typeof eventKind>
  playerWords: string[]
}

const indexes = new WeakMap<readonly MetaDeck[], IndexedDeck[]>()

function indexDecks(decks: readonly MetaDeck[]): IndexedDeck[] {
  let index = indexes.get(decks)

  if (!index) {
    index = decks.flatMap((deck) => {
      const tokens = words(deck.tournament ?? '')
      const eventWords = tokens.filter((token) => !GENERIC_EVENT_WORDS.has(token) && !/^\d+$/.test(token))

      return deck.player && eventWords.length > 0 ? [{ deck, eventWords, kind: eventKind(tokens), playerWords: words(deck.player) }] : []
    })
    indexes.set(decks, index)
  }

  return index
}

/**
 * ¿"Timoti B." es "Timoti Baggio"? Los canales abrevian el apellido a la inicial; se compara sin importar el orden de las
 * palabras (hay jugadores cargados con el apellido primero) ni las tildes. Un nombre completo tiene que coincidir entero.
 */
export function samePlayer(videoName: string, deckPlayer: string): boolean {
  const video = words(videoName)
  const deck = words(deckPlayer)
  const initial = video.length > 1 && video.at(-1)!.length === 1 ? video.at(-1)! : null

  if (video.length === 0 || deck.length === 0) return false
  if (initial === null) return video.length === deck.length && video.every((word) => deck.includes(word))

  const given = video.slice(0, -1)

  return given.every((word) => deck.includes(word)) && deck.some((word) => !given.includes(word) && word.startsWith(initial))
}

/** El deck de ese jugador en ese torneo; si dos jugadores distintos cuadran con el nombre, no se adivina. */
function findDeck(name: string, titleWords: ReadonlySet<string>, kind: ReturnType<typeof eventKind>, index: readonly IndexedDeck[]): MetaDeck | null {
  const found = index.filter(
    (entry) =>
      (entry.kind === null || kind === null || entry.kind === kind) &&
      entry.eventWords.every((word) => titleWords.has(word)) &&
      samePlayer(name, entry.deck.player!),
  )

  return found.length > 0 && found.every((entry) => entry.deck.player === found[0]!.deck.player) ? found[0]!.deck : null
}

/**
 * Cada replay con los decks de sus dos jugadores (cuando están en el Meta), de la final hacia atrás. Los de Genesys no se
 * cruzan: el Meta es de TCG y de OCG. Un video con un id raro o sin dos jugadores en el título se descarta.
 */
export function matchReplays(videos: readonly ReplayVideo[], decks: readonly MetaDeck[]): ReplayEntry[] {
  const index = indexDecks(decks)
  const entries = videos.flatMap((video, order): Array<{ entry: ReplayEntry; order: number }> => {
    const parsed = VIDEO_ID.test(video.id) ? parseReplayTitle(video.title) : null

    if (!parsed) {
      return []
    }

    const titleWords = new Set(words(video.title))
    const kind = eventKind([...titleWords])
    const players = parsed.players.map((name): ReplayPlayer => ({ name, deck: parsed.genesys ? null : findDeck(name, titleWords, kind, index) })) as [ReplayPlayer, ReplayPlayer]
    // El título tal cual (en inglés) también se busca: la instancia se muestra en el idioma elegido ("Ronda 13"), pero "round 13" tiene que servir en los dos.
    const search = normalizeSearchText(
      [parsed.event, parsed.stage?.label, video.title, ...players.flatMap((player) => [player.name, player.deck?.name, player.deck?.player, player.deck?.placement])].filter(Boolean).join(' '),
    )

    return [{ entry: { video, event: parsed.event, stage: parsed.stage, players, genesys: parsed.genesys, search }, order }]
  })

  // Lo más nuevo primero; dentro de un torneo, de la final hacia atrás; a igual instancia, el orden del canal.
  return entries
    .sort(
      (left, right) =>
        right.entry.video.date.localeCompare(left.entry.video.date) ||
        left.entry.event.localeCompare(right.entry.event) ||
        (left.entry.stage?.rank ?? 1000) - (right.entry.stage?.rank ?? 1000) ||
        left.order - right.order,
    )
    .map(({ entry }) => entry)
}

export const hasMetaDeck = (entry: ReplayEntry) => entry.players.some((player) => player.deck !== null)
export const playsDeck = (entry: ReplayEntry, deckId: number) => entry.players.some((player) => player.deck?.id === deckId)

let cached: { decks: readonly MetaDeck[]; locale: Locale; entries: ReplayEntry[] } | null = null

/** Los replays cruzados con los decks del Meta de hoy (se calcula una vez). */
export function getReplayEntries(): ReplayEntry[] {
  // El nombre de cada instancia sale en el idioma de ese momento: la copia vale para ese idioma.
  if (!cached || cached.decks !== META_DECKS.decks || cached.locale !== getLocale()) {
    cached = { decks: META_DECKS.decks, locale: getLocale(), entries: matchReplays(REPLAYS.videos, META_DECKS.decks) }
  }

  return cached.entries
}

/** Los replays de los duelos de un deck de torneo (se ven en su detalle). */
export const replaysOfDeck = (deckId: number) => getReplayEntries().filter((entry) => playsDeck(entry, deckId))

/** Cuántos replays tiene un deck de torneo (la tarjeta del deck avisa que hay). */
export const countReplaysOfDeck = (deckId: number) => replaysOfDeck(deckId).length

/** "Timoti B. vs. Vladis B.": cómo se nombra un replay. */
export const replayLabel = (entry: ReplayEntry) => `${entry.players[0].name} vs. ${entry.players[1].name}`

// Links

/** Link directo a un replay y/o a los de un deck: la pestaña Replays más los parámetros, para pegarlo en un chat. */
export function buildReplaysHash({ video, deck }: { video?: string | null; deck?: number | null } = {}): string {
  const query = new URLSearchParams()

  if (video) query.set('video', video)
  if (deck) query.set('deck', String(deck))

  const text = query.toString()

  return text ? `#replays?${text}` : '#replays'
}

export function readReplaysHash(hash: string): { video: string | null; deck: number | null } {
  const [step, query = ''] = hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  const video = params.get('video')
  const deck = Number(params.get('deck'))

  if (step !== 'replays') {
    return { video: null, deck: null }
  }

  return { video: video !== null && VIDEO_ID.test(video) ? video : null, deck: Number.isInteger(deck) && deck > 0 ? deck : null }
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`
/** El reproductor sin cookies de YouTube: sólo se carga cuando se toca "Reproducir". */
export const embedUrl = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`
/** La miniatura 4:3 con barras negras: se recorta a 16:9 con `object-cover`. */
export const thumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
