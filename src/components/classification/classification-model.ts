import type { CSSProperties } from 'react'

import { getDeckGroupTheme } from '../../app/deck-groups'
import { isCardMissingOrigin, isCardMissingRoles, isCardPendingReview } from '../../app/role-step'
import { t } from '../../i18n'
import type { CardEntry, CardGroupKey, CardRole } from '../../types'

export type ClassificationStateKey = 'all' | 'unclassified' | 'missing-origin' | 'missing-role' | 'review' | 'complete'
export type ClassificationStyleKey = ClassificationStateKey | CardGroupKey
type StatusTone = 'warning' | 'primary' | 'success'
export type CardTypeKey = 'monster' | 'spell' | 'trap'

const PANEL_THEME: Record<ClassificationStateKey, { color: string; rgb: string }> = {
  all: { color: 'var(--primary)', rgb: 'var(--primary-rgb)' },
  unclassified: { color: 'var(--warning)', rgb: 'var(--warning-rgb)' },
  'missing-origin': { color: 'var(--warning)', rgb: 'var(--warning-rgb)' },
  'missing-role': { color: '#b4a2d4', rgb: '180 162 212' },
  review: { color: 'var(--primary)', rgb: 'var(--primary-rgb)' },
  complete: { color: 'var(--accent)', rgb: 'var(--accent-rgb)' },
}

/** Orden en que se muestran los roles de una carta (y los filtros por rol). */
export const ROLE_FILTER_ORDER: CardRole[] = [
  'starter',
  'extender',
  'handtrap',
  'boardbreaker',
  'brick',
  'enabler',
  'searcher',
  'draw',
  'payoff',
  'recovery',
  'disruption',
  'floodgate',
  'garnet',
]

/** Pone las variables de color (`--role-color` / `--role-rgb`) de un grupo o estado. */
export function getClassificationStyle(groupKey: ClassificationStyleKey): CSSProperties {
  const theme = typeof groupKey === 'string' ? PANEL_THEME[groupKey] : getDeckGroupTheme(groupKey)

  return { '--role-color': theme.color, '--role-rgb': theme.rgb } as CSSProperties
}

export function getCardType(card: CardEntry): CardTypeKey {
  const cardType = card.apiCard?.cardType?.toLowerCase() ?? ''
  const frameType = card.apiCard?.frameType?.toLowerCase() ?? ''

  if (cardType.includes('spell') || frameType.includes('spell')) {
    return 'spell'
  }

  return cardType.includes('trap') || frameType.includes('trap') ? 'trap' : 'monster'
}

export const CARD_TYPE_ORDER: readonly CardTypeKey[] = ['monster', 'spell', 'trap']

// Getters: el texto se arma al leerlo, no al evaluar el módulo. Cada tipo es un mensaje plural (una forma por cantidad).
export const CARD_TYPE_LABEL: Record<CardTypeKey, { singular: string; plural: string }> = {
  monster: { get singular() { return t('roles.cardType.monster', { count: 1 }) }, get plural() { return t('roles.cardType.monster', { count: 2 }) } },
  spell: { get singular() { return t('roles.cardType.spell', { count: 1 }) }, get plural() { return t('roles.cardType.spell', { count: 2 }) } },
  trap: { get singular() { return t('roles.cardType.trap', { count: 1 }) }, get plural() { return t('roles.cardType.trap', { count: 2 }) } },
}

/** Orden fijo de la lista: tipo, más copias primero y nombre. No cambia al clasificar. */
export function compareCardsForQueue(left: CardEntry, right: CardEntry): number {
  return (
    CARD_TYPE_ORDER.indexOf(getCardType(left)) - CARD_TYPE_ORDER.indexOf(getCardType(right)) ||
    right.copies - left.copies ||
    left.name.localeCompare(right.name)
  )
}

export function getCardPrimaryStatus(card: CardEntry): { label: string; tone: StatusTone } | null {
  const missingOrigin = isCardMissingOrigin(card)
  const missingRoles = isCardMissingRoles(card)

  if (missingOrigin && missingRoles) {
    return null
  }

  if (missingOrigin) {
    return { label: t('roles.status.noOrigin'), tone: 'warning' }
  }

  if (missingRoles) {
    return { label: t('roles.status.noFunction'), tone: 'warning' }
  }

  return isCardPendingReview(card) ? { label: t('roles.status.review'), tone: 'primary' } : null
}
