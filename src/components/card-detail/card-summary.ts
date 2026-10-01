import type { ApiCardReference } from '../../types'

export type CardSummarySource = Pick<
  ApiCardReference,
  'cardType' | 'race' | 'attribute' | 'level' | 'linkValue' | 'atk' | 'def'
>

/** Resumen corto de una carta: "[Monstruo de Efecto] Bestia/Luz" y "[★4] / 1000/0". */
export function buildCardSummary(card: CardSummarySource): {
  typeLine: string
  statLine: string | null
} {
  const typeParts = [`[${card.cardType}]`]
  const subtypeParts = [card.race, card.attribute].filter((value): value is string => Boolean(value))

  if (subtypeParts.length > 0) {
    typeParts.push(subtypeParts.join('/'))
  }

  const statParts: string[] = []

  if (card.linkValue !== null) {
    statParts.push(`[Link-${card.linkValue}]`)
  } else if (card.level !== null) {
    statParts.push(`[★${card.level}]`)
  }

  if (card.linkValue !== null) {
    if (card.atk) {
      statParts.push(`${card.atk}`)
    }
  } else if (card.atk || card.def) {
    statParts.push(`${card.atk ?? '?'}/${card.def ?? '?'}`)
  }

  return {
    typeLine: typeParts.join(' '),
    statLine: statParts.length > 0 ? statParts.join(' / ') : null,
  }
}
