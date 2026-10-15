import metaDecksJson from '../data/meta-decks.json'
import { t } from '../i18n'
import type { BanlistStatus } from '../types'
import { normalizeSearchText } from './utils'

/** De qué circuito de torneos viene un deck; cada región tiene su banlist y sus tier lists. */
export type MetaRegion = 'tcg' | 'ocg'

/** Qué tier list de cartas: las hand traps o los boardbreakers (una carta puede estar en las dos). */
export type MetaCardKind = 'handtrap' | 'boardbreaker'

/** Una carta de los tier lists (hand trap o boardbreaker), con su id canónico de YGOPRODeck (las artes alternativas ya están unificadas). */
interface MetaCard {
  name: string
  image: string | null
  /** Estado en la banlist de cada región al momento del snapshot. */
  ban: Record<MetaRegion, BanlistStatus | null>
  /** Qué es la carta (lo escribe el sync). Los datos de antes de los boardbreakers sólo traían hand traps y no lo decían. */
  kinds?: MetaCardKind[]
}

/** Un Tournament Meta Deck de YGOPRODeck: sólo sus hand traps y boardbreakers, como [id, copias]. */
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

/** Qué es una carta de los tier lists: lo que dice el sync, o hand trap si es de los datos de antes de los boardbreakers. */
export function kindsOf(card: MetaCard | undefined): MetaCardKind[] {
  return card?.kinds ?? ['handtrap']
}

/** Los ids de las cartas de un tipo (para resaltarlas en la lista de un deck). */
export function cardIdsOfKind(kind: MetaCardKind, cards: Record<string, MetaCard> = META_DECKS.cards): Set<number> {
  return new Set(Object.entries(cards).filter(([, card]) => kindsOf(card).includes(kind)).map(([id]) => Number(id)))
}

/** Copias de un tipo de carta en una zona de un deck (el deck trae hand traps y boardbreakers mezclados). */
export function countKindCopies(entries: ReadonlyArray<[number, number]>, kind: MetaCardKind, cards: Record<string, MetaCard> = META_DECKS.cards): number {
  return countCopies(entries.filter(([id]) => kindsOf(cards[String(id)]).includes(kind)))
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

/** Una carta del tier list (hand trap o boardbreaker). */
export interface MetaCardStat {
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
  cards: MetaCardStat[]
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
/** Cambio proyectado (fracción de decks) a partir del cual se dice que sube o baja una carta. */
export const TREND_THRESHOLD = 0.05
/** Piso de cada tier de las cartas, como fracción de los decks que la juegan. */
export const TIER_FLOORS: ReadonlyArray<readonly [MetaTier, number]> = [
  ['S', 0.6],
  ['A', 0.35],
  ['B', 0.15],
  ['C', 0.05],
]
/**
 * Con menos decks que esto en la ventana los porcentajes bailan (cada deck vale varios puntos: con 22 decks, dos resultados ya son un 9%, que es S) y los
 * tiers no dicen mucho. Pasa sobre todo en OCG, que tiene pocos decks de torneo: la pantalla lo avisa.
 */
export const MIN_RELIABLE_DECKS = 30
/** Una semana con menos decks que esto no pesa en la tendencia: sería ruido. */
export const MIN_WEEK_DECKS = 10
const MIN_TREND_WEEKS = 3
const WEEK_MS = 7 * 86_400_000

function tierFrom(share: number, floors: ReadonlyArray<readonly [MetaTier, number]>): MetaTier {
  // Se compara el porcentaje redondeado (el que se ve): dos cartas con "5%" caen en el mismo tier.
  const shown = Math.round(share * 100) / 100

  for (const [tier, floor] of floors) {
    if (shown >= floor) {
      return tier
    }
  }

  return 'D'
}

export function tierOf(share: number): MetaTier {
  return tierFrom(share, TIER_FLOORS)
}

/** Semanas enteras entre la fecha del torneo y la del snapshot (0 = los últimos siete días). */
export function weeksAgo(date: string, reference: string): number {
  return Math.max(0, Math.floor((Date.parse(reference) - Date.parse(date)) / WEEK_MS))
}

/**
 * Recta ajustada a la serie semanal (mínimos cuadrados; cada semana pesa por su cantidad de decks),
 * prolongada PROJECTION_WEEKS semanas. Con menos de tres semanas con datos no se proyecta nada.
 * Sube o baja si lo que cambia la recta en esas semanas pasa de `threshold` (la lista de cartas y la de decks piden distinto).
 */
export function projectShare(weekly: ReadonlyArray<MetaWeek>, currentShare: number, threshold: number = TREND_THRESHOLD): { projectedShare: number; trend: MetaTrend } {
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
  // Lo que cambia la recta, sin el tope de 0 y 100 %: una carta al 98 % que sube fuerte sigue subiendo aunque el tope le coma el cambio de la cifra.
  const delta = slope * PROJECTION_WEEKS

  return { projectedShare, trend: delta > threshold ? 'up' : delta < -threshold ? 'down' : 'flat' }
}

interface UsageAccumulator {
  main: MetaZoneUsage
  side: MetaZoneUsage
  decks: number
  weekly: number[]
  archetypes: Map<string, number>
}

/**
 * Qué cartas de un tipo (hand traps o boardbreakers) se juegan en los decks de una región en las últimas `windowWeeks` semanas, y hacia
 * dónde va cada una. Los decks traen las dos mezcladas: acá sólo cuentan las del tipo pedido.
 */
export function buildMetaReport(data: MetaDecksData, region: MetaRegion, zone: MetaZone, windowWeeks: number, kind: MetaCardKind = 'handtrap'): MetaReport {
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
        if (!kindsOf(data.cards[String(id)]).includes(kind)) {
          continue
        }

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
    return { deckCount: 0, cards: [] }
  }

  const cards: MetaCardStat[] = []

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

    cards.push({
      id,
      name: card?.name ?? t('meta.card.unknown', { id }),
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

  cards.sort((left, right) => right.share - left.share || right.decks - left.decks || left.name.localeCompare(right.name, 'es'))

  return { deckCount, cards }
}

/** Qué tier list se ve: las hand traps o los boardbreakers. */
export type MetaList = MetaCardKind

const META_LISTS: readonly MetaList[] = ['handtrap', 'boardbreaker']

/** Link directo a un tier list (`#meta?list=boardbreaker`); el de las hand traps es el de la pantalla sin más. */
export function buildTierListHash(list: MetaList): string {
  return list === 'handtrap' ? '#meta' : `#meta?list=${list}`
}

export function readTierListHash(hash: string): MetaList {
  const [step, query = ''] = hash.replace(/^#/, '').split('?')
  const list = new URLSearchParams(query).get('list')

  return (step === 'meta' ? META_LISTS.find((item) => item === list) : undefined) ?? 'handtrap'
}

/** Links directos: los decks de torneo (con un deck abierto o filtrados por una carta o un nombre). */
export function buildTournamentsHash({ deck, card, archetype }: { deck?: number | null; card?: number | null; archetype?: string | null } = {}): string {
  const query = new URLSearchParams()

  if (deck) query.set('deck', String(deck))
  if (card) query.set('card', String(card))
  if (archetype) query.set('archetype', archetype)

  const text = query.toString()

  return text ? `#tournaments?${text}` : '#tournaments'
}

/** Link directo a un deck: los decks de torneo más el id, para pegarlo en un chat. */
export function buildMetaDeckHash(deckId: number | null): string {
  return buildTournamentsHash({ deck: deckId })
}

export function readTournamentsHash(hash: string): { deck: number | null; card: number | null; archetype: string | null } {
  const [step, query = ''] = hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  const deck = Number(params.get('deck'))
  const card = Number(params.get('card'))
  const archetype = params.get('archetype')

  // `#meta?deck=123` es el link de antes de separar los tier lists de los decks de torneo: sigue abriendo el deck.
  if (step !== 'tournaments' && !(step === 'meta' && params.has('deck'))) {
    return { deck: null, card: null, archetype: null }
  }

  return {
    deck: Number.isInteger(deck) && deck > 0 ? deck : null,
    card: Number.isInteger(card) && card > 0 ? card : null,
    archetype: archetype && archetype.length <= 120 ? archetype : null,
  }
}

export function readMetaDeckIdFromHash(hash: string): number | null {
  return readTournamentsHash(hash).deck
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
