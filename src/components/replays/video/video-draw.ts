import remolino from '../../../assets/duelo/remolino-medio-movil.avif'
import remolinoIndigo from '../../../assets/duelo/remolino-medio-movil-indigo.avif'
import { easeInOut } from '../../../app/motion'
import { PHASES } from '../../../app/practice-mat'
import { t } from '../../../i18n'
import { CARD_BACK_URL, FX_RGB } from '../../probability/practice-styles'
import type { Flight } from './video-fx'
import { poseAt, poseOf, slotUnder, type Pose } from './video-motion'
import { cardRect, fieldRect, type Explain, type Rect, type Scene, type SceneCard, type SceneSlot } from './video-scene'

/**
 * Pinta una escena (`video-scene.ts`) en un lienzo: la mesa como en «Jugar solo» (la arena con su luz y su viñeta, la placa del campo con su marco y el arte de la Magia de
 * Campo de fondo de la mitad de quien la tiene), las manos en abanico, las vidas, el turno, la franja que explica la jugada y la marca del sitio. Los colores son los tokens del
 * sitio (`readVideoTheme`, leídos de las variables CSS) y la letra, Lexend Deca. Lo que no cambia (la arena y la placa; el arte del campo ya recortado) se pinta una vez y se
 * copia (`assets.cache`). Las transiciones (`video-motion.ts`): `drawFrame` con `moving` pinta el fondo sin las cartas en vuelo, y `drawFlight` las pone encima en cada momento;
 * lo demás que anima la mesa (la carta grande, el cartel de la fase, el barajado…) lo pinta `video-fx.ts`.
 */

export interface VideoTheme {
  background: string
  card: string
  raised: string
  border: string
  primary: string
  accent: string
  info: string
  infoSoft: string
  foreground: string
  muted: string
  soft: string
  fieldLine: string
  danger: string
  success: string
  /** Los mismos, como «r g b» para `rgb(r g b / alfa)`. */
  primaryRgb: string
  backgroundRgb: string
  accentRgb: string
  infoRgb: string
  /** El texto sobre un relleno violeta (la banda de fase tuya) y sobre uno lima (la del rival). */
  primaryForeground: string
  accentForeground: string
  primaryHoverRgb?: string
  cardRgb?: string
  foregroundRgb?: string
  fieldLineRgb?: string
  /** Los de la escena de la cadena y sus medallones (`--color-chain-*`, iguales en las dos paletas). */
  chain: ChainColors
}

export interface ChainColors {
  glow: string
  flash: string
  burst: string
  veil: string
  metal: string
  metalHi: string
  metalLo: string
}

/** Los colores del sitio, de sus variables CSS (los mismos del tema índigo de la app). */
export function readVideoTheme(root: Element = document.documentElement): VideoTheme {
  const style = getComputedStyle(root)
  const v = (name: string) => style.getPropertyValue(name).trim()
  return {
    background: v('--background'),
    card: v('--card-background'),
    raised: v('--surface-raised'),
    border: v('--border'),
    primary: v('--primary'),
    accent: v('--accent'),
    info: v('--info'),
    infoSoft: v('--info-soft'),
    foreground: v('--foreground'),
    muted: v('--text-muted'),
    soft: v('--text-soft'),
    fieldLine: v('--field-line'),
    danger: v('--danger-soft'),
    success: v('--success-soft'),
    primaryRgb: v('--primary-rgb'),
    backgroundRgb: v('--background-rgb'),
    accentRgb: v('--accent-rgb'),
    infoRgb: v('--info-rgb'),
    primaryForeground: v('--primary-foreground'),
    accentForeground: v('--accent-foreground'),
    primaryHoverRgb: v('--primary-hover-rgb'),
    cardRgb: v('--card-background-rgb'),
    foregroundRgb: v('--foreground-rgb'),
    fieldLineRgb: v('--field-line-rgb'),
    // i18n-ignore: nombres de variables CSS (`metal-lo`), no texto.
    chain: { glow: v('--color-chain-glow'), flash: v('--color-chain-flash'), burst: v('--color-chain-burst'), veil: v('--color-chain-veil'), metal: v('--color-chain-metal'), metalHi: v('--color-chain-metal-hi'), metalLo: v('--color-chain-metal-lo') },
  }
}

export interface VideoAssets {
  theme: VideoTheme
  /** El arte por URL; `null` si no cargó (se dibuja el nombre). El de una Magia de Campo se suma cuando aparece (`loadFieldArt`). */
  arts: Map<string, ImageBitmap | null>
  back: ImageBitmap | null
  /** El remolino de la mesa (`mat-scene`) de la paleta en uso; `null` si no cargó (queda el degradado). */
  scene?: ImageBitmap | null
  /** Las capas que no cambian, pintadas una vez (la arena, la placa, el arte del campo recortado). */
  cache?: Map<string, CanvasImageSource>
}

export const FONT = '"Lexend Deca", system-ui, sans-serif'

/** Una imagen como `ImageBitmap` (del mismo origen: el proxy de las cartas, o el dorso propio), achicada al ancho que se usa. `null` si no carga: el video sigue igual. */
async function loadBitmap(url: string, signal?: AbortSignal, width = 160): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url, signal ? { signal } : {})
    if (!response.ok) return null
    return await createImageBitmap(await response.blob(), { resizeWidth: width, resizeQuality: 'high' })
  } catch {
    return null
  }
}

/** Carga las imágenes y espera la letra antes del primer cuadro (un `fillText` antes de que cargue saldría con otra). */
export async function loadVideoAssets(urls: readonly string[], signal?: AbortSignal): Promise<VideoAssets> {
  const swirl = document.documentElement.getAttribute('data-palette') === 'indigo' ? remolinoIndigo : remolino
  const [back, scene, ...arts] = await Promise.all([loadBitmap(CARD_BACK_URL, signal), loadBitmap(swirl, signal, 1080), ...urls.map((url) => loadBitmap(url, signal))])
  await Promise.all(['400', '600', '700'].map((weight) => document.fonts.load(`${weight} 24px "Lexend Deca"`)))
  return { theme: readVideoTheme(), arts: new Map(urls.map((url, index) => [url, arts[index] ?? null])), back: back ?? null, scene: scene ?? null, cache: new Map() }
}

/** El arte de una Magia de Campo, la primera vez que aparece (a 512 px: cubre media mesa). */
export async function loadFieldArt(url: string, assets: VideoAssets, signal?: AbortSignal) {
  if (!assets.arts.has(url)) assets.arts.set(url, await loadBitmap(url, signal, 512))
}

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function roundRect(ctx: Ctx, r: Rect, radius: number) {
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, radius)
}

const rgba = (rgb: string | undefined, alpha: number) => `rgb(${rgb ?? '255 255 255'} / ${alpha})`

/** Un lienzo aparte del tamaño dado (sin DOM, si se puede); null donde no hay lienzos (las pruebas). */
function canvasOf(w: number, h: number): { canvas: CanvasImageSource; ctx: Ctx } | null {
  const canvas = typeof OffscreenCanvas === 'undefined' ? (typeof document === 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: w, height: h })) : new OffscreenCanvas(w, h)
  const ctx = canvas?.getContext('2d') as Ctx | null | undefined
  return canvas && ctx ? { canvas, ctx } : null
}

/** Una capa que no cambia: se pinta una vez en su lienzo y después se copia; sin lienzos, se pinta directo. */
function layer(ctx: Ctx, assets: VideoAssets, key: string, box: Rect, paint: (target: Ctx) => void) {
  let image = assets.cache?.get(key)
  if (!image && assets.cache) {
    const made = canvasOf(Math.ceil(box.w), Math.ceil(box.h))
    if (made) {
      made.ctx.translate(-box.x, -box.y)
      paint(made.ctx)
      image = made.canvas
      assets.cache.set(key, image)
    }
  }
  if (image) ctx.drawImage(image, box.x, box.y)
  else paint(ctx)
}

/** Un degradé radial elíptico (`radial-gradient(ellipse rx ry at cx cy, …)`) sobre todo `box`. */
function ellipse(ctx: Ctx, box: Rect, cx: number, cy: number, rx: number, ry: number, stops: readonly (readonly [number, string])[]) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(rx, ry)
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  for (const [at, color] of stops) gradient.addColorStop(at, color)
  ctx.fillStyle = gradient
  ctx.fillRect((box.x - cx) / rx, (box.y - cy) / ry, box.w / rx, box.h / ry)
  ctx.restore()
}

/** La arena de la mesa (`mat-scene` de `index.css`): el índigo con un pozo violeta debajo del campo, dos luces arriba y la viñeta. Sin el grano (no se ve en H.264). */
function paintScene(ctx: Ctx, scene: Scene, theme: VideoTheme, swirl?: ImageBitmap | null) {
  const W = scene.width
  const H = scene.height
  const box = { x: 0, y: 0, w: W, h: H }
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, W, H)
  // El remolino de la mesa, cubriendo el cuadro como `mat-scene` (`background-size: cover`); sin él, el degradado de antes.
  if (swirl) {
    const k = Math.max(W / swirl.width, H / swirl.height)
    ctx.drawImage(swirl, (W - swirl.width * k) / 2, (H - swirl.height * k) / 2, swirl.width * k, swirl.height * k)
    return
  }
  const top = ctx.createLinearGradient(0, 0, 0, H)
  top.addColorStop(0, rgba(theme.cardRgb, 0.75))
  top.addColorStop(0.36, rgba(theme.cardRgb, 0))
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, H)
  ellipse(ctx, box, W * 0.5, H * 0.47, W * 0.6, H * 0.46, [[0, rgba(theme.primaryRgb, 0.4)], [0.5, rgba(theme.primaryRgb, 0.13)], [0.76, rgba(theme.primaryRgb, 0)]])
  for (const x of [0.09, 0.91]) {
    const r = Math.hypot(W * 0.91, H * 0.94)
    ellipse(ctx, box, W * x, H * 0.06, r, r, [[0, rgba(theme.accentRgb, 0.2)], [0.26, rgba(theme.accentRgb, 0)]])
  }
  ellipse(ctx, box, W * 0.5, H, W * 0.52, H * 0.2, [[0, rgba(theme.primaryRgb, 0.38)], [0.72, rgba(theme.primaryRgb, 0)]])
  ellipse(ctx, box, W * 0.5, H * 0.42, W * 1.25, H * 1.05, [[0.5, 'rgb(0 0 0 / 0)'], [1, 'rgb(0 0 0 / 0.55)']])
}

/** Dónde va la placa: el campo y un poco más (`-inset-x-[1%] -inset-y-[5%]` de `MatPlate`). */
export function plateOf(scene: Scene): Rect {
  const field = fieldRect(scene.cells)
  const s = scene.layout.scale
  const dx = 14 * s
  const dy = field.h * 0.05
  return { x: field.x - dx, y: field.y - dy, w: field.w + 2 * dx, h: field.h + 2 * dy }
}

/**
 * El arte de la Magia de Campo de fondo de una mitad del campo (`mat-field-art`): cubre la mitad (`object-fit: cover`, un poco por arriba del medio) y se desvanece en todos sus
 * bordes, más hacia la fila del medio (`top`: la mitad de arriba, del rival). Se recorta una vez; `alpha` es su fundido (la mesa lo deja al 60 %).
 */
function paintFieldArt(ctx: Ctx, image: ImageBitmap, half: Rect, top: boolean, alpha: number, key: string, assets: VideoAssets) {
  const paint = (target: Ctx) => {
    const scale = Math.max(half.w / image.width, half.h / image.height)
    const w = image.width * scale
    const h = image.height * scale
    target.drawImage(image, half.x + (half.w - w) / 2, half.y + (half.h - h) * 0.4, w, h)
    target.globalCompositeOperation = 'destination-in'
    const across = target.createLinearGradient(half.x, 0, half.x + half.w, 0)
    across.addColorStop(0, 'rgb(0 0 0 / 0)')
    across.addColorStop(0.14, '#000')
    across.addColorStop(0.86, '#000')
    across.addColorStop(1, 'rgb(0 0 0 / 0)')
    target.fillStyle = across
    target.fillRect(half.x, half.y, half.w, half.h)
    // `to top` la tuya (el medio queda arriba), `to bottom` la del rival.
    const down = top ? target.createLinearGradient(0, half.y, 0, half.y + half.h) : target.createLinearGradient(0, half.y + half.h, 0, half.y)
    down.addColorStop(0, 'rgb(0 0 0 / 0)')
    down.addColorStop(0.1, '#000')
    down.addColorStop(0.78, '#000')
    down.addColorStop(1, 'rgb(0 0 0 / 0)')
    target.fillStyle = down
    target.fillRect(half.x, half.y, half.w, half.h)
    target.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = 0.6 * alpha
  // Sin lienzo aparte no se puede recortar sin borrar la mesa: se pinta sin el desvanecido.
  if (assets.cache) layer(ctx, assets, key, half, paint)
  ctx.globalAlpha = 1
}

/** El texto en hasta `lines` renglones que entran en `width`; el último, con «…» si sobra. */
export function wrap(ctx: Ctx, text: string, width: number, lines: number): string[] {
  const out: string[] = []
  let line = ''
  const words = text.split(/\s+/)
  for (let index = 0; index < words.length; index += 1) {
    const next = line ? `${line} ${words[index]}` : words[index]!
    if (ctx.measureText(next).width <= width || !line) {
      line = next
      continue
    }
    // El último renglón se lleva lo que queda (y se corta con «…»): con un solo renglón, todo el texto.
    if (out.length === lines - 1) {
      line = [line, ...words.slice(index)].join(' ')
      break
    }
    out.push(line)
    line = words[index]!
  }
  out.push(line)
  const last = out.length - 1
  if (ctx.measureText(out[last]!).width > width) {
    let cut = out[last]!
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
    out[last] = `${cut.trimEnd()}…`
  }
  return out
}

/**
 * Una carta parada de `w`×`h`, centrada en su lugar y girada (acostada, de cabeza o en el abanico): la misma cuenta en su casilla y en vuelo. `lift`: su sombra (0 apoyada en la
 * mesa, 1 en el aire), como la `shadow-card` de las cartas de la mesa.
 */
export function drawCard(ctx: Ctx, pose: Pose, card: SceneCard, assets: VideoAssets, s: number, lift = 0) {
  const { theme } = assets
  const { w, h } = pose
  const image = card.faceDown ? assets.back : card.art ? assets.arts.get(card.art) : null

  ctx.save()
  if (card.dim) ctx.globalAlpha *= 0.4
  ctx.translate(pose.x, pose.y)
  ctx.rotate(pose.angle)
  if (lift > 0 && w > 4 * s) {
    // Una sombra sin desenfoque (el desenfoque del lienzo es caro por cuadro): dos capas oscuras corridas hacia abajo.
    ctx.fillStyle = `rgb(0 0 0 / ${0.22 * lift})`
    ctx.fillRect(-w / 2 + 1 * s, -h / 2 + 4 * s * lift, w, h + 2 * s)
    ctx.fillRect(-w / 2 - 1 * s, -h / 2 + 8 * s * lift, w + 2 * s, h + 2 * s)
  }
  if (image) ctx.drawImage(image, -w / 2, -h / 2, w, h)
  else {
    // Sin imagen: el dorso de color o un hueco con el nombre.
    ctx.fillStyle = card.faceDown ? theme.primary : theme.raised
    ctx.fillRect(-w / 2, -h / 2, w, h)
    if (!card.faceDown) {
      ctx.fillStyle = theme.foreground
      ctx.font = `600 ${11 * s}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      wrap(ctx, card.name, w - 8 * s, 5).forEach((line, index) => ctx.fillText(line, 0, -h / 2 + 6 * s + index * 14 * s))
    }
  }
  ctx.strokeStyle = theme.border
  ctx.lineWidth = 1 * s
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  ctx.restore()
}

/** `fx-lock` de la mesa (480 ms): llega grande y girada, sin verse, y a los 55 % ya se ve y rebota un poco antes de fijarse. */
const LOCK = { ms: 480, at: 0.55, scale: [2.3, 0.92], turn: [-80, 8] } as const
const lerp = (a: number, b: number, p: number) => a + (b - a) * Math.min(1, Math.max(0, p))

/**
 * La mira de un objetivo, como `TargetMark` de la mesa (en el rojo de marcar, `FX_RGB.red`): el aro rojo con su resplandor por fuera de la carta y, adentro (recortado a la carta), el tinte
 * rojo, las cuatro esquinas, los cuatro tics, el aro punteado y el punto del centro. `lock` (0 a 1): cómo cae sobre la carta (`fx-lock`); `ping` (0 a 1, o nada): la onda que sale al fijarse
 * (`fx-ping`); `alpha`: su fundido al irse. `k`: px del video por px del celular (las líneas de 2 y 3 px de la mesa).
 */
export function drawTargetMark(ctx: Ctx, pose: Pose, k: number, lock = 1, alpha = 1, ping?: number) {
  const red = FX_RGB.red
  const { w, h } = pose
  const p = lock / LOCK.at
  const opacity = alpha * Math.min(1, p)
  if (opacity <= 0) return
  const settle = (lock - LOCK.at) / (1 - LOCK.at)
  const scale = lock < LOCK.at ? lerp(LOCK.scale[0], LOCK.scale[1], 1 - (1 - p) ** 3) : lerp(LOCK.scale[1], 1, settle)
  const turn = ((lock < LOCK.at ? lerp(LOCK.turn[0], LOCK.turn[1], 1 - (1 - p) ** 3) : lerp(LOCK.turn[1], 0, settle)) * Math.PI) / 180

  ctx.save()
  ctx.translate(pose.x, pose.y)
  ctx.rotate(pose.angle)
  ctx.globalAlpha *= opacity
  // El aro de la carta marcada (`fx-ring`): 2 px rojos y un resplandor de 14.
  ctx.strokeStyle = rgba(red, 0.95)
  ctx.lineWidth = 2 * k
  ctx.shadowColor = rgba(red, 0.5)
  ctx.shadowBlur = 14 * k
  ctx.strokeRect(-w / 2 - k, -h / 2 - k, w + 2 * k, h + 2 * k)
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.rect(-w / 2, -h / 2, w, h)
  ctx.clip()
  if (ping !== undefined && ping > 0 && ping < 1) {
    // La onda: un aro del 56 % que crece de 0,5 a 2,4 y se apaga.
    ctx.save()
    ctx.globalAlpha *= 0.95 * (1 - ping)
    ctx.strokeStyle = rgba(red, 1)
    ctx.lineWidth = 2 * k
    ctx.beginPath()
    ctx.arc(0, 0, w * 0.28 * lerp(0.5, 2.4, 1 - (1 - ping) ** 3), 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  ctx.rotate(turn)
  ctx.scale(scale, scale)
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.hypot(w, h) / 2)
  glow.addColorStop(0, rgba(red, 0.34))
  glow.addColorStop(0.72, rgba(red, 0))
  ctx.fillStyle = glow
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.strokeStyle = rgba(red, 1)
  ctx.fillStyle = rgba(red, 1)
  ctx.shadowColor = rgba(red, 1)
  ctx.shadowBlur = 3 * k
  // Las esquinas: 22 % del ancho, a 7 % de los costados y 5 % de arriba y abajo, de 3 px.
  const arm = w * 0.22
  const [x0, y0] = [-w / 2 + w * 0.07, -h / 2 + h * 0.05]
  ctx.lineWidth = 3 * k
  ctx.beginPath()
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const [x, y] = [sx * x0, sy * y0]
    ctx.moveTo(x, y + sy * arm)
    ctx.lineTo(x, y)
    ctx.lineTo(x + sx * arm, y)
  }
  ctx.stroke()
  // Los tics (`fx-crosshair`): en un cuadrado del 64 %, de 2 px y el 20 % de largo, desde cada borde hacia el centro.
  const half = w * 0.32
  const tick = w * 0.64 * 0.2
  ctx.lineWidth = 2 * k
  ctx.beginPath()
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    ctx.moveTo(dx * half, dy * half)
    ctx.lineTo(dx * (half - tick), dy * (half - tick))
  }
  ctx.stroke()
  // El aro punteado del 46 % y el punto del centro (6 px, con su resplandor).
  ctx.setLineDash([4 * k, 3 * k])
  ctx.beginPath()
  ctx.arc(0, 0, w * 0.23, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.shadowBlur = 8 * k
  ctx.beginPath()
  ctx.arc(0, 0, 3 * k, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Cuánto tardan la mira en fijarse y su onda (`fx-lock`, `fx-ping`), y en irse. */
export const TARGET_LOCK_MS = LOCK.ms
export const TARGET_PING_MS = 750
export const TARGET_OUT_MS = 200

function badge(ctx: Ctx, x: number, y: number, text: string, fill: string, color: string, s: number, fromEnd = false) {
  ctx.font = `700 ${14 * s}px ${FONT}`
  const w = Math.max(22 * s, ctx.measureText(text).width + 10 * s)
  const h = 22 * s
  const left = fromEnd ? x - w : x
  const top = fromEnd ? y - h : y
  ctx.fillStyle = fill
  roundRect(ctx, { x: left, y: top, w, h }, h / 2)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + w / 2, top + h / 2 + 1 * s)
}

/** El número de una pila grande en el medio: sólo el número, blanco y con sombra para leerse sobre el dorso, como `PileBadge` de la mesa (sin píldora ni nombre). */
function pileBadge(ctx: Ctx, slot: SceneSlot, theme: VideoTheme, s: number) {
  ctx.save()
  ctx.font = `800 ${26 * s}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = rgba(theme.backgroundRgb, 0.9)
  ctx.shadowBlur = 6 * s
  ctx.fillStyle = theme.foreground
  ctx.fillText(String(slot.count ?? 0), slot.rect.x + slot.rect.w / 2, slot.rect.y + slot.rect.h / 2 + 1 * s)
  ctx.restore()
}

function drawSlot(ctx: Ctx, slot: SceneSlot, assets: VideoAssets, s: number, hidePile = false) {
  const { theme } = assets
  if (slot.card && !hidePile) {
    const pose = poseOf(slot.rect, slot.card)
    // El grosor del deck y del Extra: dos dorsos corridos debajo del de arriba (las capas de la mesa, `DECK_LAYERS`).
    if ((slot.pile === 'deck' || slot.pile === 'extra') && (slot.count ?? 0) > 1) {
      const step = (pose.w / 56) * 1.5 * (slot.card.upsideDown ? -1 : 1)
      for (const k of [2, 1]) drawCard(ctx, { ...pose, x: pose.x - k * step, y: pose.y + k * step }, { ...slot.card, faceDown: true }, assets, s)
    }
    drawCard(ctx, pose, slot.card, assets, s, slot.pile ? 0 : 0.5)
    // Contadores y materiales: chapas derechas (no giran con la carta), arriba a la izquierda y abajo a la derecha.
    const r = cardRect(slot.rect, slot.card.sideways)
    if (slot.card.counters > 0) badge(ctx, r.x + 2 * s, r.y + 2 * s, String(slot.card.counters), theme.info, theme.background, s)
    if (slot.card.materials > 0) badge(ctx, r.x + r.w - 2 * s, r.y + r.h - 2 * s, `×${slot.card.materials}`, theme.primary, theme.foreground, s, true)
  }
  if (slot.pile) pileBadge(ctx, slot, theme, s)
  else if (slot.label && !slot.card) {
    ctx.fillStyle = theme.soft
    ctx.font = `600 ${12 * s}px ${FONT}`
    ctx.letterSpacing = `${0.6 * s}px`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(slot.label.toUpperCase(), slot.rect.x + slot.rect.w / 2, slot.rect.y + slot.rect.h / 2)
    ctx.letterSpacing = '0px'
  }
}

/**
 * La chapa de vidas de un lado, como la de la mesa (`LifeBadge`): recta, carbón al 82 %, con el borde de su dueño (3 px la de quien tiene el turno; la otra, tenue de 1 px), arriba la etiqueta con el
 * nombre (violeta con texto blanco la de abajo, lima con texto carbón la de arriba) y abajo el número grande.
 */
function drawScore(ctx: Ctx, rect: Rect, name: string, lp: number, mine: boolean, active: boolean, assets: VideoAssets, s: number) {
  const { theme } = assets
  const [fill, ink] = mine ? [theme.primary, '#ffffff'] : [theme.info, theme.background]
  ctx.font = `700 ${16 * s}px ${FONT}`
  const tag = wrap(ctx, name.toUpperCase(), rect.w * 0.3, 1)[0]!
  const tagW = ctx.measureText(tag).width + 12 * s
  ctx.font = `800 ${40 * s}px ${FONT}`
  const w = Math.max(tagW, ctx.measureText(String(lp)).width) + 20 * s
  const h = 76 * s
  const x = mine ? rect.x : rect.x + rect.w - w
  const y = rect.y
  ctx.fillStyle = rgba(theme.backgroundRgb, 0.82)
  ctx.fillRect(x, y, w, h)
  const line = (active ? 3 : 1) * s
  ctx.lineWidth = line
  ctx.strokeStyle = active ? fill : rgba(theme.fieldLineRgb, 0.25)
  ctx.strokeRect(x + line / 2, y + line / 2, w - line, h - line)
  const inner = mine ? x + 10 * s : x + w - 10 * s
  ctx.fillStyle = fill
  ctx.fillRect(mine ? inner : inner - tagW, y + 8 * s, tagW, 20 * s)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = ink
  ctx.font = `700 ${16 * s}px ${FONT}`
  ctx.fillText(tag, mine ? inner + tagW / 2 : inner - tagW / 2, y + 19 * s)
  ctx.textAlign = mine ? 'left' : 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = theme.foreground
  ctx.font = `800 ${40 * s}px ${FONT}`
  ctx.fillText(String(lp), inner, y + 66 * s)
}

/**
 * La caja de la fase al medio del campo, como la de la mesa (`IconButton` `tile` en `p2`): cuadrada, del lado menor de su casilla, con la sigla grande; lima (borde y sigla) en el turno de abajo, la sigla en lila en el del otro.
 */
function drawPhase(ctx: Ctx, scene: Scene, theme: VideoTheme, s: number) {
  const cell = scene.layout.cellAt(scene.layout.middle, 3)
  const side = Math.min(cell.w, cell.h)
  const box = { x: cell.x + (cell.w - side) / 2, y: cell.y + (cell.h - side) / 2, w: side, h: side }
  const active = scene.turn === 0
  ctx.fillStyle = theme.card
  ctx.fillRect(box.x, box.y, box.w, box.h)
  ctx.lineWidth = 2 * s
  ctx.strokeStyle = active ? theme.info : theme.border
  ctx.strokeRect(box.x + s, box.y + s, box.w - 2 * s, box.h - 2 * s)
  ctx.fillStyle = active ? theme.info : theme.muted
  ctx.font = `800 ${side * 0.3}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(PHASES.find((phase) => phase.id === scene.phase)?.short ?? '', box.x + box.w / 2, box.y + box.h / 2 + s)
}

/** El arte de campo de un lado en un momento: cuál y cuánto se ve (0 a 1: su fundido de entrada o de salida). */
export interface FieldLayer {
  src: string
  alpha: number
}

/**
 * La franja de la jugada: arriba el chip de su clase (en el color de su destello) con de dónde sale y el número de la jugada a la derecha; la frase grande; y, si entra, «Qué se
 * mueve» (el nombre de cada carta y su camino, la del costo marcada) y si se barajó el Deck. Un solo elemento que resalta (el chip); lo demás, en los tres grises del texto.
 */
function drawExplain(ctx: Ctx, scene: Scene, theme: VideoTheme, s: number) {
  const box = scene.layout.text
  const explain: Explain | null = scene.explain
  let y = box.y
  ctx.textBaseline = 'middle'
  if (explain) {
    const tone = explain.tone ? FX_RGB[explain.tone] : theme.fieldLineRgb
    ctx.font = `700 ${17 * s}px ${FONT}`
    const chip = { x: box.x, y, w: ctx.measureText(explain.kind).width + 26 * s, h: 32 * s }
    ctx.fillStyle = rgba(tone, 0.16)
    roundRect(ctx, chip, chip.h / 2)
    ctx.fill()
    ctx.strokeStyle = rgba(tone, explain.tone ? 0.9 : 0.35)
    ctx.lineWidth = 2 * s
    ctx.stroke()
    ctx.fillStyle = theme.foreground
    ctx.textAlign = 'left'
    ctx.fillText(explain.kind, chip.x + 13 * s, y + chip.h / 2 + 1 * s)
    ctx.font = `600 ${17 * s}px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillStyle = theme.soft
    const label = scene.stepLabel
    const labelW = ctx.measureText(label).width
    ctx.fillText(label, box.x + box.w, y + chip.h / 2 + 1 * s)
    if (explain.origin) {
      ctx.textAlign = 'left'
      ctx.fillStyle = theme.muted
      ctx.fillText(wrap(ctx, explain.origin, box.w - chip.w - labelW - 40 * s, 1)[0]!, chip.x + chip.w + 12 * s, y + chip.h / 2 + 1 * s)
    }
    y += chip.h + 12 * s
  } else {
    ctx.textAlign = 'left'
    ctx.fillStyle = theme.muted
    ctx.font = `600 ${18 * s}px ${FONT}`
    ctx.fillText(scene.stepLabel, box.x, y + 10 * s)
    y += 28 * s
  }
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = theme.foreground
  ctx.font = `400 ${24 * s}px ${FONT}`
  const room = Math.max(1, Math.min(2, Math.floor((box.y + box.h - y) / (30 * s))))
  for (const line of wrap(ctx, scene.stepText, box.w, room)) {
    ctx.fillText(line, box.x, y)
    y += 30 * s
  }
  if (!explain) return
  // «Qué se mueve» y el barajado, mientras entren (en el duelo, la franja es chica y no entran).
  const lineH = 28 * s
  y += 8 * s
  // Las que no entran se cuentan en la última que entra («y 2 cartas más»), como en el panel de Pasos.
  const fit = Math.max(0, Math.floor((box.y + box.h - y - 6 * s - (explain.note ? lineH : 0)) / lineH))
  const shown = explain.total > Math.min(fit, explain.lines.length) ? Math.max(0, Math.min(fit, explain.lines.length + 1) - 1) : explain.lines.length
  const rows = [...explain.lines.slice(0, shown).map((line) => ({ ...line, more: false })), ...(explain.total > shown && fit > 0 ? [{ name: t('practice.moves.more', { count: explain.total - shown }), route: '', tag: undefined, more: true }] : [])]
  if (rows.length > 0 && y + lineH <= box.y + box.h) {
    ctx.strokeStyle = rgba(theme.fieldLineRgb, 0.12)
    ctx.lineWidth = 1 * s
    ctx.beginPath()
    ctx.moveTo(box.x, y - 4 * s)
    ctx.lineTo(box.x + box.w, y - 4 * s)
    ctx.stroke()
    y += 6 * s
  }
  for (const row of rows) {
    let x = box.x
    if (row.tag) {
      ctx.font = `800 ${13 * s}px ${FONT}`
      ctx.letterSpacing = `${0.8 * s}px`
      const text = row.tag.toUpperCase()
      const w = ctx.measureText(text).width + 14 * s
      ctx.fillStyle = rgba(theme.accentRgb, 0.2)
      roundRect(ctx, { x, y: y + 1 * s, w, h: 22 * s }, 11 * s)
      ctx.fill()
      ctx.fillStyle = theme.accent
      ctx.fillText(text, x + 7 * s, y + 5 * s)
      ctx.letterSpacing = '0px'
      x += w + 10 * s
    }
    ctx.font = `400 ${19 * s}px ${FONT}`
    const routeW = row.route ? ctx.measureText(row.route).width : 0
    ctx.font = `600 ${19 * s}px ${FONT}`
    ctx.fillStyle = row.more ? theme.soft : theme.foreground
    const name = wrap(ctx, row.name, box.x + box.w - x - routeW - 14 * s, 1)[0]!
    ctx.fillText(name, x, y)
    if (row.route) {
      x += ctx.measureText(name).width + 14 * s
      ctx.font = `400 ${19 * s}px ${FONT}`
      ctx.fillStyle = theme.muted
      ctx.fillText(row.route, x, y)
    }
    y += lineH
  }
  if (explain.note && y + lineH <= box.y + box.h + 2 * s) {
    ctx.font = `600 ${19 * s}px ${FONT}`
    ctx.fillStyle = theme.soft
    ctx.fillText(`↻ ${explain.note}`, box.x, y)
  }
}

/**
 * Un cuadro entero. Con `moving` (las cartas que dibuja una transición, `video-motion.ts`, o un efecto que las anima, como el barajado: `lado:id`, o `lado:pile:deck` para la pila
 * entera), esas no se dibujan en su casilla: ahí va lo que había en `before` (la pila con su carta de antes, la zona vacía) hasta que llegan, y el aro de la jugada espera a que
 * lleguen. Así sale el fondo de toda la transición de una vez, y cada cuadro de ella es ese fondo más las cartas en vuelo. `lp`: las vidas mientras cuentan. `fields`: el arte de
 * campo de cada lado mientras entra o se va (sin él, el de la escena, quieto). `fresh`: lo marcado como objetivo en esta jugada (su mira la dibuja su efecto, `targetOverlays`).
 */
export function drawFrame(ctx: Ctx, scene: Scene, assets: VideoAssets, moving?: { keys: ReadonlySet<string>; before: Scene }, lp?: readonly [number, number] | null, fields?: readonly (readonly FieldLayer[])[], fresh?: ReadonlySet<string>) {
  const { theme } = assets
  const { layout } = scene
  const s = layout.scale
  const full = { x: 0, y: 0, w: scene.width, h: scene.height }

  layer(ctx, assets, `mesa:${scene.width}:${Math.round(plateOf(scene).y)}:${Math.round(plateOf(scene).h)}`, full, (target) => {
    // Sin placa: como en la mesa, las casillas son transparentes y se ve el fondo a través.
    paintScene(target, scene, theme, assets.scene)
  })

  // El arte de la Magia de Campo de cada lado, encima del fondo y debajo de las casillas.
  scene.sides.forEach((side, index) => {
    const shown = fields?.[index] ?? (side.fieldArt ? [{ src: side.fieldArt, alpha: 1 }] : [])
    for (const art of shown) {
      const image = assets.arts.get(art.src)
      if (image && side.half && art.alpha > 0) paintFieldArt(ctx, image, side.half, index === 1, art.alpha, `field:${art.src}:${index}:${Math.round(side.half.y)}`, assets)
    }
  })

  // Las casillas, como en la mesa (`CELL_LOOK`): rectas, sin relleno y con la línea fina del campo al 50 %.
  ctx.lineWidth = 1.5 * s
  ctx.strokeStyle = rgba(theme.fieldLineRgb, 0.5)
  for (const r of scene.cells) ctx.strokeRect(r.x, r.y, r.w, r.h)

  drawPhase(ctx, scene, theme, s)

  scene.sides.forEach((side, index) => {
    for (const slot of side.slots) {
      if (slot.pile && moving?.keys.has(`${index}:pile:${slot.pile}`)) {
        drawSlot(ctx, slot, assets, s, true)
        continue
      }
      const under = slot.card && moving?.keys.has(`${index}:${slot.card.id}`) ? (slotUnder(moving.before, index as 0 | 1, slot) ?? { ...slot, card: undefined }) : slot
      // Lo de antes también puede estar volando (la carta que se va de esa misma pila): entonces, la casilla vacía.
      drawSlot(ctx, under.card && moving?.keys.has(`${index}:${under.card.id}`) ? { ...under, card: undefined } : under, assets, s)
    }
    for (const slot of side.hand) if (!(slot.card && moving?.keys.has(`${index}:${slot.card.id}`))) drawSlot(ctx, slot, assets, s)
    // La mira de lo marcado como objetivo, quieta (la que se marca en esta jugada la dibuja su efecto mientras cae: `fresh`).
    for (const slot of [...side.slots, ...side.hand]) {
      const key = slot.card ? `${index}:${slot.card.id}` : ''
      if (slot.card?.targeted && !moving?.keys.has(key) && !fresh?.has(key)) drawTargetMark(ctx, poseOf(slot.rect, slot.card), layout.unit)
    }
  })

  // Lo que tocó la jugada: un aro ámbar («se activa / ahora») con su resplandor, cuando ya llegó.
  ctx.save()
  ctx.strokeStyle = theme.info
  ctx.lineWidth = 4 * s
  ctx.shadowColor = theme.info
  ctx.shadowBlur = 14 * s
  for (const r of moving ? [] : scene.focus) {
    ctx.strokeRect(r.x - 4 * s, r.y - 4 * s, r.w + 8 * s, r.h + 8 * s)
  }
  ctx.restore()

  // Arriba: tus vidas, de quién es el turno y las del rival.
  const [mine, theirs] = scene.sides
  if (scene.heading) {
    // Un combo: su nombre grande y el del deck abajo.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = theme.foreground
    ctx.font = `700 ${30 * s}px ${FONT}`
    ctx.fillText(wrap(ctx, scene.heading.title, layout.score.w, 1)[0]!, layout.score.x, layout.score.y + 36 * s)
    ctx.fillStyle = theme.muted
    ctx.font = `600 ${20 * s}px ${FONT}`
    ctx.fillText(wrap(ctx, scene.heading.subtitle, layout.score.w, 1)[0]!, layout.score.x, layout.score.y + 70 * s)
  } else {
    // Las chapas de la mesa: el borde grueso dice de quién es el turno (sin texto de turno, como en la mesa).
    drawScore(ctx, layout.score, mine.name, lp?.[0] ?? mine.lp, true, scene.turn === 0, assets, s)
    drawScore(ctx, layout.score, theirs.name, lp?.[1] ?? theirs.lp, false, scene.turn === 1, assets, s)
  }
  if (scene.caption) {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = theme.soft
    ctx.font = `600 ${16 * s}px ${FONT}`
    ctx.fillText(scene.caption.text, scene.caption.rect.x, scene.caption.rect.y)
  }

  drawExplain(ctx, scene, theme, s)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = theme.soft
  ctx.font = `600 ${16 * s}px ${FONT}`
  ctx.fillText(scene.footer, layout.footer.x + layout.footer.w / 2, layout.footer.y + layout.footer.h / 2)
}

/**
 * Una carta en vuelo, `ms` después de que empezó su jugada: arriba de todo, con la curva de los vuelos de la mesa y su sombra mientras está en el aire; la que aparece, con un
 * fundido; la que cambia de cara se da vuelta en 3D (se angosta hasta quedar de canto y se abre del otro lado), en su lugar o en el camino.
 */
export function drawFlight(ctx: Ctx, flight: Flight, ms: number, assets: VideoAssets, s: number) {
  const { motion } = flight
  const t = Math.min(1, Math.max(0, (ms - flight.delay) / flight.duration))
  const pose = poseAt(motion, t)
  if (!motion.from) {
    ctx.globalAlpha = t
    drawCard(ctx, pose, motion.card, assets, s)
    ctx.globalAlpha = 1
    return
  }
  const lift = Math.sin(Math.PI * t)
  if (!motion.fromCard) return drawCard(ctx, pose, motion.card, assets, s, lift)
  const turn = Math.cos(Math.PI * easeInOut(t))
  drawCard(ctx, { ...pose, w: pose.w * Math.abs(turn) }, turn > 0 ? motion.fromCard : motion.card, assets, s, lift)
}

/** El título o el cierre: una placa sobre el medio de la mesa, con los nombres o el resultado (`alpha`: mientras aparece o se va). */
export function drawBanner(ctx: Ctx, scene: Scene, banner: { title: string; subtitle: string }, assets: VideoAssets, alpha = 1) {
  const { theme } = assets
  const s = scene.layout.scale
  const middle = scene.layout.cellAt(scene.layout.middle, 1)
  const r = { x: 40 * s, y: middle.y - 40 * s, w: scene.width - 80 * s, h: middle.h + 80 * s }
  ctx.globalAlpha = 0.94 * alpha
  ctx.fillStyle = theme.card
  roundRect(ctx, r, 24 * s)
  ctx.fill()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = theme.primary
  ctx.lineWidth = 2 * s
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = theme.foreground
  ctx.font = `700 ${36 * s}px ${FONT}`
  ctx.fillText(wrap(ctx, banner.title, r.w - 40 * s, 1)[0]!, r.x + r.w / 2, r.y + r.h / 2 - 22 * s)
  ctx.fillStyle = theme.infoSoft
  ctx.font = `600 ${22 * s}px ${FONT}`
  ctx.fillText(wrap(ctx, banner.subtitle, r.w - 40 * s, 1)[0]!, r.x + r.w / 2, r.y + r.h / 2 + 26 * s)
  ctx.globalAlpha = 1
}
