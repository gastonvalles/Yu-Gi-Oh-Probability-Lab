import kdeTemplateUrl from '../assets/kde-decklist.pdf?url'
import { canvasToJpegBlob, downloadBlob } from './deck-image-export-download'
import { renderDeckAsCanvas } from './deck-image-export-render'
import { buildKdeDecklist } from './kde-decklist'
import type { DeckBuilderState, DeckCardInstance } from './model'
import type { DeckFormat } from '../types'

/** Qué archivos bajar: el usuario tilda los que quiere. */
export interface DeckExportSelection {
  image: boolean
  pdf: boolean
  ydk: boolean
}

export const DECK_EXPORT_FILES: ReadonlyArray<{ key: keyof DeckExportSelection; label: string; description: string }> = [
  { key: 'image', label: 'Imagen del deck', description: 'JPG en alta resolución, como se ve en el builder.' },
  { key: 'pdf', label: 'Decklist oficial', description: 'La planilla de Konami para torneos, en PDF.' },
  { key: 'ydk', label: 'Archivo YDK', description: 'Para abrir el deck en simuladores y otras apps.' },
]

const FILE_NAMES: Record<keyof DeckExportSelection, string> = { image: 'imagen', pdf: 'decklist PDF', ydk: 'YDK' }

/** "imagen, decklist PDF y YDK": los archivos elegidos, para el botón y el aviso. */
export function describeExportSelection(selection: DeckExportSelection): string {
  const names = DECK_EXPORT_FILES.filter((file) => selection[file.key]).map((file) => FILE_NAMES[file.key])

  if (names.length === 0) {
    return ''
  }

  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
}

interface DeckExportResult {
  // Secciones del PDF oficial que no entraron completas.
  decklistOverflow: string[]
}

export async function exportDeckAssets(
  deckBuilder: DeckBuilderState,
  deckFormat: DeckFormat,
  selection: DeckExportSelection,
): Promise<DeckExportResult> {
  const filenameBase = deckBuilder.deckName || 'ygo-probability-lab-deck'
  const decklist = selection.pdf ? buildKdeDecklist(deckBuilder) : null
  // Cada archivo se genera por separado: si falla el PDF (planilla que no carga) igual se bajan la imagen y el YDK.
  const [image, pdf] = await Promise.allSettled([
    selection.image ? renderDeckAsCanvas(deckBuilder, deckFormat).then(canvasToJpegBlob) : Promise.resolve(null),
    decklist ? buildDecklistPdf(decklist) : Promise.resolve(null),
  ])

  if (image.status === 'fulfilled' && image.value) downloadBlob(image.value, filenameBase, 'jpg')
  if (pdf.status === 'fulfilled' && pdf.value) downloadBlob(new Blob([pdf.value as BlobPart], { type: 'application/pdf' }), `${filenameBase}-decklist`, 'pdf')
  if (selection.ydk) downloadYdk(deckBuilder)

  const failed = [image.status === 'rejected' && 'la imagen', pdf.status === 'rejected' && 'el PDF'].filter(Boolean)

  if (failed.length > 0) {
    throw new Error(`Se descargó lo que pude, pero falló ${failed.join(' y ')}.`)
  }

  return { decklistOverflow: decklist?.overflow ?? [] }
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

/** Baja el .ydk solo (el paso 2 para llevar el deck a Neuron). */
export function downloadYdk(deckBuilder: DeckBuilderState): void {
  downloadBlob(new Blob([buildYdkText(deckBuilder)], { type: 'text/plain;charset=utf-8' }), deckBuilder.deckName || 'ygo-probability-lab-deck', 'ydk')
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
