import kdeTemplateUrl from '../assets/kde-decklist.pdf?url'
import { getLocale, t } from '../i18n'
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

// Las tablas guardan claves de mensajes, no textos: el texto se arma al leerlo, en el idioma de ese momento.
const FILE_KEYS = {
  image: { label: 'deck.export.files.image.label', description: 'deck.export.files.image.description', name: 'deck.export.files.image.name' },
  pdf: { label: 'deck.export.files.pdf.label', description: 'deck.export.files.pdf.description', name: 'deck.export.files.pdf.name' },
  ydk: { label: 'deck.export.files.ydk.label', description: 'deck.export.files.ydk.description', name: 'deck.export.files.ydk.name' },
  txt: { label: 'deck.export.files.txt.label', description: 'deck.export.files.txt.description', name: 'deck.export.files.txt.name' },
  json: { label: 'deck.export.files.json.label', description: 'deck.export.files.json.description', name: 'deck.export.files.json.name' },
} as const

export const DECK_EXPORT_FILES: ReadonlyArray<{ key: keyof DeckExportSelection; label: string; description: string }> = (
  Object.keys(FILE_KEYS) as Array<keyof DeckExportSelection>
).map((key) => ({
  key,
  get label() {
    return t(FILE_KEYS[key].label)
  },
  get description() {
    return t(FILE_KEYS[key].description)
  },
}))

/** "A, B y C" (en inglés "A, B, and C"): la lista con la conjunción del idioma actual. */
function joinList(items: string[]): string {
  return new Intl.ListFormat(getLocale(), { style: 'long', type: 'conjunction' }).format(items)
}

/** "imagen, decklist PDF y YDK": los archivos elegidos, para el botón y el aviso. */
export function describeExportSelection(selection: DeckExportSelection): string {
  return joinList(DECK_EXPORT_FILES.filter((file) => selection[file.key]).map((file) => t(FILE_KEYS[file.key].name)))
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

  const failed = [image.status === 'rejected' && t('deck.export.failed.image'), pdf.status === 'rejected' && t('deck.export.failed.pdf')].filter(
    (name): name is string => Boolean(name),
  )

  if (failed.length > 0) {
    throw new Error(t('deck.export.error.partial', { failed: joinList(failed) }))
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
    throw new Error(t('deck.export.error.template'))
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
