import { easeInOut } from '../../../app/motion'
import { CARD_BACK_URL } from '../../probability/practice-styles'
import type { Flight } from './video-fx'
import { poseAt, poseOf, slotUnder, type Pose } from './video-motion'
import { cardRect, type Rect, type Scene, type SceneCard, type SceneSlot } from './video-scene'

/**
 * Pinta una escena (`video-scene.ts`) en un lienzo: la mesa, las manos, las vidas, el turno, la jugada en texto y la marca del sitio. Los colores son los tokens del sitio
 * (`readVideoTheme`, leídos de las variables CSS) y la letra, Lexend Deca. Las transiciones (`video-motion.ts`): `drawFrame` con `moving` pinta el fondo sin las cartas en
 * vuelo, y `drawFlight` las pone encima en cada momento; lo demás que anima la mesa (la carta grande, el cartel de la fase…) lo pinta `video-fx.ts`.
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
  }
}

export interface VideoAssets {
  theme: VideoTheme
  /** El arte por URL; `null` si no cargó (se dibuja el nombre). */
  arts: ReadonlyMap<string, ImageBitmap | null>
  back: ImageBitmap | null
}

export const FONT = '"Lexend Deca", system-ui, sans-serif'

/** Una imagen como `ImageBitmap` (del mismo origen: el proxy de las cartas, o el dorso propio), achicada al ancho que se usa. `null` si no carga: el video sigue igual. */
async function loadBitmap(url: string, signal?: AbortSignal): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url, signal ? { signal } : {})
    if (!response.ok) return null
    return await createImageBitmap(await response.blob(), { resizeWidth: 160, resizeQuality: 'high' })
  } catch {
    return null
  }
}

/** Carga las imágenes y espera la letra antes del primer cuadro (un `fillText` antes de que cargue saldría con otra). */
export async function loadVideoAssets(urls: readonly string[], signal?: AbortSignal): Promise<VideoAssets> {
  const [back, ...arts] = await Promise.all([loadBitmap(CARD_BACK_URL, signal), ...urls.map((url) => loadBitmap(url, signal))])
  await Promise.all(['400', '600', '700'].map((weight) => document.fonts.load(`${weight} 24px "Lexend Deca"`)))
  return { theme: readVideoTheme(), arts: new Map(urls.map((url, index) => [url, arts[index] ?? null])), back: back ?? null }
}

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function roundRect(ctx: Ctx, r: Rect, radius: number) {
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, radius)
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

/** Una carta parada de `w`×`h`, centrada en su lugar y girada (acostada o de cabeza): la misma cuenta en su casilla y en vuelo. */
export function drawCard(ctx: Ctx, pose: Pose, card: SceneCard, assets: VideoAssets, s: number) {
  const { theme } = assets
  const { w, h } = pose
  const image = card.faceDown ? assets.back : card.art ? assets.arts.get(card.art) : null

  ctx.save()
  if (card.dim) ctx.globalAlpha *= 0.4
  ctx.translate(pose.x, pose.y)
  ctx.rotate(pose.angle)
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

function drawSlot(ctx: Ctx, slot: SceneSlot, assets: VideoAssets, s: number) {
  const { theme } = assets
  if (slot.card) {
    drawCard(ctx, poseOf(slot.rect, slot.card), slot.card, assets, s)
    // Contadores y materiales: chapas derechas (no giran con la carta), arriba a la izquierda y abajo a la derecha.
    const r = cardRect(slot.rect, slot.card.sideways)
    if (slot.card.counters > 0) badge(ctx, r.x + 2 * s, r.y + 2 * s, String(slot.card.counters), theme.info, theme.background, s)
    if (slot.card.materials > 0) badge(ctx, r.x + r.w - 2 * s, r.y + r.h - 2 * s, `×${slot.card.materials}`, theme.primary, theme.foreground, s, true)
  } else if (slot.label) {
    ctx.fillStyle = theme.soft
    ctx.font = `600 ${15 * s}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(slot.label, slot.rect.x + slot.rect.w / 2, slot.rect.y + slot.rect.h / 2)
  }
  if (slot.count !== undefined && slot.count > 0) badge(ctx, slot.rect.x + slot.rect.w - 2 * s, slot.rect.y + slot.rect.h - 2 * s, String(slot.count), theme.background, theme.foreground, s, true)
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

/**
 * Un cuadro entero. Con `moving` (las cartas que dibuja una transición, `video-motion.ts`), esas no se dibujan en su casilla: ahí va lo que había en `before` (la pila con
 * su carta de antes, la zona vacía) hasta que llegan, y el aro de la jugada espera a que lleguen. Así sale el fondo de toda la transición de una vez, y cada cuadro de ella es
 * ese fondo más las cartas en vuelo. `lp`: las vidas mientras cuentan.
 */
export function drawFrame(ctx: Ctx, scene: Scene, assets: VideoAssets, moving?: { keys: ReadonlySet<string>; before: Scene }, lp?: readonly [number, number] | null) {
  const { theme } = assets
  const { layout } = scene
  const s = layout.scale

  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, scene.width, scene.height)

  // Las casillas vacías: las líneas blancas de la mesa, tenues.
  ctx.strokeStyle = theme.fieldLine
  ctx.globalAlpha = 0.18
  ctx.lineWidth = 1.5 * s
  for (const r of scene.cells) {
    roundRect(ctx, r, 6 * s)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  scene.sides.forEach((side, index) => {
    for (const slot of side.slots) {
      const under = slot.card && moving?.keys.has(`${index}:${slot.card.id}`) ? (slotUnder(moving.before, index as 0 | 1, slot) ?? { ...slot, card: undefined }) : slot
      // Lo de antes también puede estar volando (la carta que se va de esa misma pila): entonces, la casilla vacía.
      drawSlot(ctx, under.card && moving?.keys.has(`${index}:${under.card.id}`) ? { ...under, card: undefined } : under, assets, s)
    }
    for (const slot of side.hand) if (!(slot.card && moving?.keys.has(`${index}:${slot.card.id}`))) drawSlot(ctx, slot, assets, s)
  })

  // Lo que tocó la jugada: un aro ámbar («se activa / ahora»), cuando ya llegó.
  ctx.strokeStyle = theme.info
  ctx.lineWidth = 4 * s
  for (const r of moving ? [] : scene.focus) {
    roundRect(ctx, { x: r.x - 4 * s, y: r.y - 4 * s, w: r.w + 8 * s, h: r.h + 8 * s }, 8 * s)
    ctx.stroke()
  }

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

  // La jugada: su número chico y lo que hizo, en hasta dos renglones.
  const text = layout.text
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = theme.muted
  ctx.font = `600 ${18 * s}px ${FONT}`
  ctx.fillText(scene.stepLabel, text.x, text.y)
  ctx.fillStyle = theme.foreground
  ctx.font = `400 ${24 * s}px ${FONT}`
  wrap(ctx, scene.stepText, text.w, 2).forEach((line, index) => ctx.fillText(line, text.x, text.y + 26 * s + index * 30 * s))

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = theme.soft
  ctx.font = `600 ${16 * s}px ${FONT}`
  ctx.fillText(scene.footer, layout.footer.x + layout.footer.w / 2, layout.footer.y + layout.footer.h / 2)
}

/**
 * Una carta en vuelo, `ms` después de que empezó su jugada: arriba de todo, con la curva de los vuelos de la mesa; la que aparece, con un fundido; la que cambia de cara se da
 * vuelta en 3D (se angosta hasta quedar de canto y se abre del otro lado), en su lugar o en el camino.
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
  if (!motion.fromCard) return drawCard(ctx, pose, motion.card, assets, s)
  const turn = Math.cos(Math.PI * easeInOut(t))
  drawCard(ctx, { ...pose, w: pose.w * Math.abs(turn) }, turn > 0 ? motion.fromCard : motion.card, assets, s)
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
