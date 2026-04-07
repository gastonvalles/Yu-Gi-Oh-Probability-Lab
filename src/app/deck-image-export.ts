import { downloadCanvasAsPng, downloadTextAsTxt } from './deck-image-export-download'
import { renderDeckAsCanvas } from './deck-image-export-render'
import type { DeckBuilderState, DeckCardInstance } from './model'
import type { DeckFormat } from '../types'

export async function exportDeckAssets(deckBuilder: DeckBuilderState, deckFormat: DeckFormat): Promise<void> {
  const canvas = await renderDeckAsCanvas(deckBuilder, deckFormat)
  const filenameBase = deckBuilder.deckName || 'ygo-probability-lab-deck'

  await downloadCanvasAsPng(canvas, filenameBase)
  downloadTextAsTxt(buildDecklistText(deckBuilder), filenameBase)
}

export function buildDecklistText(deckBuilder: DeckBuilderState): string {
  const lines = [
    'Main Deck',
    ...buildZoneDecklistLines(deckBuilder.main),
    '',
    'Extra Deck',
    ...buildZoneDecklistLines(deckBuilder.extra),
    '',
    'Side Deck',
    ...buildZoneDecklistLines(deckBuilder.side),
  ]

  return lines.join('\r\n')
}

function buildZoneDecklistLines(cards: DeckCardInstance[]): string[] {
  const counts = new Map<string, number>()

  for (const card of cards) {
    counts.set(card.name, (counts.get(card.name) ?? 0) + 1)
  }

  return [...counts.entries()].map(([name, count]) => `${count} ${name}`)
}
