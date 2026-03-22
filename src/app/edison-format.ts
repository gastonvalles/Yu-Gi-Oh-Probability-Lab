import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import {
  EDISON_BANLIST_DATE,
  EDISON_CARD_POOL_IDS,
  EDISON_FORBIDDEN_IDS,
  EDISON_LIMITED_IDS,
  EDISON_SEMI_LIMITED_IDS,
} from '../data/edison-format-data'

export type EdisonCardStatus = 'unavailable' | 'forbidden' | 'limited' | 'semi-limited' | 'unlimited'

const EDISON_CARD_POOL_ID_SET = new Set<number>(EDISON_CARD_POOL_IDS)
const EDISON_FORBIDDEN_ID_SET = new Set<number>(EDISON_FORBIDDEN_IDS)
const EDISON_LIMITED_ID_SET = new Set<number>(EDISON_LIMITED_IDS)
const EDISON_SEMI_LIMITED_ID_SET = new Set<number>(EDISON_SEMI_LIMITED_IDS)

type EdisonCard = ApiCardReference | ApiCardSearchResult

export const EDISON_FORMAT_LABEL = 'Edison'
export const EDISON_FORMAT_DATE = EDISON_BANLIST_DATE

export function getEdisonCardStatus(card: EdisonCard): EdisonCardStatus {
  const id = card.ygoprodeckId

  if (EDISON_FORBIDDEN_ID_SET.has(id)) {
    return 'forbidden'
  }

  if (EDISON_LIMITED_ID_SET.has(id)) {
    return 'limited'
  }

  if (EDISON_SEMI_LIMITED_ID_SET.has(id)) {
    return 'semi-limited'
  }

  return EDISON_CARD_POOL_ID_SET.has(id) ? 'unlimited' : 'unavailable'
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
