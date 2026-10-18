import { t } from '../i18n'
import type { ApiCardReference, BanlistStatus, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { currentStatus, upcomingChange } from './banlists'
import { GENESYS_POINT_CAP, calculateGenesysDeckPointTotal } from './genesys-format'
import { EDISON_FORMAT_LABEL, getEdisonCardCopyLimit, getEdisonCardStatus, isEdisonCardInPool } from './edison-format'
import type { DeckBuilderState, DeckZone } from './model'
import { formatInteger } from './utils'

const MAX_COPIES_PER_CARD = 3

interface CardLimitIndicator {
  value: number
  label: string
}

export function getCardCopyLimit(card: ApiCardReference | ApiCardSearchResult, format: DeckFormat): number {
  if (format === 'unlimited' || format === 'genesys') {
    return MAX_COPIES_PER_CARD
  }

  if (format === 'edison') {
    return getEdisonCardCopyLimit(card)
  }

  return mapBanlistStatusToCopyLimit(statusOf(card, format))
}

/**
 * El estado de la carta en el formato. TCG y OCG salen de las listas del sitio (las mismas de la pantalla de Banlists, con su fecha de entrada en vigencia): la API de YGOPRODeck tarda
 * en cambiar el estado cuando sale una lista, y un deck guardado lleva el viejo. Lo que nunca figuró en una lista, y GOAT, siguen saliendo de la carta.
 */
function statusOf(card: ApiCardReference | ApiCardSearchResult, format: DeckFormat): BanlistStatus | null {
  if (format === 'tcg' || format === 'ocg') {
    return currentStatus(format, card.ygoprodeckId) ?? card.banlist?.[format] ?? null
  }

  return card.banlist?.goat ?? null
}

export function getDeckFormatLabel(format: DeckFormat): string {
  if (format === 'tcg') {
    return 'TCG'
  }

  if (format === 'ocg') {
    return 'OCG'
  }

  if (format === 'goat') {
    return 'GOAT'
  }

  if (format === 'edison') {
    return EDISON_FORMAT_LABEL
  }

  if (format === 'genesys') {
    return 'Genesys'
  }

  return t('deck.format.unlimited')
}

export function getCardLimitIndicator(
  card: ApiCardReference | ApiCardSearchResult,
  format: DeckFormat,
): CardLimitIndicator | null {
  if (format === 'genesys') {
    const points = card.genesys.points

    if (points === null || points <= 0) {
      return null
    }

    return {
      value: points,
      label: t('deck.limit.genesysPoints', { points: formatInteger(points) }),
    }
  }

  if (format === 'unlimited') {
    return null
  }

  if (format === 'edison' && !isEdisonCardInPool(card)) {
    return {
      value: 0,
      label: t('deck.limit.outOfFormat', { format: EDISON_FORMAT_LABEL }),
    }
  }

  const limit = getCardCopyLimit(card, format)

  if (limit >= MAX_COPIES_PER_CARD) {
    return null
  }

  return {
    value: limit,
    label:
      limit === 0
        ? t('deck.limit.forbidden', { format: getDeckFormatLabel(format) })
        : t('deck.limit.copies', { format: getDeckFormatLabel(format), limit: formatInteger(limit) }),
  }
}

export function buildFormatLimitLabel(card: ApiCardReference | ApiCardSearchResult, format: DeckFormat): string | null {
  if (format === 'genesys') {
    return card.genesys.points === null ? null : t('deck.limit.genesysPoints', { points: formatInteger(card.genesys.points) })
  }

  return getCardLimitIndicator(card, format)?.label ?? null
}

export function buildDeckFormatIssues(deckBuilder: DeckBuilderState, format: DeckFormat, genesysCap: number = GENESYS_POINT_CAP): string[] {
  if (format === 'unlimited') {
    return []
  }

  const countsByName = new Map<string, { copies: number; card: ApiCardReference; name: string }>()
  const zones: DeckZone[] = ['main', 'extra', 'side']

  for (const zone of zones) {
    for (const card of deckBuilder[zone]) {
      const normalizedName = normalizeCardName(card.name)
      const existingEntry = countsByName.get(normalizedName)

      if (existingEntry) {
        existingEntry.copies += 1
        continue
      }

      countsByName.set(normalizedName, {
        copies: 1,
        card: card.apiCard,
        name: card.name,
      })
    }
  }

  const copyIssues = [...countsByName.values()]
    .filter((entry) => entry.copies > getCardCopyLimit(entry.card, format))
    .map((entry) => {
      if (format === 'edison' && getEdisonCardStatus(entry.card) === 'unavailable') {
        return t('deck.issue.notLegalIn', { name: entry.name, format: EDISON_FORMAT_LABEL })
      }

      const limit = getCardCopyLimit(entry.card, format)

      if (limit === 0) {
        return t('deck.issue.forbiddenIn', { name: entry.name, format: getDeckFormatLabel(format) })
      }

      return t('deck.issue.copyLimitExceeded', { name: entry.name, count: limit, format: getDeckFormatLabel(format) })
    })

  if (format !== 'genesys') {
    return copyIssues
  }

  const genesysIssues = [...copyIssues]

  for (const entry of countsByName.values()) {
    if (entry.card.genesys.points === null) {
      genesysIssues.push(t('deck.issue.genesysUnknown', { name: entry.name }))
    }
  }

  const pointTotal = calculateGenesysDeckPointTotal(deckBuilder)

  if (pointTotal > genesysCap) {
    genesysIssues.push(t('deck.issue.genesysOverCap', { points: formatInteger(pointTotal), cap: formatInteger(genesysCap) }))
  }

  return genesysIssues
}

export interface UpcomingLimitNote {
  name: string
  from: BanlistStatus
  to: BanlistStatus
}

/**
 * Las cartas del deck que se vuelven más estrictas (de limitada a prohibida, por ejemplo) cuando entre la próxima lista del formato, y el día en que entra. No son errores
 * (hoy el deck es legal): es el aviso para ir cambiándolas. Sólo TCG y OCG tienen listas con fecha.
 */
export function buildUpcomingLimitNotes(deckBuilder: DeckBuilderState, format: DeckFormat): { date: string; notes: UpcomingLimitNote[] } | null {
  if (format !== 'tcg' && format !== 'ocg') {
    return null
  }

  const seen = new Set<string>()
  const notes: UpcomingLimitNote[] = []
  let date = ''

  for (const zone of ['main', 'extra', 'side'] as const) {
    for (const card of deckBuilder[zone]) {
      const key = normalizeCardName(card.name)
      const change = seen.has(key) ? null : upcomingChange(format, card.apiCard.ygoprodeckId)

      seen.add(key)

      if (change && mapBanlistStatusToCopyLimit(change.to) < mapBanlistStatusToCopyLimit(change.from)) {
        date = change.date
        notes.push({ name: card.name, from: change.from, to: change.to })
      }
    }
  }

  return notes.length > 0 ? { date, notes } : null
}

function mapBanlistStatusToCopyLimit(status: BanlistStatus | null): number {
  if (status === 'forbidden') {
    return 0
  }

  if (status === 'limited') {
    return 1
  }

  if (status === 'semi-limited') {
    return 2
  }

  return MAX_COPIES_PER_CARD
}

function normalizeCardName(cardName: string): string {
  return cardName.trim().toLocaleLowerCase()
}
