import type { DeckCardInstance, DeckZone } from './model'
import { formatInteger } from './utils'

export type DeckZoneTypeKind = 'monster' | 'spell' | 'trap' | 'fusion' | 'synchro' | 'xyz' | 'link'

export interface DeckZoneTypeCount {
  kind: DeckZoneTypeKind
  label: string
  count: number
}

export function buildDeckZoneTypeCounts(zone: DeckZone, cards: DeckCardInstance[]): DeckZoneTypeCount[] {
  if (zone === 'extra') {
    const counts = { fusion: 0, synchro: 0, xyz: 0, link: 0 }

    for (const card of cards) {
      const frameType = card.apiCard.frameType.toLowerCase()

      if (frameType.includes('link')) {
        counts.link += 1
      } else if (frameType.includes('xyz')) {
        counts.xyz += 1
      } else if (frameType.includes('synchro')) {
        counts.synchro += 1
      } else if (frameType.includes('fusion')) {
        counts.fusion += 1
      }
    }

    return (
      [
        { kind: 'fusion', label: 'fusion', count: counts.fusion },
        { kind: 'synchro', label: 'synchro', count: counts.synchro },
        { kind: 'xyz', label: 'xyz', count: counts.xyz },
        { kind: 'link', label: 'link', count: counts.link },
      ] as const
    ).filter((entry) => entry.count > 0)
  }

  const counts = { monster: 0, spell: 0, trap: 0 }

  for (const card of cards) {
    const cardType = card.apiCard.cardType.toLowerCase()
    const frameType = card.apiCard.frameType.toLowerCase()

    if (cardType.includes('spell') || frameType.includes('spell')) {
      counts.spell += 1
    } else if (cardType.includes('trap') || frameType.includes('trap')) {
      counts.trap += 1
    } else {
      counts.monster += 1
    }
  }

  return (
    [
      { kind: 'monster', label: 'monstruos', count: counts.monster },
      { kind: 'spell', label: 'magias', count: counts.spell },
      { kind: 'trap', label: 'trampas', count: counts.trap },
    ] as const
  ).filter((entry) => entry.count > 0)
}

export function buildDeckZoneBreakdown(zone: DeckZone, cards: DeckCardInstance[]): string {
  return buildDeckZoneTypeCounts(zone, cards)
    .map((entry) => `${formatInteger(entry.count)} ${entry.label}`)
    .join(' · ')
}

