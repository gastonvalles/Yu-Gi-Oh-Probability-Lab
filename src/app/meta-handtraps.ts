import metaDecksJson from '../data/meta-decks.json'
import { t } from '../i18n'
import type { BanlistStatus } from '../types'
import { normalizeSearchText } from './utils'

/** De qué circuito de torneos viene un deck; cada región tiene su banlist y su tier list. */
export type MetaRegion = 'tcg' | 'ocg'

/** Una hand trap del tier list, con su id canónico de YGOPRODeck (las artes alternativas ya están unificadas). */
interface MetaCard {
  name: string
  image: string | null
  /** Estado en la banlist de cada región al momento del snapshot. */
  ban: Record<MetaRegion, BanlistStatus | null>
}

/** Un Tournament Meta Deck de YGOPRODeck: sólo sus hand traps, como [id, copias]. */
export interface MetaDeck {
  id: number
  region: MetaRegion
  name: string
  /** Fecha del torneo (YYYY-MM-DD). */
  date: string
  tournament: string | null
  placement: string | null
  players: number | null
  /** Quién lo jugó. */
  player: string | null
  /** Id de la carta de portada que eligió YGOPRODeck. */
  cover: number | null
  /** Tramo final de la URL del deck en YGOPRODeck. */
  url: string | null
  main: Array<[number, number]>
  side: Array<[number, number]>
}

/** La lista completa de un deck, [id, copias] por zona, en el orden en que la cargaron. */
export interface MetaDecklist {
  main: Array<[number, number]>
  extra: Array<[number, number]>
  side: Array<[number, number]>
}

export interface MetaDecksData {
  /** Instante del snapshot (ISO, en UTC): la referencia para contar semanas; se muestra en la hora del usuario. */
  fetchedAt: string
  windowDays: number
  source: string
  cards: Record<string, MetaCard>
  decks: MetaDeck[]
}

// Lo escribe scripts/sync-meta-decks.mjs con esta forma exacta (valida cada campo antes de escribirlo).
export const META_DECKS = metaDecksJson as unknown as MetaDecksData

/** Las listas completas pesan más que el resto de la pestaña: se bajan recién al abrir un deck. */
export async function loadMetaDecklist(deckId: number): Promise<MetaDecklist | null> {
  const decklists = (await import('../data/meta-decklists.json')).default as unknown as Record<string, MetaDecklist>
  return Object.hasOwn(decklists, String(deckId)) ? decklists[String(deckId)]! : null
}

/** Arte recortado de la carta de portada, como en las tarjetas de YGOPRODeck. */
export function coverArtUrl(cardId: number): string {
  return `https://images.ygoprodeck.com/images/cards_cropped/${cardId}.jpg`
}

export function countCopies(entries: ReadonlyArray<[number, number]>): number {
  return entries.reduce((total, [, copies]) => total + copies, 0)
}

/** El mismo .ydk que exporta la app: así el deck entra al builder por el camino de importación de siempre. */
export function toYdkText(decklist: MetaDecklist): string {
  const lines = (entries: ReadonlyArray<[number, number]>) =>
    entries.flatMap(([id, copies]) => Array.from({ length: copies }, () => String(id)))

  return ['#main', ...lines(decklist.main), '#extra', ...lines(decklist.extra), '!side', ...lines(decklist.side)].join('\n')
}

export type MetaZone = 'both' | 'main' | 'side'
export type MetaTier = 'S' | 'A' | 'B' | 'C' | 'D'
export type MetaTrend = 'up' | 'down' | 'flat'

interface MetaZoneUsage {
  /** Decks de la ventana que la llevan en esa zona. */
  decks: number
  /** Copias sumadas entre esos decks. */
  copies: number
}

export interface MetaWeek {
  decks: number
  share: number
}

interface MetaArchetypeUsage {
  name: string
  /** Decks de ese nombre que la juegan, sobre el total de decks con ese nombre. */
  decks: number
  total: number
}

export interface HandtrapStat {
  id: number
  name: string
  image: string | null
  /** Decks de la ventana que la juegan (en la zona elegida). */
  decks: number
  share: number
  tier: MetaTier
  main: MetaZoneUsage
  side: MetaZoneUsage
  /** Semana a semana sobre todos los datos, de la más vieja a la más nueva. */
  weekly: MetaWeek[]
  projectedShare: number
  projectedTier: MetaTier
  trend: MetaTrend
  archetypes: MetaArchetypeUsage[]
}

export interface MetaReport {
  /** Decks dentro de la ventana elegida. */
  deckCount: number
  handtraps: HandtrapStat[]
}

export interface MetaDeckFilter {
  region?: MetaRegion
  cardId?: number
  archetype?: string
  /** Texto libre: nombre del deck, torneo, puesto o jugador (sin distinguir mayúsculas ni tildes). */
  text?: string
}

/** Cuántas semanas hacia adelante se prolonga la tendencia. */
export const PROJECTION_WEEKS = 2
/** Cambio proyectado (fracción de decks) a partir del cual se dice que sube o baja. */
export const TREND_THRESHOLD = 0.05
/** Piso de cada tier, como fracción de los decks que la juegan. */
export const TIER_FLOORS: ReadonlyArray<readonly [MetaTier, number]> = [
  ['S', 0.6],
  ['A', 0.35],
  ['B', 0.15],
  ['C', 0.05],
]
/** Una semana con menos decks que esto no pesa en la tendencia: sería ruido. */
export const MIN_WEEK_DECKS = 10
const MIN_TREND_WEEKS = 3
const WEEK_MS = 7 * 86_400_000

export function tierOf(share: number): MetaTier {
  // Se compara el porcentaje redondeado (el que se ve): dos cartas con "5%" caen en el mismo tier.
  const shown = Math.round(share * 100) / 100

  for (const [tier, floor] of TIER_FLOORS) {
    if (shown >= floor) {
      return tier
    }
  }

  return 'D'
}

/** Semanas enteras entre la fecha del torneo y la del snapshot (0 = los últimos siete días). */
export function weeksAgo(date: string, reference: string): number {
  return Math.max(0, Math.floor((Date.parse(reference) - Date.parse(date)) / WEEK_MS))
}

/**
 * Recta ajustada a la serie semanal (mínimos cuadrados; cada semana pesa por su cantidad de decks),
 * prolongada PROJECTION_WEEKS semanas. Con menos de tres semanas con datos no se proyecta nada.
 */
export function projectShare(weekly: ReadonlyArray<MetaWeek>, currentShare: number): { projectedShare: number; trend: MetaTrend } {
  const last = weekly.length - 1
  const points = weekly
    .map((week, index) => ({ x: index - last, y: week.share, weight: week.decks }))
    .filter((point) => point.weight >= MIN_WEEK_DECKS)
  const flat = { projectedShare: currentShare, trend: 'flat' as const }

  if (points.length < MIN_TREND_WEEKS) {
    return flat
  }

  const totalWeight = points.reduce((sum, point) => sum + point.weight, 0)
  const meanX = points.reduce((sum, point) => sum + point.weight * point.x, 0) / totalWeight
  const meanY = points.reduce((sum, point) => sum + point.weight * point.y, 0) / totalWeight
  const spreadX = points.reduce((sum, point) => sum + point.weight * (point.x - meanX) ** 2, 0)

  if (spreadX === 0) {
    return flat
  }

  const slope = points.reduce((sum, point) => sum + point.weight * (point.x - meanX) * (point.y - meanY), 0) / spreadX
  const now = clamp01(meanY - slope * meanX)
  const projectedShare = clamp01(now + slope * PROJECTION_WEEKS)
  const delta = projectedShare - now

  return { projectedShare, trend: delta > TREND_THRESHOLD ? 'up' : delta < -TREND_THRESHOLD ? 'down' : 'flat' }
}

interface UsageAccumulator {
  main: MetaZoneUsage
  side: MetaZoneUsage
  decks: number
  weekly: number[]
  archetypes: Map<string, number>
}

/** Qué hand traps se juegan en los decks de una región en las últimas `windowWeeks` semanas, y hacia dónde va cada una. */
export function buildMetaReport(data: MetaDecksData, region: MetaRegion, zone: MetaZone, windowWeeks: number): MetaReport {
  const totalWeeks = Math.max(windowWeeks, Math.ceil(data.windowDays / 7))
  const weekDecks: number[] = Array.from({ length: totalWeeks }, () => 0)
  const archetypeTotals = new Map<string, number>()
  const usage = new Map<number, UsageAccumulator>()
  let deckCount = 0

  for (const deck of data.decks) {
    const week = weeksAgo(deck.date, data.fetchedAt)

    if (deck.region !== region || week >= totalWeeks) {
      continue
    }

    const recent = week < windowWeeks
    weekDecks[week] += 1

    if (recent) {
      deckCount += 1
      archetypeTotals.set(deck.name, (archetypeTotals.get(deck.name) ?? 0) + 1)
    }

    const counted = new Set<number>()

    for (const zoneKey of ['main', 'side'] as const) {
      for (const [id, copies] of deck[zoneKey]) {
        let entry = usage.get(id)

        if (!entry) {
          entry = {
            main: { decks: 0, copies: 0 },
            side: { decks: 0, copies: 0 },
            decks: 0,
            weekly: Array.from({ length: totalWeeks }, () => 0),
            archetypes: new Map(),
          }
          usage.set(id, entry)
        }

        if (recent) {
          entry[zoneKey].decks += 1
          entry[zoneKey].copies += copies
        }

        // "La juega" según la zona elegida; un deck cuenta una vez aunque la lleve en Main y en Side.
        if ((zone === 'both' || zone === zoneKey) && !counted.has(id)) {
          counted.add(id)
          entry.weekly[week] += 1

          if (recent) {
            entry.decks += 1
            entry.archetypes.set(deck.name, (entry.archetypes.get(deck.name) ?? 0) + 1)
          }
        }
      }
    }
  }

  if (deckCount === 0) {
    return { deckCount: 0, handtraps: [] }
  }

  const handtraps: HandtrapStat[] = []

  for (const [id, entry] of usage) {
    const card = data.cards[String(id)]

    // Los decks de antes de la banlist la siguen llevando, pero hoy no se puede jugar en esa región: no va al tier list.
    if (entry.decks === 0 || card?.ban[region] === 'forbidden') {
      continue
    }
    const share = entry.decks / deckCount
    const weekly = weekDecks
      .map((count, week) => ({ decks: count, share: count > 0 ? (entry.weekly[week] ?? 0) / count : 0 }))
      .reverse()
    const { projectedShare, trend } = projectShare(weekly, share)

    handtraps.push({
      id,
      name: card?.name ?? t('meta.handtrap.unknown', { id }),
      image: card?.image ?? null,
      decks: entry.decks,
      share,
      tier: tierOf(share),
      main: entry.main,
      side: entry.side,
      weekly,
      projectedShare,
      projectedTier: tierOf(projectedShare),
      trend,
      archetypes: [...entry.archetypes]
        .map(([name, decks]) => ({ name, decks, total: archetypeTotals.get(name) ?? decks }))
        .sort((left, right) => right.decks - left.decks || left.name.localeCompare(right.name, 'es')),
    })
  }

  handtraps.sort((left, right) => right.share - left.share || right.decks - left.decks || left.name.localeCompare(right.name, 'es'))

  return { deckCount, handtraps }
}

/** Link directo a un deck: la pestaña Meta más el id, para pegarlo en un chat. */
export function buildMetaDeckHash(deckId: number | null): string {
  return deckId === null ? '#meta' : `#meta?deck=${deckId}`
}

export function readMetaDeckIdFromHash(hash: string): number | null {
  const [step, query = ''] = hash.replace(/^#/, '').split('?')
  const id = Number(new URLSearchParams(query).get('deck'))

  return step === 'meta' && Number.isInteger(id) && id > 0 ? id : null
}

export function filterMetaDecks(decks: readonly MetaDeck[], filter: MetaDeckFilter): MetaDeck[] {
  const words = normalizeSearchText(filter.text ?? '').split(' ').filter(Boolean)

  return decks.filter(
    (deck) =>
      (filter.region === undefined || deck.region === filter.region) &&
      (filter.archetype === undefined || deck.name === filter.archetype) &&
      (filter.cardId === undefined || hasCard(deck, filter.cardId)) &&
      (words.length === 0 || matchesWords(deck, words)),
  )
}

/** Todas las palabras buscadas tienen que aparecer, en cualquier orden y en cualquiera de los campos. */
function matchesWords(deck: MetaDeck, words: readonly string[]): boolean {
  const haystack = normalizeSearchText([deck.name, deck.tournament, deck.placement, deck.player].filter(Boolean).join(' '))
  return words.every((word) => haystack.includes(word))
}

function hasCard(deck: MetaDeck, cardId: number): boolean {
  return deck.main.some(([id]) => id === cardId) || deck.side.some(([id]) => id === cardId)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
