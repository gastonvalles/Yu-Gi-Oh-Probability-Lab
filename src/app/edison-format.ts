import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { formatTables } from './format-data'

type EdisonCardStatus = 'unavailable' | 'forbidden' | 'limited' | 'semi-limited' | 'unlimited'

type EdisonCard = ApiCardReference | ApiCardSearchResult

// Va escrito acá, y no sacado de las tablas, porque el nombre del formato se muestra en toda la app sin cargarlas.
export const EDISON_FORMAT_LABEL = 'Edison'

// Las tablas llegan por format-data (se cargan al elegir Edison o al pintar un deck que ya lo usa): sin cargar, ninguna carta figura.
export function getEdisonCardStatus(card: EdisonCard): EdisonCardStatus {
  const id = card.ygoprodeckId
  const tables = formatTables.edison

  if (tables?.forbidden.has(id)) {
    return 'forbidden'
  }

  if (tables?.limited.has(id)) {
    return 'limited'
  }

  if (tables?.semiLimited.has(id)) {
    return 'semi-limited'
  }

  return tables?.pool.has(id) ? 'unlimited' : 'unavailable'
}

export function isEdisonCardInPool(card: EdisonCard): boolean {
  return getEdisonCardStatus(card) !== 'unavailable'
}

export function getEdisonCardCopyLimit(card: EdisonCard): number {
  const status = getEdisonCardStatus(card)

  if (status === 'limited') {
    return 1
  }

  if (status === 'semi-limited') {
    return 2
  }

  return status === 'unavailable' || status === 'forbidden' ? 0 : 3
}
