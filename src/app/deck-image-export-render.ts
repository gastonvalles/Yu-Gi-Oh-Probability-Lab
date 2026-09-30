import { getCardLimitIndicator, getDeckFormatLabel } from './deck-format'
import { computeDeckImageLayout, type Rect, type ZoneLayout } from './deck-image-layout'
import type { DeckBuilderState, DeckCardInstance, DeckZone } from './model'
import { buildDeckZoneBreakdown } from './deck-presentation'
import type { DeckFormat } from '../types'

const ZONE_TITLES: Record<DeckZone, string> = {
  main: 'Main Deck',
  extra: 'Extra Deck',
  side: 'Side Deck',
}

const ZONE_BACKGROUNDS: Record<DeckZone, string> = {
  main: '#1a1228',
  extra: '#101a2d',
  side: '#0f221c',
}

const PAGE_BACKGROUND = '#0b0b0f'
const PAGE_BACKGROUND_END = '#12121a'
const PANEL_BORDER = '#262635'
const TEXT_MAIN = '#ededed'
const TEXT_MUTED = '#b7b7c6'
const CARD_BACKGROUND = '#12121a'
// 168px lógicos × 2 ≈ 336px por carta: cerca de la resolución nativa (421px).
const EXPORT_RESOLUTION_SCALE = 2
// El badge original estaba pensado para cartas de 96px.
const BADGE_BASE_CARD_WIDTH = 96
const FONT_STACK = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export async function renderDeckAsCanvas(
  deckBuilder: DeckBuilderState,
  deckFormat: DeckFormat,
): Promise<HTMLCanvasElement> {
  const layout = computeDeckImageLayout({
    main: deckBuilder.main.length,
    extra: deckBuilder.extra.length,
    side: deckBuilder.side.length,
  })
  const imagesByZone = await Promise.all(layout.zones.map((zone) => loadZoneImages(deckBuilder[zone.zone])))

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(layout.width * EXPORT_RESOLUTION_SCALE)
  canvas.height = Math.ceil(layout.height * EXPORT_RESOLUTION_SCALE)

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No pude preparar la imagen del deck.')
  }

  context.scale(EXPORT_RESOLUTION_SCALE, EXPORT_RESOLUTION_SCALE)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  drawPageBackground(context, layout.width, layout.height)
  drawHeader(context, layout.header, deckBuilder, deckFormat)

  layout.zones.forEach((zoneLayout, zoneIndex) => {
    const cards = deckBuilder[zoneLayout.zone]
    drawZonePanel(context, zoneLayout, cards)
    zoneLayout.cards.forEach((rect, cardIndex) => {
      const card = cards[cardIndex]

      if (card) {
        drawCard(context, rect, card, imagesByZone[zoneIndex]?.[cardIndex] ?? null, deckFormat)
      }
    })
  })

  return canvas
}

function drawHeader(
  context: CanvasRenderingContext2D,
  header: Rect,
  deckBuilder: DeckBuilderState,
  deckFormat: DeckFormat,
) {
  const counts = [
    `Main ${deckBuilder.main.length}`,
    deckBuilder.extra.length > 0 ? `Extra ${deckBuilder.extra.length}` : null,
    deckBuilder.side.length > 0 ? `Side ${deckBuilder.side.length}` : null,
  ].filter(Boolean)

  context.save()
  context.textBaseline = 'alphabetic'
  context.fillStyle = TEXT_MAIN
  context.font = `800 40px ${FONT_STACK}`
  context.fillText(deckBuilder.deckName.trim() || 'Mi deck', header.x, header.y + 42, header.width)
  context.fillStyle = TEXT_MUTED
  context.font = `500 20px ${FONT_STACK}`
  context.fillText([getDeckFormatLabel(deckFormat), ...counts].join('  ·  '), header.x, header.y + 76, header.width)
  context.restore()
}

function drawCard(
  context: CanvasRenderingContext2D,
  rect: Rect,
  card: DeckCardInstance,
  image: HTMLImageElement | null,
  deckFormat: DeckFormat,
) {
  // Sombra al costado: cuando las cartas se superponen (Extra/Side) se distingue cada una.
  context.save()
  context.shadowColor = 'rgba(0, 0, 0, 0.55)'
  context.shadowBlur = 10
  context.shadowOffsetX = -3
  context.fillStyle = CARD_BACKGROUND
  context.fillRect(rect.x, rect.y, rect.width, rect.height)
  context.restore()

  if (image) {
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height)
  } else {
    context.fillStyle = TEXT_MUTED
    context.font = `600 16px ${FONT_STACK}`
    context.fillText(card.name, rect.x + 8, rect.y + 24, rect.width - 16)
  }

  const indicator = getCardLimitIndicator(card.apiCard, deckFormat)

  if (indicator) {
    context.save()
    context.translate(rect.x, rect.y)
    const badgeScale = rect.width / BADGE_BASE_CARD_WIDTH
    context.scale(badgeScale, badgeScale)
    drawCardLimitBadge(context, 2, 2, indicator.value)
    context.restore()
  }
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

function drawZonePanel(context: CanvasRenderingContext2D, zoneLayout: ZoneLayout, cards: DeckCardInstance[]) {
  const { panel, zone } = zoneLayout

  context.save()
  context.fillStyle = ZONE_BACKGROUNDS[zone]
  context.fillRect(panel.x, panel.y, panel.width, panel.height)
  context.strokeStyle = PANEL_BORDER
  context.lineWidth = 1
  context.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.width - 1, panel.height - 1)

  context.textBaseline = 'alphabetic'
  context.fillStyle = TEXT_MAIN
  context.font = `700 22px ${FONT_STACK}`
  const title = `${ZONE_TITLES[zone]} (${cards.length})`
  context.fillText(title, panel.x + 16, panel.y + 30)

  const breakdown = buildDeckZoneBreakdown(zone, cards)

  if (breakdown) {
    const titleWidth = context.measureText(title).width
    context.fillStyle = TEXT_MUTED
    context.font = `500 16px ${FONT_STACK}`
    context.fillText(breakdown, panel.x + 16 + titleWidth + 14, panel.y + 30)
  }

  context.restore()
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
    return `https://images.weserv.nl/?url=${encodeURIComponent(raw)}&q=95`
  } catch {
    return source
  }
}
