import type { ApiCardReference, BanlistStatus, CardBanlistInfo } from './types'

export interface ApiCardSearchResult extends ApiCardReference {
  name: string
}

export interface ApiSearchPage {
  results: ApiCardSearchResult[]
  hasMore: boolean
}

const CARDINFO_ENDPOINT = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

export async function searchCardsByName(
  query: string,
  limit = 24,
  offset = 0,
): Promise<ApiSearchPage> {
  const params = new URLSearchParams({
    fname: query,
    num: String(limit),
    offset: String(offset),
  })

  const response = await fetch(`${CARDINFO_ENDPOINT}?${params.toString()}`)
  const payload = (await response.json()) as unknown

  if (!response.ok) {
    throw new Error(readApiError(payload) ?? 'No se pudo consultar YGOPRODeck.')
  }

  return parseSearchResponse(payload)
}

export async function fetchCardsByIds(ids: number[]): Promise<ApiCardSearchResult[]> {
  if (ids.length === 0) {
    return []
  }

  const params = new URLSearchParams({
    id: ids.join(','),
  })

  const response = await fetch(`${CARDINFO_ENDPOINT}?${params.toString()}`)
  const payload = (await response.json()) as unknown

  if (!response.ok) {
    throw new Error(readApiError(payload) ?? 'No se pudo consultar YGOPRODeck.')
  }

  const parsedResponse = parseSearchResponse(payload)
  const cardsById = new Map(parsedResponse.results.map((card) => [card.ygoprodeckId, card]))

  return ids.flatMap((id) => {
    const card = cardsById.get(id)
    return card ? [card] : []
  })
}

export async function fetchCardByExactName(name: string): Promise<ApiCardSearchResult | null> {
  const trimmedName = name.trim()

  if (trimmedName.length === 0) {
    return null
  }

  const params = new URLSearchParams({
    name: trimmedName,
  })

  const response = await fetch(`${CARDINFO_ENDPOINT}?${params.toString()}`)
  const payload = (await response.json()) as unknown

  if (!response.ok) {
    if (readApiError(payload)?.toLowerCase().includes('no card matching your query')) {
      return null
    }

    throw new Error(readApiError(payload) ?? 'No se pudo consultar YGOPRODeck.')
  }

  const parsedResponse = parseSearchResponse(payload)
  return parsedResponse.results[0] ?? null
}

function parseSearchResponse(
  payload: unknown,
): ApiSearchPage {
  if (!isRecord(payload)) {
    throw new Error('La respuesta de YGOPRODeck no es un objeto válido.')
  }

  if (!Array.isArray(payload.data)) {
    throw new Error(readApiError(payload) ?? 'YGOPRODeck no devolvió resultados.')
  }

  const results = payload.data.map((entry, index) => parseCard(entry, index))
  const hasMore = readHasMore(payload.meta, results.length)

  return {
    results,
    hasMore,
  }
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

function readApiError(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  return readOptionalString(payload.error)
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
