import { CARD_BACK_URL } from '../../probability/practice-styles'
import { easeOut, poseAt, poseOf, slotUnder, type Motion, type Pose } from './video-motion'
import { cardRect, type Rect, type Scene, type SceneCard, type SceneSlot } from './video-scene'

/**
 * Pinta una escena (`video-scene.ts`) en un lienzo: la mesa, las manos, las vidas, el turno, la jugada en texto y la marca del sitio. Los colores son los tokens del sitio
 * (`readVideoTheme`, leídos de las variables CSS) y la letra, Lexend Deca. Las transiciones (`video-motion.ts`): `drawFrame` con `moving` pinta el fondo sin las cartas en
 * vuelo, y `drawMotions` las pone encima en cada momento.
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
  }
}

export interface VideoAssets {
  theme: VideoTheme
  /** El arte por URL; `null` si no cargó (se dibuja el nombre). */
  arts: ReadonlyMap<string, ImageBitmap | null>
  back: ImageBitmap | null
}

const FONT = '"Lexend Deca", system-ui, sans-serif'

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

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function roundRect(ctx: Ctx, r: Rect, radius: number) {
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, radius)
}

/** El texto en hasta `lines` renglones que entran en `width`; el último, con «…» si sobra. */
function wrap(ctx: Ctx, text: string, width: number, lines: number): string[] {
  const out: string[] = []
  let line = ''
  const words = text.split(/\s+/)
  for (let index = 0; index < words.length; index += 1) {
    const next = line ? `${line} ${words[index]}` : words[index]!
    if (ctx.measureText(next).width <= width || !line) {
      line = next
      continue
    }
    out.push(line)
    line = words[index]!
    if (out.length === lines - 1) {
      line = words.slice(index).join(' ')
      break
    }
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
function drawCard(ctx: Ctx, pose: Pose, card: SceneCard, assets: VideoAssets, s: number) {
  const { theme } = assets
  const { w, h } = pose
  const image = card.faceDown ? assets.back : card.art ? assets.arts.get(card.art) : null

  ctx.save()
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
 * su carta de antes, la zona vacía) hasta que llegan. Así sale el fondo de toda la transición de una vez, y cada cuadro de ella es ese fondo más las cartas en vuelo.
 */
export function drawFrame(ctx: Ctx, scene: Scene, assets: VideoAssets, moving?: { keys: ReadonlySet<string>; before: Scene }) {
  const { theme } = assets
  const { layout } = scene
  const s = layout.scale

  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, scene.width, scene.height)

  // Las casillas vacías: las líneas blancas de la mesa, tenues (las fases del medio no son casillas).
  ctx.strokeStyle = theme.fieldLine
  ctx.globalAlpha = 0.18
  ctx.lineWidth = 1.5 * s
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      if (row === 3 && col % 2 === 0) continue
      const r = layout.cellAt(row, col)
      roundRect(ctx, r, 6 * s)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1

  // Las fases: la de ahora, llena de violeta con el texto blanco.
  for (const phase of scene.phases) {
    const active = phase.id === scene.phase
    roundRect(ctx, phase.rect, 8 * s)
    ctx.fillStyle = active ? theme.primary : theme.card
    ctx.fill()
    ctx.fillStyle = active ? theme.foreground : theme.soft
    ctx.font = `${active ? 700 : 600} ${18 * s}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(phase.short, phase.rect.x + phase.rect.w / 2, phase.rect.y + phase.rect.h / 2 + 1 * s)
  }

  scene.sides.forEach((side, index) => {
    for (const slot of side.slots) {
      const under = slot.card && moving?.keys.has(`${index}:${slot.card.id}`) ? (slotUnder(moving.before, index as 0 | 1, slot) ?? { ...slot, card: undefined }) : slot
      // Lo de antes también puede estar volando (la carta que se va de esa misma pila): entonces, la casilla vacía.
      drawSlot(ctx, under.card && moving?.keys.has(`${index}:${under.card.id}`) ? { ...under, card: undefined } : under, assets, s)
    }
    for (const slot of side.hand) if (!(slot.card && moving?.keys.has(`${index}:${slot.card.id}`))) drawSlot(ctx, slot, assets, s)
  })

  // Lo que tocó la jugada: un aro ámbar («se activa / ahora»).
  ctx.strokeStyle = theme.info
  ctx.lineWidth = 4 * s
  for (const r of scene.focus) {
    roundRect(ctx, { x: r.x - 4 * s, y: r.y - 4 * s, w: r.w + 8 * s, h: r.h + 8 * s }, 8 * s)
    ctx.stroke()
  }

  // Arriba: tus vidas, de quién es el turno y las del rival.
  const [mine, theirs] = scene.sides
  drawScore(ctx, layout.score, mine.name, mine.lp, theme.accent, 'left', assets, s)
  drawScore(ctx, layout.score, theirs.name, theirs.lp, theme.infoSoft, 'right', assets, s)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = scene.turn === 0 ? theme.accent : theme.infoSoft
  ctx.font = `700 ${26 * s}px ${FONT}`
  ctx.fillText(wrap(ctx, scene.turnText, layout.score.w * 0.4, 1)[0]!, layout.score.x + layout.score.w / 2, layout.score.y + layout.score.h / 2)

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

  if (scene.banner) drawBanner(ctx, scene, scene.banner, assets)
}

/** Las cartas en vuelo en el momento `t` (0 a 1) de la transición: arriba de todo; la que aparece, con un fundido; la que se da vuelta, de una cara a la otra. */
export function drawMotions(ctx: Ctx, motions: readonly Motion[], t: number, assets: VideoAssets, s: number) {
  const e = easeOut(t)
  for (const motion of motions) {
    const pose = poseAt(motion, t)
    if (motion.fromCard) drawCard(ctx, pose, motion.fromCard, assets, s)
    ctx.globalAlpha = motion.from && !motion.fromCard ? 1 : e
    drawCard(ctx, pose, motion.card, assets, s)
    ctx.globalAlpha = 1
  }
}

/** El título o el cierre: una placa sobre el medio de la mesa, con los nombres o el resultado. */
function drawBanner(ctx: Ctx, scene: Scene, banner: NonNullable<Scene['banner']>, assets: VideoAssets) {
  const { theme } = assets
  const s = scene.layout.scale
  const middle = scene.layout.cellAt(3, 0)
  const r = { x: 40 * s, y: middle.y - 40 * s, w: scene.width - 80 * s, h: middle.h + 80 * s }
  ctx.globalAlpha = 0.94
  ctx.fillStyle = theme.card
  roundRect(ctx, r, 24 * s)
  ctx.fill()
  ctx.globalAlpha = 1
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
}
