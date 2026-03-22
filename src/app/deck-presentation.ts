import type { ApiCardReference } from '../types'
import type { DeckCardInstance, DeckZone } from './model'
import { formatInteger } from './utils'

export function buildDeckZoneBreakdown(zone: DeckZone, cards: DeckCardInstance[]): string {
  if (zone === 'extra') {
    const counts = {
      link: 0,
      xyz: 0,
      synchro: 0,
      fusion: 0,
    }

    for (const card of cards) {
      const frameType = card.apiCard.frameType.toLowerCase()

      if (frameType.includes('link')) {
        counts.link += 1
        continue
      }

      if (frameType.includes('xyz')) {
        counts.xyz += 1
        continue
      }

      if (frameType.includes('synchro')) {
        counts.synchro += 1
        continue
      }

      if (frameType.includes('fusion')) {
        counts.fusion += 1
      }
    }

    return [
      counts.link > 0 ? `${formatInteger(counts.link)} link` : '',
      counts.xyz > 0 ? `${formatInteger(counts.xyz)} xyz` : '',
      counts.synchro > 0 ? `${formatInteger(counts.synchro)} synchro` : '',
      counts.fusion > 0 ? `${formatInteger(counts.fusion)} fusion` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  if (zone === 'side') {
    const counts = {
      link: 0,
      xyz: 0,
      synchro: 0,
      fusion: 0,
      ritual: 0,
      effect: 0,
      vanilla: 0,
      spells: 0,
      traps: 0,
      others: 0,
    }

    for (const card of cards) {
      const cardType = card.apiCard.cardType.toLowerCase()
      const frameType = card.apiCard.frameType.toLowerCase()

      if (cardType.includes('spell') || frameType.includes('spell')) {
        counts.spells += 1
        continue
      }

      if (cardType.includes('trap') || frameType.includes('trap')) {
        counts.traps += 1
        continue
      }

      if (frameType.includes('link')) {
        counts.link += 1
        continue
      }

      if (frameType.includes('xyz')) {
        counts.xyz += 1
        continue
      }

      if (frameType.includes('synchro')) {
        counts.synchro += 1
        continue
      }

      if (frameType.includes('fusion')) {
        counts.fusion += 1
        continue
      }

      if (frameType.includes('ritual') || cardType.includes('ritual')) {
        counts.ritual += 1
        continue
      }

      if (
        frameType.includes('normal') ||
        (cardType.includes('normal') && !cardType.includes('spell') && !cardType.includes('trap'))
      ) {
        counts.vanilla += 1
        continue
      }

      if (frameType.includes('effect') || cardType.includes('effect')) {
        counts.effect += 1
        continue
      }

      counts.others += 1
    }

    return [
      counts.link > 0 ? `${formatInteger(counts.link)} link` : '',
      counts.xyz > 0 ? `${formatInteger(counts.xyz)} xyz` : '',
      counts.synchro > 0 ? `${formatInteger(counts.synchro)} synchro` : '',
      counts.fusion > 0 ? `${formatInteger(counts.fusion)} fusion` : '',
      counts.ritual > 0 ? `${formatInteger(counts.ritual)} ritual` : '',
      counts.effect > 0 ? `${formatInteger(counts.effect)} effect` : '',
      counts.vanilla > 0 ? `${formatInteger(counts.vanilla)} vanilla` : '',
      counts.spells > 0 ? `${formatInteger(counts.spells)} magias` : '',
      counts.traps > 0 ? `${formatInteger(counts.traps)} trampas` : '',
      counts.others > 0 ? `${formatInteger(counts.others)} otros` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const counts = {
    monsters: 0,
    spells: 0,
    traps: 0,
  }

  for (const card of cards) {
    const cardType = card.apiCard.cardType.toLowerCase()
    const frameType = card.apiCard.frameType.toLowerCase()

    if (cardType.includes('spell') || frameType.includes('spell')) {
      counts.spells += 1
      continue
    }

    if (cardType.includes('trap') || frameType.includes('trap')) {
      counts.traps += 1
      continue
    }

    counts.monsters += 1
  }

  return [
    counts.monsters > 0 ? `${formatInteger(counts.monsters)} monstruos` : '',
    counts.spells > 0 ? `${formatInteger(counts.spells)} magias` : '',
    counts.traps > 0 ? `${formatInteger(counts.traps)} trampas` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function buildHoverPreviewDetailLine(card: ApiCardReference): string {
  if (card.race) {
    return `[${card.race}/${card.cardType}]`
  }

  return card.cardType
}

export function buildHoverPreviewStatLine(card: ApiCardReference): string {
  const parts: string[] = []

  if (card.attribute) {
    parts.push(card.attribute)
  }

  if (card.linkValue !== null) {
    parts.push(`LINK ${card.linkValue}`)
  } else if (card.level !== null) {
    parts.push(`NIVEL ${card.level}`)
  }

  if (card.atk) {
    parts.push(`ATK ${card.atk}`)
  }

  if (card.def) {
    parts.push(`DEF ${card.def}`)
  }

  return parts.join(' / ')
}

export function getHoverPreviewPosition(
  anchorRect: DOMRect,
  previewWidth = 560,
  previewHeight = 300,
): { top: number; left: number } {
  const gap = 12
  const viewportPadding = 12

  let left = anchorRect.right + gap

  if (left + previewWidth > window.innerWidth - viewportPadding) {
    left = anchorRect.left - previewWidth - gap
  }

  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - previewWidth - viewportPadding))

  let top = anchorRect.top
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - previewHeight - viewportPadding))

  return { top, left }
}
