import { cardImageSrc } from './card-image-source'
import { prefersLightText, type MakerCard, type MakerList } from './tierlist-maker'

/** Medidas de la imagen (px lógicos; se dibuja al doble para que se vea nítida). Las filas van como en pantalla: el recuadro de color a la izquierda y las cartas pegadas, en renglones. */
const WIDTH = 1100
const LABEL_WIDTH = 140
const CARD_WIDTH = 104
const CARD_HEIGHT = Math.round((CARD_WIDTH * 614) / 421)
const GAP = 2
const MARGIN = 24
const SCALE = 2

const BACKGROUND = '#150a24'
const ROW_BACKGROUND = '#231238'
const TEXT = '#fdffff'
const LABEL_TEXT = '#150a24'
const FONT = '"Lexend Deca", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export interface TierImageRow {
  top: number
  height: number
  perRow: number
}

export interface TierImageLayout {
  width: number
  height: number
  rows: TierImageRow[]
}

/** Dónde va cada fila en la imagen, según cuántas cartas tiene: todas miden al menos una carta de alto y crecen un renglón por cada tanda de cartas que no entra. Puro (se prueba sin dibujar). */
export function computeTierImageLayout(counts: readonly number[]): TierImageLayout {
  const perRow = Math.max(1, Math.floor((WIDTH - 2 * MARGIN - LABEL_WIDTH - GAP) / (CARD_WIDTH + GAP)))
  let top = MARGIN
  const rows = counts.map<TierImageRow>((count) => {
    const lines = Math.max(1, Math.ceil(count / perRow))
    const height = lines * (CARD_HEIGHT + GAP) + GAP
    const row = { top, height, perRow }

    top += height + GAP

    return row
  })

  return { width: WIDTH, height: top - GAP + MARGIN, rows }
}

function loadImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()

    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = source
  })
}

/** Las imágenes por el proxy de la app (el mismo origen: el lienzo las puede leer). Una que no carga queda en null y se dibuja como un hueco con el nombre. */
async function loadCardImages(cards: readonly MakerCard[]): Promise<Map<number, HTMLImageElement | null>> {
  const entries = await Promise.all(cards.map(async (card) => [card.id, card.image ? await loadImage(cardImageSrc(card.image, 320)) : null] as const))

  return new Map(entries)
}

/** Las palabras de un nombre repartidas en renglones que entran en el ancho (para el recuadro de la fila: «Muy buenas» no cabe en uno). */
function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ''

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word

    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }

  if (current) lines.push(current)

  return lines.length > 0 ? lines : ['']
}

/** La tier list dibujada como imagen (sin la bandeja de «sin clasificar»): una fila por tier con su color y sus cartas. */
export async function renderTierListImage(list: MakerList): Promise<HTMLCanvasElement> {
  const cards = list.tiers.flatMap((tier) => tier.cards.map((id) => list.cards[id]).filter((card): card is MakerCard => Boolean(card)))
  const [images] = await Promise.all([loadCardImages(cards), typeof document !== 'undefined' && document.fonts ? document.fonts.ready.catch(() => undefined) : Promise.resolve()])
  const layout = computeTierImageLayout(list.tiers.map((tier) => tier.cards.length))
  const canvas = document.createElement('canvas')

  canvas.width = layout.width * SCALE
  canvas.height = Math.ceil(layout.height * SCALE)

  const context = canvas.getContext('2d')

  if (!context) throw new Error('canvas')

  context.scale(SCALE, SCALE)
  context.imageSmoothingQuality = 'high'
  context.fillStyle = BACKGROUND
  context.fillRect(0, 0, layout.width, layout.height)

  context.textBaseline = 'middle'
  context.textAlign = 'left'

  list.tiers.forEach((tier, index) => {
    const row = layout.rows[index]

    if (!row) return

    const left = MARGIN
    const itemsLeft = left + LABEL_WIDTH + GAP

    context.fillStyle = tier.color
    context.fillRect(left, row.top, LABEL_WIDTH, row.height)
    context.fillStyle = ROW_BACKGROUND
    context.fillRect(itemsLeft, row.top, layout.width - MARGIN - itemsLeft, row.height)

    const size = Array.from(tier.label).length <= 2 ? 56 : Array.from(tier.label).length <= 6 ? 30 : 22

    // Como en pantalla (`TierStrip`): la letra oscura sobre los pasteles y clara sobre un color oscuro.
    context.fillStyle = prefersLightText(tier.color) ? TEXT : LABEL_TEXT
    context.font = `700 ${size}px ${FONT}`
    context.textAlign = 'center'

    const lines = wrap(context, tier.label, LABEL_WIDTH - 16)
    const lineHeight = size * 1.15

    lines.forEach((line, lineIndex) => context.fillText(line, left + LABEL_WIDTH / 2, row.top + row.height / 2 + (lineIndex - (lines.length - 1) / 2) * lineHeight))

    tier.cards.forEach((cardId, position) => {
      const card = list.cards[cardId]

      if (!card) return

      const x = itemsLeft + GAP + (position % row.perRow) * (CARD_WIDTH + GAP)
      const y = row.top + GAP + Math.floor(position / row.perRow) * (CARD_HEIGHT + GAP)
      const image = images.get(cardId)

      if (image) {
        context.drawImage(image, x, y, CARD_WIDTH, CARD_HEIGHT)
      } else {
        context.fillStyle = '#2b1745'
        context.fillRect(x, y, CARD_WIDTH, CARD_HEIGHT)
        context.fillStyle = TEXT
        context.font = `600 12px ${FONT}`
        context.textAlign = 'center'
        wrap(context, card.name, CARD_WIDTH - 12).slice(0, 5).forEach((line, lineIndex) => context.fillText(line, x + CARD_WIDTH / 2, y + 18 + lineIndex * 15))
      }
    })
  })

  return canvas
}

/** El lienzo como PNG (sin pérdida: son letras y bordes). */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png')
  })
}
