import { easeInOut } from '../../../app/motion'
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
  primaryHoverRgb?: string
  cardRgb?: string
  foregroundRgb?: string
  fieldLineRgb?: string
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
    primaryHoverRgb: v('--primary-hover-rgb'),
    cardRgb: v('--card-background-rgb'),
    foregroundRgb: v('--foreground-rgb'),
    fieldLineRgb: v('--field-line-rgb'),
  }
}

export interface VideoAssets {
  theme: VideoTheme
  /** El arte por URL; `null` si no cargó (se dibuja el nombre). El de una Magia de Campo se suma cuando aparece (`loadFieldArt`). */
  arts: Map<string, ImageBitmap | null>
  back: ImageBitmap | null
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
  const [back, ...arts] = await Promise.all([loadBitmap(CARD_BACK_URL, signal), ...urls.map((url) => loadBitmap(url, signal))])
  await Promise.all(['400', '600', '700'].map((weight) => document.fonts.load(`${weight} 24px "Lexend Deca"`)))
  return { theme: readVideoTheme(), arts: new Map(urls.map((url, index) => [url, arts[index] ?? null])), back: back ?? null, cache: new Map() }
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
function paintScene(ctx: Ctx, scene: Scene, theme: VideoTheme) {
  const W = scene.width
  const H = scene.height
  const box = { x: 0, y: 0, w: W, h: H }
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, W, H)
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

/** La placa del campo (`mat-plate`): levantada con su sombra, luz violeta en el medio, dos aros finos, un brillo cruzado, doble filo y el marco de esquinas y rombos. */
function paintPlate(ctx: Ctx, scene: Scene, theme: VideoTheme) {
  const s = scene.layout.scale
  const r = plateOf(scene)
  const radius = 18 * s
  ctx.save()
  ctx.shadowColor = 'rgb(0 0 0 / 0.7)'
  ctx.shadowBlur = 46 * s
  ctx.shadowOffsetY = 24 * s
  const base = ctx.createLinearGradient(0, r.y, 0, r.y + r.h)
  base.addColorStop(0, rgba(theme.cardRgb, 0.92))
  base.addColorStop(1, rgba(theme.backgroundRgb, 0.96))
  ctx.fillStyle = base
  roundRect(ctx, r, radius)
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundRect(ctx, r, radius)
  ctx.clip()
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  ellipse(ctx, r, cx, cy, r.w * 0.74, r.h * 0.64, [[0, rgba(theme.primaryHoverRgb, 0.4)], [0.55, rgba(theme.primaryRgb, 0.14)], [0.8, rgba(theme.primaryRgb, 0)]])
  const far = Math.hypot(r.w / 2, r.h / 2)
  ctx.lineWidth = far * 0.006
  for (const [at, alpha] of [[0.196, 0.18], [0.336, 0.12]] as const) {
    ctx.strokeStyle = rgba(theme.accentRgb, alpha)
    ctx.beginPath()
    ctx.arc(cx, cy, far * at, 0, Math.PI * 2)
    ctx.stroke()
  }
  // El brillo cruzado (112°) y la sombra de adentro, abajo.
  const angle = (112 - 90) * (Math.PI / 180)
  const half = (Math.abs(r.w * Math.cos(angle)) + Math.abs(r.h * Math.sin(angle))) / 2
  const sheen = ctx.createLinearGradient(cx - Math.cos(angle) * half, cy - Math.sin(angle) * half, cx + Math.cos(angle) * half, cy + Math.sin(angle) * half)
  sheen.addColorStop(0.36, rgba(theme.foregroundRgb, 0))
  sheen.addColorStop(0.5, rgba(theme.foregroundRgb, 0.06))
  sheen.addColorStop(0.64, rgba(theme.foregroundRgb, 0))
  ctx.fillStyle = sheen
  ctx.fillRect(r.x, r.y, r.w, r.h)
  const bottom = ctx.createLinearGradient(0, r.y + r.h - 70 * s, 0, r.y + r.h)
  bottom.addColorStop(0, 'rgb(0 0 0 / 0)')
  bottom.addColorStop(1, 'rgb(0 0 0 / 0.38)')
  ctx.fillStyle = bottom
  ctx.fillRect(r.x, r.y + r.h - 70 * s, r.w, 70 * s)
  ctx.restore()
  ctx.lineWidth = 1.5 * s
  ctx.strokeStyle = rgba(theme.primaryHoverRgb, 0.34)
  roundRect(ctx, r, radius)
  ctx.stroke()
  const inset = 16 * s
  const inner = { x: r.x + inset, y: r.y + inset, w: r.w - 2 * inset, h: r.h - 2 * inset }
  ctx.strokeStyle = rgba(theme.accentRgb, 0.15)
  roundRect(ctx, inner, radius - 8 * s)
  ctx.stroke()
  // Las esquinas (dos líneas en L) y los rombos de arriba y abajo.
  const arm = 36 * s
  ctx.strokeStyle = rgba(theme.accentRgb, 0.8)
  ctx.lineWidth = 3.5 * s
  for (const [x, y, dx, dy] of [[inner.x, inner.y, 1, 1], [inner.x + inner.w, inner.y, -1, 1], [inner.x, inner.y + inner.h, 1, -1], [inner.x + inner.w, inner.y + inner.h, -1, -1]] as const) {
    ctx.beginPath()
    ctx.moveTo(x + dx * arm, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + dy * arm)
    ctx.stroke()
  }
  const stud = 11 * s
  for (const y of [r.y, r.y + r.h]) {
    ctx.save()
    ctx.translate(cx, y)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = theme.background
    ctx.fillRect(-stud / 2 - 5 * s, -stud / 2 - 5 * s, stud + 10 * s, stud + 10 * s)
    ctx.fillStyle = rgba(theme.accentRgb, 0.95)
    ctx.fillRect(-stud / 2, -stud / 2, stud, stud)
    ctx.restore()
  }
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

/** El número de una pila grande en el medio (en una píldora oscura si hay cartas) y su nombre chico abajo, como `PileBadge` de la mesa. */
function pileBadge(ctx: Ctx, slot: SceneSlot, theme: VideoTheme, s: number) {
  const cx = slot.rect.x + slot.rect.w / 2
  const cy = slot.rect.y + slot.rect.h / 2 - 6 * s
  const count = String(slot.count ?? 0)
  ctx.font = `800 ${26 * s}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if ((slot.count ?? 0) > 0) {
    const w = ctx.measureText(count).width + 18 * s
    ctx.fillStyle = rgba(theme.backgroundRgb, 0.7)
    roundRect(ctx, { x: cx - w / 2, y: cy - 17 * s, w, h: 34 * s }, 17 * s)
    ctx.fill()
  }
  ctx.fillStyle = theme.foreground
  ctx.fillText(count, cx, cy + 1 * s)
  if (slot.label) {
    ctx.font = `600 ${12 * s}px ${FONT}`
    ctx.letterSpacing = `${0.6 * s}px`
    ctx.fillStyle = theme.soft
    ctx.fillText(slot.label.toUpperCase(), cx, cy + 30 * s)
    ctx.letterSpacing = '0px'
  }
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

/** La placa de vidas de un lado: el nombre chico y las vidas grandes, en el color de su dueño (violeta claro el tuyo, ámbar el del rival). */
function drawScore(ctx: Ctx, rect: Rect, name: string, lp: number, color: string, align: 'left' | 'right', assets: VideoAssets, s: number) {
  const x = align === 'left' ? rect.x : rect.x + rect.w
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = assets.theme.muted
  ctx.font = `600 ${20 * s}px ${FONT}`
  ctx.fillText(wrap(ctx, name, rect.w * 0.3, 1)[0]!, x, rect.y + 26 * s)
  ctx.fillStyle = color
  ctx.font = `700 ${40 * s}px ${FONT}`
  ctx.fillText(String(lp), x, rect.y + 72 * s)
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
  const rows = [...explain.lines.map((line) => ({ ...line, more: false })), ...(explain.more ? [{ name: explain.more, route: '', more: true }] : [])]
  const lineH = 28 * s
  y += 8 * s
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
    if (y + lineH > box.y + box.h - (explain.note ? lineH : 0)) break
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
 * campo de cada lado mientras entra o se va (sin él, el de la escena, quieto).
 */
export function drawFrame(ctx: Ctx, scene: Scene, assets: VideoAssets, moving?: { keys: ReadonlySet<string>; before: Scene }, lp?: readonly [number, number] | null, fields?: readonly (readonly FieldLayer[])[]) {
  const { theme } = assets
  const { layout } = scene
  const s = layout.scale
  const full = { x: 0, y: 0, w: scene.width, h: scene.height }

  layer(ctx, assets, `mesa:${scene.width}:${Math.round(plateOf(scene).y)}:${Math.round(plateOf(scene).h)}`, full, (target) => {
    paintScene(target, scene, theme)
    paintPlate(target, scene, theme)
  })

  // El arte de la Magia de Campo de cada lado, encima de la placa y debajo de las casillas.
  scene.sides.forEach((side, index) => {
    const shown = fields?.[index] ?? (side.fieldArt ? [{ src: side.fieldArt, alpha: 1 }] : [])
    for (const art of shown) {
      const image = assets.arts.get(art.src)
      if (image && side.half && art.alpha > 0) paintFieldArt(ctx, image, side.half, index === 1, art.alpha, `campo:${art.src}:${index}:${Math.round(side.half.y)}`, assets)
    }
  })

  // Las casillas: un hueco oscuro con su línea, como en la mesa.
  ctx.lineWidth = 1.5 * s
  for (const r of scene.cells) {
    roundRect(ctx, r, 8 * s)
    ctx.fillStyle = rgba(theme.backgroundRgb, 0.3)
    ctx.fill()
    ctx.strokeStyle = rgba(theme.fieldLineRgb, 0.26)
    ctx.stroke()
  }

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
  })

  // Lo que tocó la jugada: un aro ámbar («se activa / ahora») con su resplandor, cuando ya llegó.
  ctx.save()
  ctx.strokeStyle = theme.info
  ctx.lineWidth = 4 * s
  ctx.shadowColor = theme.info
  ctx.shadowBlur = 14 * s
  for (const r of moving ? [] : scene.focus) {
    roundRect(ctx, { x: r.x - 4 * s, y: r.y - 4 * s, w: r.w + 8 * s, h: r.h + 8 * s }, 8 * s)
    ctx.stroke()
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
    drawScore(ctx, layout.score, mine.name, lp?.[0] ?? mine.lp, theme.accent, 'left', assets, s)
    drawScore(ctx, layout.score, theirs.name, lp?.[1] ?? theirs.lp, theme.infoSoft, 'right', assets, s)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = scene.turn === 0 ? theme.accent : theme.infoSoft
    ctx.font = `700 ${26 * s}px ${FONT}`
    ctx.fillText(wrap(ctx, scene.turnText, layout.score.w * 0.4, 1)[0]!, layout.score.x + layout.score.w / 2, layout.score.y + layout.score.h / 2)
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
  const middle = scene.layout.cellAt(scene.layout.middle, 0)
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
