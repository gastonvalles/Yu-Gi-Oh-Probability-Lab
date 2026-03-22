import type { BanlistStatus, CardBanlistInfo } from '../types'
import type { ApiCardSearchResult, ApiSearchPage } from './types'

export function parseSearchResponse(payload: unknown): ApiSearchPage {
  if (!isRecord(payload)) {
    throw new Error('La respuesta de YGOPRODeck no es un objeto válido.')
  }

  if (!Array.isArray(payload.data)) {
    throw new Error(readApiErrorMessage(payload) ?? 'YGOPRODeck no devolvió resultados.')
  }

  const results = payload.data.map((entry, index) => parseCard(entry, index))
  const hasMore = readHasMore(payload.meta, results.length)

  return {
    results,
    hasMore,
  }
}

export function readApiErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  return readOptionalString(payload.error)
}

function parseCard(entry: unknown, index: number): ApiCardSearchResult {
  if (!isRecord(entry)) {
    throw new Error(`La carta #${index + 1} devuelta por YGOPRODeck es inválida.`)
  }

  return {
    ygoprodeckId: readRequiredInteger(entry.id, `data[${index}].id`),
    name: readRequiredString(entry.name, `data[${index}].name`),
    cardType: readRequiredString(entry.type, `data[${index}].type`),
    frameType: readRequiredString(entry.frameType, `data[${index}].frameType`),
    description: readOptionalString(entry.desc),
    race: readOptionalString(entry.race),
    attribute: readOptionalString(entry.attribute),
    level: readOptionalInteger(entry.level),
    linkValue: readOptionalInteger(entry.linkval),
    atk: readOptionalStat(entry.atk),
    def: readOptionalStat(entry.def),
    archetype: readOptionalString(entry.archetype),
    ygoprodeckUrl: readOptionalString(entry.ygoprodeck_url),
    imageUrl: readImageUrl(entry.card_images, 'image_url'),
    imageUrlSmall: readImageUrl(entry.card_images, 'image_url_small'),
    banlist: readBanlistInfo(entry.banlist_info),
  }
}

function readBanlistInfo(value: unknown): CardBanlistInfo {
  if (!isRecord(value)) {
    return {
      tcg: null,
      ocg: null,
      goat: null,
    }
  }

  return {
    tcg: readBanlistStatus(value.ban_tcg),
    ocg: readBanlistStatus(value.ban_ocg),
    goat: readBanlistStatus(value.ban_goat),
  }
}

function readBanlistStatus(value: unknown): BanlistStatus | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toLowerCase()

  if (normalizedValue === 'forbidden') {
    return 'forbidden'
  }

  if (normalizedValue === 'limited') {
    return 'limited'
  }

  if (normalizedValue === 'semi-limited') {
    return 'semi-limited'
  }

  if (normalizedValue === 'unlimited') {
    return 'unlimited'
  }

  return null
}

function readImageUrl(
  value: unknown,
  fieldName: 'image_url' | 'image_url_small',
): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  const [firstImage] = value
  if (!isRecord(firstImage)) {
    return null
  }

  return readOptionalString(firstImage[fieldName])
}

function readHasMore(meta: unknown, currentRows: number): boolean {
  const defaultPageSize = 24

  if (!isRecord(meta)) {
    return currentRows >= defaultPageSize
  }

  const rowsRemaining = readOptionalInteger(meta.rows_remaining)
  if (rowsRemaining !== null) {
    return rowsRemaining > 0
  }

  const totalRows = readOptionalInteger(meta.total_rows)
  const currentOffset = readOptionalInteger(meta.current_rows)

  if (totalRows !== null && currentOffset !== null) {
    return currentOffset < totalRows
  }

  return currentRows >= defaultPageSize
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`"${fieldName}" debe ser un entero.`)
  }

  return value
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`"${fieldName}" debe ser un string.`)
  }

  return value
}

function readOptionalInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null
  }

  return value
}

function readOptionalStat(value: unknown): string | null {
  if (typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'string') {
    return value
  }

  return null
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
