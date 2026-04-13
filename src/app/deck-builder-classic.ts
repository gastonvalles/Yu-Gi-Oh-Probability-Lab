import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'

type CardLike = ApiCardReference | ApiCardSearchResult

export function buildClassicCardTypeLine(card: CardLike): string {
  if (card.cardType.toLowerCase().includes('spell') || card.cardType.toLowerCase().includes('trap')) {
    const kind = card.cardType.replace(/ Card$/i, '')

    return card.race ? `${kind}|${formatClassicToken(card.race)}` : kind
  }

  return [card.attribute, card.race]
    .filter((value): value is string => Boolean(value))
    .map(formatClassicToken)
    .join('/')
}

export function buildClassicCardStatLine(card: CardLike): string {
  if (card.linkValue !== null) {
    return `${card.atk ?? '0'}/LINK-${card.linkValue}`
  }

  if (card.level !== null) {
    return `${card.atk ?? '0'}/${card.def ?? '0'}`
  }

  if (card.cardType.toLowerCase().includes('spell') || card.cardType.toLowerCase().includes('trap')) {
    return card.race ?? card.cardType.replace(/ Card$/i, '')
  }

  return [card.atk ?? '', card.def ?? ''].filter(Boolean).join('/')
}

export function buildClassicCardLevelLine(card: CardLike): string {
  if (card.linkValue !== null) {
    return `[LINK-${card.linkValue}]`
  }

  if (card.level !== null) {
    return `[\u2605${card.level}]`
  }

  return ''
}

export function buildClassicCardPrimaryLine(card: CardLike): string {
  const typeLine = buildClassicCardTypeLine(card)
  const levelLine = buildClassicCardLevelLine(card)

  return [typeLine, levelLine].filter(Boolean).join(' ')
}

export function buildClassicCardDetailHeader(card: CardLike): string {
  if (card.cardType.toLowerCase().includes('spell') || card.cardType.toLowerCase().includes('trap')) {
    const kind = card.cardType.replace(/ Card$/i, '')

    return card.race ? `[${kind}|${formatClassicToken(card.race)}]` : `[${kind}]`
  }

  const monsterGroup = normalizeMonsterGroup(card.cardType)
  const detailSuffix = [card.race, card.attribute]
    .filter((value): value is string => Boolean(value))
    .map(formatClassicToken)
    .join('/')

  return detailSuffix ? `[${monsterGroup}] ${detailSuffix}` : `[${monsterGroup}]`
}

function normalizeMonsterGroup(cardType: string): string {
  const normalizedType = cardType.toLowerCase()

  if (normalizedType.includes('effect')) {
    return 'Monster|Effect'
  }

  if (normalizedType.includes('normal')) {
    return 'Monster|Normal'
  }

  if (normalizedType.includes('link')) {
    return 'Monster|Link'
  }

  if (normalizedType.includes('synchro')) {
    return 'Monster|Synchro'
  }

  if (normalizedType.includes('xyz')) {
    return 'Monster|Xyz'
  }

  if (normalizedType.includes('fusion')) {
    return 'Monster|Fusion'
  }

  return 'Monster'
}

function formatClassicToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

