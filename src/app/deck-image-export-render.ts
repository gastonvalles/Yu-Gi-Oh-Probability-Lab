import { getCardLimitIndicator } from './deck-format'
import type { DeckBuilderState, DeckCardInstance, DeckZone } from './model'
import { buildDeckZoneBreakdown } from './deck-presentation'
import type { DeckFormat } from '../types'

interface ExportZone {
  key: DeckZone
  title: string
  cards: DeckCardInstance[]
  background: string
}

const ZONE_BACKGROUNDS: Record<DeckZone, string> = {
  main: '#1a1228',
  extra: '#101a2d',
  side: '#0f221c',
}

const PAGE_BACKGROUND = '#0b0b0f'
const PAGE_BACKGROUND_END = '#12121a'
const PANEL_BACKGROUND = '#12121a'
const PANEL_BORDER = '#1f1f2b'
const TEXT_MAIN = '#ededed'
const TEXT_MUTED = '#b7b7c6'
const CARD_BORDER = '#1f1f2b'
const CARD_BACKGROUND = '#12121a'
const EXPORT_RESOLUTION_SCALE = 2

export async function renderDeckAsCanvas(
  deckBuilder: DeckBuilderState,
  deckFormat: DeckFormat,
): Promise<HTMLCanvasElement> {
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
    const rows = Math.max(1, buildZoneRows(zone.cards, columns).length)
    const gridHeight = rows * cardHeight + Math.max(0, rows - 1) * cardGap
    return sectionHeaderHeight + zonePadding * 2 + gridHeight
  })

  const canvasHeight =
    pagePadding * 2 +
    footerHeight +
    zoneHeights.reduce((total, current) => total + current, 0) +
    sectionGap * Math.max(zones.length - 1, 0)

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth * EXPORT_RESOLUTION_SCALE
  canvas.height = canvasHeight * EXPORT_RESOLUTION_SCALE

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No pude preparar la imagen del deck.')
  }

  context.scale(EXPORT_RESOLUTION_SCALE, EXPORT_RESOLUTION_SCALE)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  drawPageBackground(context, canvasWidth, canvasHeight)

  let currentTop = pagePadding

  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex += 1) {
    const zone = zones[zoneIndex]
    const zoneHeight = zoneHeights[zoneIndex] ?? 0
    drawZonePanel(context, zone, pagePadding, currentTop, canvasWidth - pagePadding * 2, zoneHeight)

    const images = await loadZoneImages(zone.cards)
    const gridTop = currentTop + sectionHeaderHeight + zonePadding
    const gridLeft = pagePadding + zonePadding
    const zoneRows = buildZoneRows(zone.cards, columns)

    zoneRows.forEach((rowCards, rowIndex) => {
      const rowLeft = getZoneRowLeft({
        zone: zone.key,
        gridLeft,
        gridWidth,
        rowCardCount: rowCards.length,
        cardWidth,
        cardGap,
      })
      const y = gridTop + rowIndex * (cardHeight + cardGap)

      rowCards.forEach((card, column) => {
        const x = rowLeft + column * (cardWidth + cardGap)
        const image = images[card.index]

        context.fillStyle = CARD_BACKGROUND
        context.fillRect(x, y, cardWidth, cardHeight)

        if (image) {
          context.drawImage(image, x, y, cardWidth, cardHeight)
        } else {
          context.fillStyle = TEXT_MUTED
          context.font = '12px sans-serif'
          context.fillText(card.card.name, x + 6, y + 18, cardWidth - 12)
        }

        context.strokeStyle = CARD_BORDER
        context.lineWidth = 1
        context.strokeRect(x + 0.5, y + 0.5, cardWidth - 1, cardHeight - 1)

        const indicator = getCardLimitIndicator(card.card.apiCard, deckFormat)

        if (indicator) {
          drawCardLimitBadge(context, x, y, indicator.value)
        }
      })
    })

    currentTop += zoneHeight + sectionGap
  }

  return canvas
}

function drawCardLimitBadge(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  value: number,
) {
  context.save()

  const text = String(value)
  const digitCount = text.length
  const outerRadiusX = digitCount === 1 ? 11.5 : digitCount === 2 ? 15.5 : 18.5
  const innerRadiusX = digitCount === 1 ? 8.4 : digitCount === 2 ? 12.25 : 15.15
  const badgeWidth = outerRadiusX * 2
  const centerX = left + badgeWidth / 2 - 0.5
  const centerY = top + 11
  const textOffsetX = digitCount === 1 ? (value === 1 ? -0.38 : value === 2 ? 0.15 : 0) : 0
  const textOffsetY = digitCount === 1 ? (value === 1 ? 0.99 : 0.5) : 0.68
  const fontSize = digitCount === 1 ? 14 : digitCount === 2 ? 11.5 : 9

  context.fillStyle = '#e30e0e'
  context.beginPath()
  context.ellipse(centerX, centerY, outerRadiusX, 11.5, 0, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = '#000000'
  context.beginPath()
  context.ellipse(centerX, centerY, innerRadiusX, 8.4, 0, 0, Math.PI * 2)
  context.fill()

  context.strokeStyle = '#000000'
  context.lineWidth = 1.2
  context.font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  context.strokeText(text, centerX + textOffsetX, centerY + textOffsetY)
  context.fillStyle = '#ffe15a'
  context.fillText(text, centerX + textOffsetX, centerY + textOffsetY)

  context.restore()
}

function drawPageBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, PAGE_BACKGROUND)
  gradient.addColorStop(1, PAGE_BACKGROUND_END)
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
  context.save()

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
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  const breakdown = buildDeckZoneBreakdown(zone.key, zone.cards)
  const detail = `${zone.cards.length} cartas${breakdown ? ` (${breakdown})` : ''}`
  context.fillText(detail, left + 140, top + 28)

  context.restore()
}

function buildZoneRows(
  cards: DeckCardInstance[],
  columns: number,
): Array<Array<{ card: DeckCardInstance; index: number }>> {
  const rows: Array<Array<{ card: DeckCardInstance; index: number }>> = []

  for (let startIndex = 0; startIndex < cards.length; startIndex += columns) {
    rows.push(
      cards.slice(startIndex, startIndex + columns).map((card, offset) => ({
        card,
        index: startIndex + offset,
      })),
    )
  }

  return rows.length > 0 ? rows : [[]]
}

function getZoneRowLeft(options: {
  zone: DeckZone
  gridLeft: number
  gridWidth: number
  rowCardCount: number
  cardWidth: number
  cardGap: number
}): number {
  if (options.zone === 'main' || options.rowCardCount <= 0) {
    return options.gridLeft
  }

  const rowWidth =
    options.rowCardCount * options.cardWidth + Math.max(0, options.rowCardCount - 1) * options.cardGap

  return options.gridLeft + Math.max(0, Math.floor((options.gridWidth - rowWidth) / 2))
}

async function loadZoneImages(cards: DeckCardInstance[]): Promise<Array<HTMLImageElement | null>> {
  return Promise.all(
    cards.map(async (card) => {
      const sources = [card.apiCard.imageUrl, card.apiCard.imageUrlSmall].filter(
        (source): source is string => Boolean(source),
      )

      for (const source of sources) {
        try {
          return await loadImage(toExportImageUrl(source))
        } catch {
          continue
        }
      }

      return null
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
