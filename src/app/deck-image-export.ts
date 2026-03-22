import { buildDeckZoneBreakdown } from './deck-utils'
import type { DeckBuilderState, DeckCardInstance, DeckZone } from './model'

interface ExportZone {
  key: DeckZone
  title: string
  cards: DeckCardInstance[]
  background: string
}

const ZONE_BACKGROUNDS: Record<DeckZone, string> = {
  main: '#8f5e37',
  extra: '#6757a5',
  side: '#587538',
}

const PAGE_BACKGROUND = '#0a0711'
const PANEL_BACKGROUND = '#15111f'
const PANEL_BORDER = '#35214a'
const TEXT_MAIN = '#f4f1ff'
const TEXT_MUTED = '#b2a9c6'
const ACCENT = '#9B00FF'
const CARD_BORDER = '#1a1326'
const CARD_BACKGROUND = '#160f21'

export async function exportDeckAsImage(deckBuilder: DeckBuilderState): Promise<void> {
  const zones: ExportZone[] = [
    {
      key: 'main',
      title: 'Main Deck',
      cards: deckBuilder.main,
      background: ZONE_BACKGROUNDS.main,
    },
    {
      key: 'extra',
      title: 'Extra Deck',
      cards: deckBuilder.extra,
      background: ZONE_BACKGROUNDS.extra,
    },
    {
      key: 'side',
      title: 'Side Deck',
      cards: deckBuilder.side,
      background: ZONE_BACKGROUNDS.side,
    },
  ]

  const columns = 10
  const cardWidth = 96
  const cardHeight = Math.round(cardWidth / 0.72)
  const cardGap = 4
  const pagePadding = 28
  const zonePadding = 14
  const sectionGap = 24
  const sectionHeaderHeight = 44
  const footerHeight = 0
  const gridWidth = columns * cardWidth + (columns - 1) * cardGap
  const canvasWidth = pagePadding * 2 + gridWidth + zonePadding * 2

  const zoneHeights = zones.map((zone) => {
    const rows = Math.max(1, Math.ceil(zone.cards.length / columns))
    const gridHeight = rows * cardHeight + Math.max(0, rows - 1) * cardGap
    return sectionHeaderHeight + zonePadding * 2 + gridHeight
  })

  const canvasHeight =
    pagePadding * 2 +
    footerHeight +
    zoneHeights.reduce((total, current) => total + current, 0) +
    sectionGap * Math.max(zones.length - 1, 0)

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No pude preparar la imagen del deck.')
  }

  drawPageBackground(context, canvasWidth, canvasHeight)

  let currentTop = pagePadding

  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex += 1) {
    const zone = zones[zoneIndex]
    const zoneHeight = zoneHeights[zoneIndex] ?? 0
    drawZonePanel(context, zone, pagePadding, currentTop, canvasWidth - pagePadding * 2, zoneHeight)

    const images = await loadZoneImages(zone.cards)
    const gridTop = currentTop + sectionHeaderHeight + zonePadding
    const gridLeft = pagePadding + zonePadding

    zone.cards.forEach((card, index) => {
      const row = Math.floor(index / columns)
      const column = index % columns
      const x = gridLeft + column * (cardWidth + cardGap)
      const y = gridTop + row * (cardHeight + cardGap)
      const image = images[index]

      context.fillStyle = CARD_BACKGROUND
      context.fillRect(x, y, cardWidth, cardHeight)

      if (image) {
        context.drawImage(image, x, y, cardWidth, cardHeight)
      } else {
        context.fillStyle = TEXT_MUTED
        context.font = '12px sans-serif'
        context.fillText(card.name, x + 6, y + 18, cardWidth - 12)
      }

      context.strokeStyle = CARD_BORDER
      context.lineWidth = 1
      context.strokeRect(x + 0.5, y + 0.5, cardWidth - 1, cardHeight - 1)
    })

    currentTop += zoneHeight + sectionGap
  }

  const blob = await canvasToBlob(canvas)
  const filename = `${sanitizeFilename(deckBuilder.deckName || 'ygo-probability-lab-deck')}.png`
  downloadBlob(blob, filename)
}

function drawPageBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, PAGE_BACKGROUND)
  gradient.addColorStop(1, '#140d22')
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
}

function drawZonePanel(
  context: CanvasRenderingContext2D,
  zone: ExportZone,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  context.fillStyle = PANEL_BACKGROUND
  context.fillRect(left, top, width, height)
  context.strokeStyle = PANEL_BORDER
  context.lineWidth = 1
  context.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1)

  context.fillStyle = zone.background
  context.fillRect(left + 14, top + 44, width - 28, height - 58)

  context.fillStyle = TEXT_MAIN
  context.font = '700 22px sans-serif'
  context.fillText(zone.title, left + 14, top + 28)

  context.fillStyle = TEXT_MUTED
  context.font = '14px sans-serif'
  const breakdown = buildDeckZoneBreakdown(zone.key, zone.cards)
  const detail = `${zone.cards.length} cartas${breakdown ? ` (${breakdown})` : ''}`
  context.fillText(detail, left + 140, top + 28)
}

async function loadZoneImages(cards: DeckCardInstance[]): Promise<Array<HTMLImageElement | null>> {
  return Promise.all(
    cards.map(async (card) => {
      const source = card.apiCard.imageUrlSmall || card.apiCard.imageUrl

      if (!source) {
        return null
      }

      try {
        return await loadImage(toExportImageUrl(source))
      } catch {
        return null
      }
    }),
  )
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo cargar la imagen de una carta.'))
    image.src = source
  })
}

function toExportImageUrl(source: string): string {
  if (source.startsWith('data:') || source.startsWith('blob:')) {
    return source
  }

  try {
    const url = new URL(source)
    const raw = `${url.host}${url.pathname}${url.search}`
    return `https://images.weserv.nl/?url=${encodeURIComponent(raw)}`
  } catch {
    return source
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No pude generar el PNG del deck.'))
        return
      }

      resolve(blob)
    }, 'image/png')
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function sanitizeFilename(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitized || 'deck-export'
}
