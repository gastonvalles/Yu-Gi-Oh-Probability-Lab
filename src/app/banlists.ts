import banlistsJson from '../data/banlists.json'
import { dateLocale, perLocale } from '../i18n'
import type { BanlistStatus } from '../types'

/**
 * Las banlists históricas del TCG y del OCG: cada lista, completa, con sus cartas prohibidas, limitadas y semi-limitadas (por id de YGOPRODeck), desde
 * 2011 (TCG) y 2013 (OCG). Las baja todos los días `scripts/sync-banlists.mjs` de `lflist.conf` de YGOPro, y de Yugipedia las que todavía no están ahí (las
 * del TCG se anuncian en partes durante varios días: `partial`). Lo que no está en una lista es ilimitado.
 */

export type BanlistRegion = 'tcg' | 'ocg'

export interface Banlist {
  region: BanlistRegion
  /** AAAA-MM-DD: el día en que entró en vigencia (de Yugipedia). Una lista nueva que todavía no tiene su página queda con AAAA-MM. */
  date: string
  forbidden: number[]
  limited: number[]
  semiLimited: number[]
  /** Es una lista que se anuncia en partes y todavía faltan algunas: lo que trae es lo anunciado hasta ahora. */
  partial?: boolean
}

interface BanlistsData {
  fetchedAt: string
  cards: Record<string, string>
  lists: Banlist[]
}

const data = banlistsJson as BanlistsData

/** El día en que se bajaron las listas. */
export const BANLISTS_FETCHED_AT = data.fetchedAt

/** AAAA-MM-DD de hoy. */
const today = () => new Date().toISOString().slice(0, 10)

/** La lista se anunció pero todavía no rige (entra en vigencia en una fecha futura). Una con sólo el mes rige desde el día 1. */
export const isUpcoming = (list: Banlist, now: string = today()): boolean => (list.date.length > 7 ? list.date : `${list.date}-01`) > now

const byRegion = new Map<BanlistRegion, Banlist[]>()

/** Las listas de una región, las más nuevas primero (el archivo las trae de la más vieja a la más nueva). */
export function banlistsOf(region: BanlistRegion): Banlist[] {
  let lists = byRegion.get(region)

  if (!lists) {
    lists = data.lists.filter((list) => list.region === region).reverse()
    byRegion.set(region, lists)
  }

  return lists
}

/** El nombre (en inglés, como lo da YGOPRODeck) de una carta de las listas. */
export const banlistCardName = (cardId: number): string => data.cards[String(cardId)] ?? String(cardId)

/** El estado de una carta en una lista: la que no está, es ilimitada. */
export function statusIn(list: Banlist | null, cardId: number): BanlistStatus {
  if (list?.forbidden.includes(cardId)) return 'forbidden'
  if (list?.limited.includes(cardId)) return 'limited'
  if (list?.semiLimited.includes(cardId)) return 'semi-limited'

  return 'unlimited'
}

const byName = (a: number, b: number) => banlistCardName(a).localeCompare(banlistCardName(b), 'en')

/** Las cartas de una lista por estado (las prohibidas, las limitadas y las semi-limitadas), cada grupo por nombre. */
export function listedCards(list: Banlist): Record<Exclude<BanlistStatus, 'unlimited'>, number[]> {
  return { forbidden: [...list.forbidden].sort(byName), limited: [...list.limited].sort(byName), 'semi-limited': [...list.semiLimited].sort(byName) }
}

export interface BanlistChange {
  cardId: number
  /** Cómo estaba en la lista anterior. */
  from: BanlistStatus
}

/**
 * Lo que cambió de una lista a la siguiente, agrupado por el estado al que pasó cada carta, como lo anuncia Konami: las nuevas prohibidas, limitadas
 * y semi-limitadas, y las ilimitadas (las que salieron de la lista). Sin lista anterior (la primera que hay), todo lo que trae es nuevo.
 */
export function diffBanlists(previous: Banlist | null, next: Banlist): Record<BanlistStatus, BanlistChange[]> {
  const cardIds = new Set([...next.forbidden, ...next.limited, ...next.semiLimited, ...(previous ? [...previous.forbidden, ...previous.limited, ...previous.semiLimited] : [])])
  const changes: Record<BanlistStatus, BanlistChange[]> = { forbidden: [], limited: [], 'semi-limited': [], unlimited: [] }

  for (const cardId of [...cardIds].sort(byName)) {
    const from = statusIn(previous, cardId)
    const to = statusIn(next, cardId)

    if (from !== to) {
      changes[to].push({ cardId, from })
    }
  }

  return changes
}

const fullDate = perLocale((tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))
const monthDate = perLocale((tag) => new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }))

/** "2026-09-21" → "21 de septiembre de 2026" (en inglés, "September 21, 2026"); "2026-09", si todavía no se sabe el día → "Septiembre de 2026" ("September 2026"). */
export function formatBanlistDate(date: string): string {
  if (date.length > 7) {
    return fullDate(dateLocale()).format(new Date(`${date}T00:00:00Z`))
  }

  const month = monthDate(dateLocale()).format(new Date(`${date}-01T00:00:00Z`))

  return month.charAt(0).toUpperCase() + month.slice(1)
}
