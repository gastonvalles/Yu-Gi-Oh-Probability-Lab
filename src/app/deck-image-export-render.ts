import { t } from '../i18n'
import { cardImageSrc } from './card-image-source'
import { getCardLimitIndicator } from './deck-format'
import { PAGE_PADDING, computeDeckImageLayout, type Rect, type ZoneLayout } from './deck-image-layout'
import { buildDeckZoneTypeCounts } from './deck-presentation'
import type { DeckBuilderState, DeckCardInstance, DeckZone } from './model'
import { formatInteger } from './utils'
import type { DeckFormat } from '../types'

const ZONE_TITLES: Record<DeckZone, string> = { main: 'Main', extra: 'Extra', side: 'Side' }

// Los mismos colores que el builder (src/index.css y deck-zone-styles.ts): la imagen es una captura de la pantalla.
const ZONE_DOT: Record<DeckZone, string> = { main: '#9b00ff', extra: '#3b82f6', side: '#00ffa3' }
const ZONE_TINT: Record<DeckZone, string> = {
  main: 'rgba(155, 0, 255, 0.14)',
  extra: 'rgba(59, 130, 246, 0.13)',
  side: 'rgba(0, 255, 163, 0.09)',
}
const TYPE_SWATCH: Record<string, string> = {
  monster: '#ff9142',
  spell: '#00ffa3',
  trap: 'rgb(236, 72, 153)',
  fusion: 'rgb(148, 163, 184)',
  xyz: 'rgb(148, 163, 184)',
  synchro: '#3b82f6',
  link: '#3b82f6',
}
const PAGE_BACKGROUND = '#0a0816'
const SURFACE_BASE = 'rgba(19, 15, 43, 0.6)'
const TEXT_MAIN = '#eeeafc'
const TEXT_MUTED = '#bfbbd9'
const CARD_BACKGROUND = '#1b1542'
const SURFACE_RADIUS = 16
// 150px lógicos × 2 = 300px por carta: cerca del tamaño nativo de card_small (268px).
const EXPORT_RESOLUTION_SCALE = 2
// El badge se dibuja en unidades de 23px de alto; en el builder mide ~un tercio del ancho de la carta.
const BADGE_UNIT_HEIGHT = 23
const BADGE_HEIGHT_RATIO = 0.32
const FONT_STACK = '"Lexend Deca", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export async function renderDeckAsCanvas(
  deckBuilder: DeckBuilderState,
  deckFormat: DeckFormat,
  scale: number = EXPORT_RESOLUTION_SCALE,
): Promise<HTMLCanvasElement> {
  const layout = computeDeckImageLayout({
    main: deckBuilder.main.length,
    extra: deckBuilder.extra.length,
    side: deckBuilder.side.length,
  })
  const [imagesByZone] = await Promise.all([
    Promise.all(layout.zones.map((zone) => loadZoneImages(deckBuilder[zone.zone]))),
    ensureFonts(),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(layout.width * scale)
  canvas.height = Math.ceil(layout.height * scale)

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error(t('deck.export.error.canvas'))
  }

  context.scale(scale, scale)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = PAGE_BACKGROUND
  context.fillRect(0, 0, layout.width, layout.height)

  layout.zones.forEach((zoneLayout, zoneIndex) => {
    const cards = deckBuilder[zoneLayout.zone]

    drawZoneHeader(context, zoneLayout, cards)
    drawZoneSurface(context, zoneLayout)

    context.save()
    roundedRectPath(context, zoneLayout.panel, SURFACE_RADIUS)
    context.clip()
    zoneLayout.cards.forEach((rect, cardIndex) => {
      const card = cards[cardIndex]

      if (card) {
        drawCard(context, rect, card, imagesByZone[zoneIndex]?.[cardIndex] ?? null, deckFormat, cardIndex > 0)
      }
    })
    context.restore()
  })

  drawCredit(context, layout.width, layout.height)

  return canvas
}

/** Marca discreta en el margen de abajo: de dónde salió la imagen y de quién es (se comparte mucho). */
function drawCredit(context: CanvasRenderingContext2D, width: number, height: number) {
  const host = typeof location === 'undefined' ? '' : location.host

  context.save()
  context.font = `500 12px ${FONT_STACK}`
  context.textAlign = 'right'
  context.textBaseline = 'alphabetic'
  context.fillStyle = 'rgba(191, 187, 217, 0.55)'
  // i18n-ignore: nombre propio, no se traduce
  context.fillText(`${host ? `${host} · ` : ''}© Gastón Valles`, width - PAGE_PADDING, height - 8)
  context.restore()
}

/** La tipografía de la app ya está en la página; se espera a que el navegador la tenga lista para el canvas. */
async function ensureFonts(): Promise<void> {
  try {
    await Promise.all([document.fonts.load(`600 19px ${FONT_STACK}`), document.fonts.load(`500 14px ${FONT_STACK}`)])
  } catch {
    // Sin Font Loading API (o sin la fuente): se dibuja con la de reserva.
  }
}

function drawZoneHeader(context: CanvasRenderingContext2D, { zone, header }: ZoneLayout, cards: DeckCardInstance[]) {
  const centerY = header.y + header.height / 2

  context.save()
  context.textBaseline = 'middle'

  // Punto de color + "Main [44]".
  context.fillStyle = ZONE_DOT[zone]
  context.beginPath()
  context.arc(header.x + 7, centerY, 5, 0, Math.PI * 2)
  context.fill()

  let x = header.x + 22
  context.fillStyle = TEXT_MAIN
  context.font = `600 19px ${FONT_STACK}`
  context.fillText(ZONE_TITLES[zone], x, centerY)
  x += context.measureText(ZONE_TITLES[zone]).width + 6
  context.fillStyle = TEXT_MUTED
  context.font = `500 19px ${FONT_STACK}`
  context.fillText(`[${formatInteger(cards.length)}]`, x, centerY)

  // Conteos por tipo, alineados a la derecha (cuadradito de color + número).
  context.font = `600 14px ${FONT_STACK}`
  let right = header.x + header.width - 2

  for (const entry of [...buildDeckZoneTypeCounts(zone, cards)].reverse()) {
    const label = formatInteger(entry.count)
    const labelWidth = context.measureText(label).width

    context.fillStyle = TEXT_MUTED
    context.fillText(label, right - labelWidth, centerY)
    right -= labelWidth + 6
    context.fillStyle = TYPE_SWATCH[entry.kind] ?? TEXT_MUTED
    roundedRectPath(context, { x: right - 10, y: centerY - 5, width: 10, height: 10 }, 3)
    context.fill()
    right -= 10 + 14
  }

  context.restore()
}

function drawZoneSurface(context: CanvasRenderingContext2D, { zone, panel }: ZoneLayout) {
  context.save()
  roundedRectPath(context, panel, SURFACE_RADIUS)
  context.fillStyle = SURFACE_BASE
  context.fill()

  const tint = context.createLinearGradient(0, panel.y, 0, panel.y + panel.height)
  tint.addColorStop(0, ZONE_TINT[zone])
  tint.addColorStop(1, 'rgba(0, 0, 0, 0)')
  context.fillStyle = tint
  context.fill()
  context.restore()
}

function drawCard(
  context: CanvasRenderingContext2D,
  rect: Rect,
  card: DeckCardInstance,
  image: HTMLImageElement | null,
  deckFormat: DeckFormat,
  shadow: boolean,
) {
  // Sombra al costado: cuando las cartas se superponen se distingue cada una.
  context.save()
  if (shadow) {
    context.shadowColor = 'rgba(0, 0, 0, 0.5)'
    context.shadowBlur = 8
    context.shadowOffsetX = -3
  }
  context.fillStyle = CARD_BACKGROUND
  context.fillRect(rect.x, rect.y, rect.width, rect.height)
  context.restore()

  if (image) {
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height)
  } else {
    context.fillStyle = TEXT_MUTED
    context.font = `600 13px ${FONT_STACK}`
    context.fillText(card.name, rect.x + 6, rect.y + 20, rect.width - 12)
  }

  const indicator = getCardLimitIndicator(card.apiCard, deckFormat)

  if (indicator) {
    context.save()
    context.translate(rect.x, rect.y)
    const badgeScale = (rect.width * BADGE_HEIGHT_RATIO) / BADGE_UNIT_HEIGHT
    context.scale(badgeScale, badgeScale)
    drawCardLimitBadge(context, -1, -1, indicator.value)
    context.restore()
  }
}

function drawCardLimitBadge(context: CanvasRenderingContext2D, left: number, top: number, value: number) {
  context.save()

  const text = String(value)
  const digitCount = text.length
  const outerRadiusX = digitCount === 1 ? 11.5 : digitCount === 2 ? 15.5 : 18.5
  const innerRadiusX = digitCount === 1 ? 8.4 : digitCount === 2 ? 12.25 : 15.15
  const centerX = left + outerRadiusX
  const centerY = top + 11.5
  const textOffsetX = digitCount === 1 ? (value === 1 ? -0.38 : value === 2 ? 0.15 : 0) : 0
  const textOffsetY = digitCount === 1 ? (value === 1 ? 0.99 : 0.5) : 0.68
  const fontSize = digitCount === 1 ? 14 : digitCount === 2 ? 11.5 : 9

  context.shadowColor = 'rgba(0, 0, 0, 0.45)'
  context.shadowBlur = 1
  context.shadowOffsetY = 1
  context.fillStyle = '#e30e0e'
  context.beginPath()
  context.ellipse(centerX, centerY, outerRadiusX, 11.5, 0, 0, Math.PI * 2)
  context.fill()
  context.shadowColor = 'transparent'

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

function roundedRectPath(context: CanvasRenderingContext2D, rect: Rect, radius: number) {
  const r = Math.min(radius, rect.width / 2, rect.height / 2)

  context.beginPath()
  context.moveTo(rect.x + r, rect.y)
  context.lineTo(rect.x + rect.width - r, rect.y)
  context.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + r)
  context.lineTo(rect.x + rect.width, rect.y + rect.height - r)
  context.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - r, rect.y + rect.height)
  context.lineTo(rect.x + r, rect.y + rect.height)
  context.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - r)
  context.lineTo(rect.x, rect.y + r)
  context.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y)
  context.closePath()
}

async function loadZoneImages(cards: DeckCardInstance[]): Promise<Array<HTMLImageElement | null>> {
  return Promise.all(
    cards.map(async (card) => {
      // Primero la chica (es la que muestra el builder y pesa menos); la grande sólo si no hay otra.
      const sources = [card.apiCard.imageUrlSmall, card.apiCard.imageUrl].filter((source): source is string => Boolean(source))

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
    // i18n-ignore: error interno, loadZoneImages lo captura y prueba la otra imagen
    image.onerror = () => reject(new Error('No se pudo cargar la imagen de una carta.'))
    image.src = source
  })
}

/** Por nuestro proxy la imagen es del mismo origen: el lienzo la puede leer sin pasar por un servicio de terceros. */
function toExportImageUrl(source: string): string {
  return cardImageSrc(source)
}
