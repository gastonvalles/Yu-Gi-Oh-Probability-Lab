import kdeTemplateUrl from '../assets/kde-decklist.pdf?url'
import { canvasToJpegBlob, downloadBlob } from './deck-image-export-download'
import { renderDeckAsCanvas } from './deck-image-export-render'
import { buildKdeDecklist } from './kde-decklist'
import type { DeckBuilderState, DeckCardInstance } from './model'
import type { DeckFormat } from '../types'

interface DeckExportResult {
  // Secciones del PDF oficial que no entraron completas.
  decklistOverflow: string[]
}

export async function exportDeckAssets(deckBuilder: DeckBuilderState, deckFormat: DeckFormat): Promise<DeckExportResult> {
  const filenameBase = deckBuilder.deckName || 'ygo-probability-lab-deck'
  const decklist = buildKdeDecklist(deckBuilder)
  // Cada archivo se genera por separado: si falla el PDF (planilla que no carga) igual se bajan la imagen y el YDK.
  const [image, pdf] = await Promise.allSettled([
    renderDeckAsCanvas(deckBuilder, deckFormat).then(canvasToJpegBlob),
    buildDecklistPdf(decklist),
  ])

  if (image.status === 'fulfilled') downloadBlob(image.value, filenameBase, 'jpg')
  if (pdf.status === 'fulfilled') downloadBlob(new Blob([pdf.value as BlobPart], { type: 'application/pdf' }), `${filenameBase}-decklist`, 'pdf')
  downloadBlob(new Blob([buildYdkText(deckBuilder)], { type: 'text/plain;charset=utf-8' }), filenameBase, 'ydk')

  const failed = [image.status === 'rejected' && 'la imagen', pdf.status === 'rejected' && 'el PDF'].filter(Boolean)

  if (failed.length > 0) {
    throw new Error(`Se descargó lo que pude, pero falló ${failed.join(' y ')}.`)
  }

  return { decklistOverflow: decklist.overflow }
}

// pdf-lib pesa bastante: se carga sólo al exportar.
async function buildDecklistPdf(decklist: ReturnType<typeof buildKdeDecklist>): Promise<Uint8Array> {
  const [{ fillKdeDecklistPdf }, templateResponse] = await Promise.all([
    import('./kde-decklist-pdf'),
    fetch(kdeTemplateUrl),
  ])

  if (!templateResponse.ok) {
    throw new Error('No pude cargar la planilla oficial de decklist.')
  }

  return fillKdeDecklistPdf(await templateResponse.arrayBuffer(), decklist)
}

function buildYdkText(deckBuilder: DeckBuilderState): string {
  const lines = [
    '#created by YGO Probability Lab',
    '#main',
    ...buildZoneYdkLines(deckBuilder.main),
    '#extra',
    ...buildZoneYdkLines(deckBuilder.extra),
    '!side',
    ...buildZoneYdkLines(deckBuilder.side),
  ]

  return lines.join('\r\n') + '\r\n'
}

function buildZoneYdkLines(cards: DeckCardInstance[]): string[] {
  return cards.map((card) => String(card.apiCard.ygoprodeckId))
}
