import kdeTemplateUrl from '../assets/kde-decklist.pdf?url'
import { toPortableDeckBuilder } from './app-state-codec'
import { canvasToJpegBlob, downloadBlob } from './deck-image-export-download'
import { renderDeckAsCanvas } from './deck-image-export-render'
import { buildKdeDecklist } from './kde-decklist'
import type { DeckBuilderState, DeckCardInstance, DeckZone } from './model'
import type { DeckFormat } from '../types'

/** Qué archivos bajar: el usuario tilda los que quiere. */
export interface DeckExportSelection {
  image: boolean
  pdf: boolean
  ydk: boolean
  txt: boolean
  json: boolean
}

export const DECK_EXPORT_FILES: ReadonlyArray<{ key: keyof DeckExportSelection; label: string; description: string }> = [
  { key: 'image', label: 'Imagen del deck', description: 'JPG en alta resolución, como se ve en el builder.' },
  { key: 'pdf', label: 'Decklist oficial', description: 'La planilla de Konami para torneos, en PDF.' },
  { key: 'ydk', label: 'Archivo YDK', description: 'Para abrir el deck en simuladores y otras apps.' },
  { key: 'txt', label: 'Lista en texto', description: 'Cantidad y nombre por línea, con Main, Extra y Side: para pegar en cualquier lado (y volver a importar acá).' },
  { key: 'json', label: 'Copia para esta app', description: 'El deck con sus roles, tal cual: se importa acá en otro navegador.' },
]

const FILE_NAMES: Record<keyof DeckExportSelection, string> = { image: 'imagen', pdf: 'decklist PDF', ydk: 'YDK', txt: 'lista TXT', json: 'JSON' }

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
  if (selection.txt) downloadBlob(new Blob([buildDecklistText(deckBuilder)], { type: 'text/plain;charset=utf-8' }), filenameBase, 'txt')
  if (selection.json) downloadBlob(new Blob([buildDeckJson(deckBuilder)], { type: 'application/json;charset=utf-8' }), filenameBase, 'json')

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

const ZONE_TITLES: Record<DeckZone, string> = { main: 'Main Deck', extra: 'Extra Deck', side: 'Side Deck' }

/** "Main Deck (40)" y debajo "3 Ash Blossom & Joyous Spring": el formato que la importación de texto vuelve a leer. */
export function buildDecklistText(deckBuilder: DeckBuilderState): string {
  const sections = (['main', 'extra', 'side'] as const)
    .filter((zone) => deckBuilder[zone].length > 0)
    .map((zone) => {
      const counts = new Map<string, number>()

      for (const card of deckBuilder[zone]) {
        counts.set(card.name, (counts.get(card.name) ?? 0) + 1)
      }

      return [`${ZONE_TITLES[zone]} (${deckBuilder[zone].length})`, ...[...counts].map(([name, count]) => `${count} ${name}`)].join('\n')
    })

  return `${sections.join('\n\n')}\n`
}

/** El deck con sus roles, en el formato que la importación de JSON vuelve a leer tal cual. */
export function buildDeckJson(deckBuilder: DeckBuilderState): string {
  return JSON.stringify(toPortableDeckBuilder(deckBuilder), null, 2)
}
