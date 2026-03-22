import type { ApiCardReference, BanlistStatus, DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import type { DeckBuilderState, DeckZone } from './model'
import { formatInteger } from './utils'

const MAX_COPIES_PER_CARD = 3

export function getCardCopyLimit(card: ApiCardReference | ApiCardSearchResult, format: DeckFormat): number {
  if (format === 'unlimited') {
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

  return 'Sin límite'
}

export function buildFormatLimitLabel(card: ApiCardReference | ApiCardSearchResult, format: DeckFormat): string | null {
  if (format === 'unlimited') {
    return null
  }

  const limit = getCardCopyLimit(card, format)

  if (limit === 0) {
    return `${getDeckFormatLabel(format)}: prohibida`
  }

  return `${getDeckFormatLabel(format)}: ${formatInteger(limit)}x`
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

  return [...countsByName.values()]
    .filter((entry) => entry.copies > getCardCopyLimit(entry.card, format))
    .map((entry) => {
      const limit = getCardCopyLimit(entry.card, format)

      if (limit === 0) {
        return `${entry.name} está prohibida en ${getDeckFormatLabel(format)}.`
      }

      return `${entry.name} supera el límite de ${formatInteger(limit)} copia${limit === 1 ? '' : 's'} en ${getDeckFormatLabel(format)}.`
    })
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
