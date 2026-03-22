import type { ApiCardReference, BanlistStatus, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { GENESYS_POINT_CAP, calculateGenesysDeckPointTotal } from './genesys-format'
import type { DeckBuilderState, DeckZone } from './model'
import { formatInteger } from './utils'

const MAX_COPIES_PER_CARD = 3

export interface CardLimitIndicator {
  value: number
  label: string
}

export function getCardCopyLimit(card: ApiCardReference | ApiCardSearchResult, format: DeckFormat): number {
  if (format === 'unlimited' || format === 'genesys') {
    return MAX_COPIES_PER_CARD
  }

  const status =
    format === 'tcg'
      ? card.banlist?.tcg ?? null
      : format === 'ocg'
        ? card.banlist?.ocg ?? null
        : card.banlist?.goat ?? null

  return mapBanlistStatusToCopyLimit(status)
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

  if (format === 'genesys') {
    return 'Genesys'
  }

  return 'Sin límite'
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
      label: `Genesys: ${formatInteger(points)} pts`,
    }
  }

  if (format === 'unlimited') {
    return null
  }

  const limit = getCardCopyLimit(card, format)

  if (limit >= MAX_COPIES_PER_CARD) {
    return null
  }

  return {
    value: limit,
    label:
      limit === 0
        ? `${getDeckFormatLabel(format)}: prohibida`
        : `${getDeckFormatLabel(format)}: ${formatInteger(limit)}x`,
  }
}

export function buildFormatLimitLabel(card: ApiCardReference | ApiCardSearchResult, format: DeckFormat): string | null {
  if (format === 'genesys') {
    return card.genesys.points === null ? null : `Genesys: ${formatInteger(card.genesys.points)} pts`
  }

  return getCardLimitIndicator(card, format)?.label ?? null
}

export function buildDeckFormatIssues(deckBuilder: DeckBuilderState, format: DeckFormat): string[] {
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
      const limit = getCardCopyLimit(entry.card, format)

      if (limit === 0) {
        return `${entry.name} está prohibida en ${getDeckFormatLabel(format)}.`
      }

      return `${entry.name} supera el límite de ${formatInteger(limit)} copia${limit === 1 ? '' : 's'} en ${getDeckFormatLabel(format)}.`
    })

  if (format !== 'genesys') {
    return copyIssues
  }

  const genesysIssues = [...copyIssues]

  for (const entry of countsByName.values()) {
    if (entry.card.genesys.points === null) {
      genesysIssues.push(`${entry.name} no figura en la base oficial de Genesys.`)
    }
  }

  const pointTotal = calculateGenesysDeckPointTotal(deckBuilder)

  if (pointTotal > GENESYS_POINT_CAP) {
    genesysIssues.push(
      `El deck suma ${formatInteger(pointTotal)} puntos y supera el cap estándar de ${formatInteger(GENESYS_POINT_CAP)} en Genesys.`,
    )
  }

  return genesysIssues
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
