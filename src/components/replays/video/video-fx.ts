import type { LandingTone, ShowcaseKind, SpotlightKind } from '../../../app/mat-effects'
import { EASE_OUT, EASE_SNAP, UI_ANIMATION_MS, bezierEase, easeInOut } from '../../../app/motion'
import { PHASES } from '../../../app/practice-mat'
import { t } from '../../../i18n'
import { FX_RGB, type FxTone } from '../../probability/practice-styles'
import { drawCard, FONT, wrap, type Ctx, type VideoAssets } from './video-draw'
import { placesOf, poseOf, type Motion, type Pose } from './video-motion'
import type { Rect, Scene, SceneCard } from './video-scene'
import type { VideoSpeed } from './video-timeline'

/**
 * Lo que la mesa anima con cada jugada, para el video: cuándo y cuánto vuela cada carta (`flightsOf`) y lo que se dibuja encima un rato (`overlaysOf`): la carta grande del
 * centro al activar, mostrar o declarar (y, en un combo, lo que mueve cada paso, como al reproducirlo), el destello de una invocación, el cartel de la fase, el barajado, el
 * ataque y las vidas que bajan. Los tiempos y las curvas son los de la mesa (`MESA`); cada efecto se pinta por cuadro en el lienzo, sin DOM. Todo en ms de video: a 2×, la mitad.
 */

/**
 * Los tiempos de la mesa, copiados para no cargar la mesa (React) con el video: `FLIGHT_MS`, `FLIGHT_STAGGER_MS` y `LANDING_AT` de `use-card-flights.ts`, `SPOTLIGHT_TRAVEL_MS`
 * de `MatFx.tsx`, `DECK_SHUFFLE_MS` de `shuffle-fx.ts`, `IMPACT_MS` de `AttackFx.tsx`, `DELTA_MS` de `life-effects.ts` (`video-fx.test.ts` vigila que sigan iguales) y, sin
 * exportar, `ACTIVATE_MS`, `BANNER_MS` y `FLIP_MS` de `PracticeMat.tsx` y `STRIKE_MS` de `AttackFx.tsx`.
 */
export const MESA = {
  flight: UI_ANIMATION_MS * 2,
  stagger: 70,
  landingAt: 0.85,
  travel: 320,
  stage: 950,
  banner: 1100,
  flip: 380,
  shuffle: 620,
  impact: 300,
  strike: 1050,
  delta: 1600,
} as const

/** Lo que dura un vuelo de `distance` (en px del lienzo de referencia de 720): como `flightMs` de la mesa. */
export const flightMs = (distance: number) => Math.round(UI_ANIMATION_MS + (MESA.flight - UI_ANIMATION_MS) * Math.min(1, distance / 600))
/** Lo que cuentan las vidas al cambiar `delta`: como `lifeCountMs` de `life-effects.ts`. */
export const lifeMs = (delta: number) => Math.round(320 + (900 - 320) * Math.min(1, Math.abs(delta) / 8000))

/** El color de la carta grande y del destello, como `STAGE_TONE` y `LANDING_TONE` de `MatFx.tsx` (el test lo vigila). */
export const STAGE_TONE: Record<SpotlightKind | ShowcaseKind, FxTone> = {
  activate: 'gold', target: 'red', reveal: 'cyan', declare: 'violet', attack: 'red',
  normal: 'gold', special: 'cyan', fusion: 'violet', synchro: 'white', xyz: 'indigo', link: 'teal',
  hand: 'cyan', gy: 'violet', banish: 'amber', extra: 'cyan', deck: 'cyan', attach: 'indigo',
}
const LANDING_TONE = (tone: LandingTone) => STAGE_TONE[tone]

const easeOut = bezierEase(EASE_OUT)
const easeSnap = bezierEase(EASE_SNAP)
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const mix = (a: number, b: number, e: number) => a + (b - a) * e
const rgba = (rgb: string, alpha: number) => `rgb(${rgb} / ${alpha})`

/** Una animación por cuadros clave (como un `@keyframes`): el valor en `p` (0 a 1), con `ease` en cada tramo. */
function keyed(p: number, keys: readonly (readonly [number, number])[], ease: (x: number) => number = easeOut): number {
  if (p <= keys[0]![0]) return keys[0]![1]
  for (let index = 1; index < keys.length; index += 1) {
    const [at, value] = keys[index]!
    const [from, start] = keys[index - 1]!
    if (p <= at) return mix(start, value, ease(at === from ? 1 : (p - from) / (at - from)))
  }
  return keys.at(-1)![1]
}

/** Una carta en vuelo con sus tiempos, en ms desde que empieza su jugada. */
export interface Flight {
  motion: Motion
  delay: number
  duration: number
}

const samePlace = (a: Pose, b: Pose) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5

/**
 * Los tiempos de cada carta que se mueve: un vuelo dura según lo largo (`flightMs`), dar vuelta una carta en su lugar `MESA.flip` y lo que aparece se funde en lo que entra
 * una carta (`UI_ANIMATION_MS`). Las que salen del mismo lugar (robar varias) salen de a una, `MESA.stagger` después de la anterior (hasta la 8.ª). Si no entran en la jugada
 * (`room`), se aprietan para que todo llegue antes de la siguiente.
 */
export function flightsOf(motions: readonly Motion[], scale: number, speed: VideoSpeed, room: number): Flight[] {
  const queue = new Map<string, number>()
  const flights = motions.map((motion): Flight => {
    if (!motion.from) return { motion, delay: 0, duration: UI_ANIMATION_MS }
    if (samePlace(motion.from, motion.to)) return { motion, delay: 0, duration: MESA.flip }
    const origin = `${Math.round(motion.from.x)}:${Math.round(motion.from.y)}`
    const order = queue.get(origin) ?? 0
    queue.set(origin, order + 1)
    return { motion, delay: Math.min(order, 7) * MESA.stagger, duration: flightMs(Math.hypot(motion.to.x - motion.from.x, motion.to.y - motion.from.y) / scale) }
  })
  const end = Math.max(0, ...flights.map((flight) => flight.delay + flight.duration))
  const fit = Math.min(1 / speed, room / Math.max(1, end))
  return flights.map((flight) => ({ ...flight, delay: flight.delay * fit, duration: flight.duration * fit }))
}

/** Lo que se dibuja encima de la mesa un rato: desde cuándo (ms de video desde el principio), cuánto dura y cómo se pinta en cada momento `p` (0 a 1). */
export interface Overlay {
  /** Uno nuevo del mismo tipo saca al anterior (como en la mesa: otra carta grande, otro cartel). */
  kind: 'stage' | 'landing' | 'banner' | 'shuffle' | 'attack' | 'delta' | 'title'
  start: number
  duration: number
  draw: (ctx: Ctx, p: number) => void
}

/** El rectángulo de la mesa (todas sus casillas): ahí se centran la carta grande y el cartel. */
function fieldOf(scene: Scene): Rect {
  const xs = scene.cells.flatMap((cell) => [cell.x, cell.x + cell.w])
  const ys = scene.cells.flatMap((cell) => [cell.y, cell.y + cell.h])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** Dónde está una carta en la escena y con qué cara a la vista, buscándola de los dos lados (lo del rival del simulador está del otro). */
const placeIn = (places: ReturnType<typeof placesOf>, id: string, sides: readonly number[]) => sides.map((side) => places.get(`${side}:${id}`)).find(Boolean)
const visible = (card: SceneCard | undefined) => (card && !card.faceDown ? card : undefined)

/** El destello radial y la onda (un anillo que se agranda y se apaga): el fogonazo de una invocación, el impacto de un ataque, el resplandor de la carta grande. */
function flash(ctx: Ctx, x: number, y: number, radius: number, tone: string, p: number) {
  const scale = keyed(p, [[0, 0.5], [0.28, 1.05], [1, 1.5]])
  ctx.globalAlpha = keyed(p, [[0, 0], [0.28, 1], [1, 0]])
  const r = radius * scale
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r)
  glow.addColorStop(0, 'rgb(255 255 255 / 0.95)')
  glow.addColorStop(0.35, rgba(tone, 0.75))
  glow.addColorStop(0.72, rgba(tone, 0))
  ctx.fillStyle = glow
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
  ctx.globalAlpha = 1
}

function ring(ctx: Ctx, rect: Rect, tone: string, width: number, p: number, round: boolean) {
  if (p <= 0 || p >= 1) return
  const scale = mix(0.85, 2.2, easeSnap(p))
  ctx.globalAlpha = 1 - easeSnap(p)
  ctx.strokeStyle = rgba(tone, 1)
  ctx.lineWidth = width
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  ctx.beginPath()
  if (round) ctx.arc(cx, cy, (rect.w / 2) * scale, 0, Math.PI * 2)
  else ctx.rect(cx - (rect.w / 2) * scale, cy - (rect.h / 2) * scale, rect.w * scale, rect.h * scale)
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** Lo que dibuja cada efecto de una jugada, con sus tiempos. `start`: cuándo empieza la jugada (ms de video). */
export function overlaysOf(before: Scene, after: Scene, flights: readonly Flight[], assets: VideoAssets, speed: VideoSpeed, start: number, kind: 'duel' | 'combo'): Overlay[] {
  const { effects, action, actor } = after
  if (!effects || !action || actor === null) return []
  const s = after.layout.scale
  const field = fieldOf(after)
  const sides = [actor, 1 - actor]
  const was = placesOf(before)
  const now = placesOf(after)
  const theme = assets.theme
  const out: Overlay[] = []
  const at = (ms: number) => start + ms / speed
  const landingOf = (id: string) => {
    const flight = flights.find((each) => each.motion.key.endsWith(`:${id}`))
    return flight ? flight.delay + flight.duration * MESA.landingAt : 0
  }

  // La carta grande del centro: activar, mostrar o declarar; en un combo, lo que mueve cada paso (sale de su lugar, se da vuelta si sale del deck o del Extra).
  const spot = effects.spotlight && effects.spotlight.kind !== 'target' && effects.spotlight.kind !== 'attack' ? { ids: effects.spotlight.ids ?? [effects.spotlight.id], kind: effects.spotlight.kind as SpotlightKind | ShowcaseKind, flip: false } : null
  const stage = spot ?? (kind === 'combo' && effects.showcase ? { ids: effects.showcase.ids, kind: effects.showcase.kind, flip: effects.showcase.flip === true } : null)
  if (stage) {
    const cards = stage.ids.flatMap((id) => {
      const later = placeIn(now, id, sides)
      const earlier = placeIn(was, id, sides)
      const known = after.spotlit?.[id]
      const face = visible(later?.card) ?? visible(earlier?.card) ?? (known ? { id, ...known, faceDown: false, sideways: false, upsideDown: false, counters: 0, materials: 0 } : undefined)
      // Grande, la carta se ve entera: sin lo atenuado de una handtrap ya usada.
      return face ? [{ face: { ...face, dim: false }, from: (earlier ?? later)?.pose ?? null }] : []
    }).slice(0, 4)
    if (cards.length > 0) out.push(stageOverlay(cards, stage.kind, stage.flip, after.stepText, field, assets, s, at(0), speed))
  }

  // El destello de una invocación, cuando la carta toca la zona.
  if (effects.landing) {
    const id = 'id' in action ? action.id : null
    const pose = id ? placeIn(now, id, sides)?.pose : null
    const rect = pose ? { x: pose.x - after.layout.cell / 2, y: pose.y - after.layout.cell / 2, w: after.layout.cell, h: after.layout.cell } : after.focus[0]
    if (rect) out.push(landingOverlay(rect, FX_RGB[LANDING_TONE(effects.landing.tone)], s, start + (effects.landing.flies && id ? landingOf(id) : 0), speed))
  }

  // El cartel de la fase: el nombre en grande y, si empieza otro turno, el turno arriba (en un duelo, si no, de quién es la fase).
  if (effects.banner) {
    const name = PHASES.find((phase) => phase.id === effects.banner!.phase)?.name ?? effects.banner.phase
    const lead = kind === 'duel' ? after.sides[actor].name : effects.banner.turn !== null ? t('practice.mat.turn', { turn: effects.banner.turn }) : ''
    out.push(bannerOverlay(name, lead, field, after.width, theme, s, at(0), speed))
  }

  // El barajado: el deck de quien jugó se parte en dos y se vuelve a juntar.
  if (effects.shuffle) {
    const deck = after.sides[actor].slots.find((slot) => slot.pile === 'deck')
    if (deck && assets.back) out.push(shuffleOverlay(deck.rect, assets, at(0), speed))
  }

  // El ataque: un rayo rojo del atacante a su objetivo (o a las vidas del rival) y el impacto al llegar.
  if (action.type === 'attack') {
    const from = placeIn(now, action.id, [actor])?.pose
    const target = action.target ? placeIn(now, action.target, [1 - actor])?.pose : null
    const score = after.layout.score
    const to = target ?? { x: actor === 0 ? score.x + score.w - 60 * s : score.x + 60 * s, y: actor === 0 ? score.y + 50 * s : field.y + field.h }
    if (from) out.push(attackOverlay(from, to, after.layout.cell, s, at(0), speed))
  }

  // Lo que cambiaron las vidas, abajo del número («−1000», rojo; lo que sube, verde): las vidas cuentan aparte (`lifeOf`).
  if (kind === 'duel') {
    ;([0, 1] as const).forEach((side) => {
      const delta = after.sides[side].lp - before.sides[side].lp
      if (delta !== 0) out.push(deltaOverlay(side, delta, after, theme, at(0), speed))
    })
  }
  return out
}

interface StageCard {
  face: SceneCard
  from: Pose | null
}

const STAGE_WIDTH = [0, 0.42, 0.3, 0.22, 0.18]

function stageOverlay(cards: readonly StageCard[], kind: SpotlightKind | ShowcaseKind, flip: boolean, caption: string, field: Rect, assets: VideoAssets, s: number, start: number, speed: VideoSpeed): Overlay {
  const tone = FX_RGB[STAGE_TONE[kind]]
  const w = field.w * STAGE_WIDTH[cards.length]!
  const h = (w * 614) / 421
  const gap = 12 * s
  const cx = field.x + field.w / 2
  const cy = field.y + field.h / 2
  const left = cx - (cards.length * w + (cards.length - 1) * gap) / 2
  const D = MESA.stage
  const travels = cards.some((card) => card.from)

  return {
    kind: 'stage',
    start,
    duration: (D + (travels ? MESA.travel : 0)) / speed,
    draw: (ctx, p) => {
      const ms = p * (D + (travels ? MESA.travel : 0))
      const glow = ms - (travels ? MESA.travel : 0)
      // El resplandor y la onda, cuando la carta llega al centro.
      if (glow > 0) {
        const g = glow / D
        const radius = Math.min(field.w, 480 * s) / 2
        ctx.globalAlpha = keyed(g, [[0, 0], [0.25, 1], [1, 0]])
        const scale = mix(0.4, 2, easeOut(g))
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * scale)
        gradient.addColorStop(0, rgba(tone, 0.6))
        gradient.addColorStop(0.42, rgba(tone, 0.18))
        gradient.addColorStop(0.68, rgba(tone, 0))
        ctx.fillStyle = gradient
        ctx.fillRect(cx - radius * scale, cy - radius * scale, 2 * radius * scale, 2 * radius * scale)
        ctx.globalAlpha = 1
        const ringW = field.w * 0.56
        ring(ctx, { x: cx - ringW / 2, y: cy - ringW / 2, w: ringW, h: ringW }, tone, 3 * s, glow / 720, true)
      }
      // La carta: sale de su lugar (o aparece en el centro), se queda y se va agrandándose un poco.
      const life = Math.min(1, ms / D)
      const out = keyed(life, [[0, 0], [0.72, 0], [1, 1]])
      const grow = 1 + 0.1 * out
      cards.forEach((card, index) => {
        const center = { x: left + index * (w + gap) + w / 2, y: cy - 14 * s, w, h, angle: 0 }
        const travel = card.from ? easeInOut(clamp(ms / MESA.travel)) : 1
        const appear = card.from ? 1 : keyed(life, [[0, 0], [0.22, 1]])
        const from = card.from ?? center
        const pose = { x: mix(from.x, center.x, travel), y: mix(from.y, center.y, travel), w: mix(from.w, w, travel) * grow * (card.from ? 1 : mix(0.55, 1, appear)), h: mix(from.h, h, travel) * grow * (card.from ? 1 : mix(0.55, 1, appear)), angle: mix(from.angle - 2 * Math.PI * Math.round(from.angle / (2 * Math.PI)), 0, travel) }
        // Salir del deck o del Extra: se da vuelta en 3D desde el dorso (`fx-flip-in`).
        const turn = flip ? 1 - easeSnap(clamp((ms - 60) / 520)) : 0
        const cos = Math.cos(Math.PI * turn)
        ctx.globalAlpha = (1 - out) * appear
        // El marco de color con su resplandor (`STAGE_FACE`): el aro con sombra va debajo de la carta (que la tapa por dentro) y, sin sombra, encima.
        const wide = pose.w * Math.abs(cos)
        const frame = (glow: boolean) => {
          ctx.save()
          ctx.translate(pose.x, pose.y)
          ctx.rotate(pose.angle)
          if (glow) {
            ctx.shadowColor = rgba(tone, 0.8)
            ctx.shadowBlur = 40 * s
          }
          ctx.strokeStyle = rgba(tone, 1)
          ctx.lineWidth = 3 * s
          ctx.strokeRect(-wide / 2 - 1.5 * s, -pose.h / 2 - 1.5 * s, wide + 3 * s, pose.h + 3 * s)
          ctx.restore()
        }
        frame(true)
        drawCard(ctx, { ...pose, w: wide }, cos < 0 ? { ...card.face, faceDown: true } : card.face, assets, s)
        frame(false)
        // El nombre abajo, en la segunda mitad del viaje.
        const label = clamp((ms - MESA.travel / 2) / (MESA.travel / 2))
        if (card.face.name && label > 0) {
          ctx.globalAlpha = (1 - out) * label * appear
          ctx.font = `700 ${16 * s}px ${FONT}`
          const lines = wrap(ctx, card.face.name, w, 2)
          const top = center.y + (h * grow) / 2 + 8 * s
          ctx.fillStyle = rgba(assets.theme.backgroundRgb, 0.85)
          ctx.fillRect(center.x - w / 2, top, w, lines.length * 20 * s + 8 * s)
          ctx.fillStyle = assets.theme.foreground
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          lines.forEach((line, row) => ctx.fillText(line, center.x, top + 4 * s + row * 20 * s))
        }
        ctx.globalAlpha = 1
      })
      // Arriba, lo que pasó en una línea, en una píldora del color (aparece con los nombres).
      const label = clamp((ms - MESA.travel / 2) / (MESA.travel / 2))
      if (caption && label > 0) {
        ctx.font = `700 ${16 * s}px ${FONT}`
        const text = wrap(ctx, caption, field.w * 0.88 - 28 * s, 1)[0]!
        const pill = { w: ctx.measureText(text).width + 28 * s, h: 30 * s }
        const top = cy - 14 * s - (h * grow) / 2 - 12 * s - pill.h
        ctx.globalAlpha = (1 - out) * label
        ctx.fillStyle = rgba(assets.theme.backgroundRgb, 0.9)
        ctx.strokeStyle = rgba(tone, 0.9)
        ctx.lineWidth = 2 * s
        ctx.beginPath()
        ctx.roundRect(cx - pill.w / 2, top, pill.w, pill.h, pill.h / 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = assets.theme.foreground
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, cx, top + pill.h / 2 + 1 * s)
        ctx.globalAlpha = 1
      }
    },
  }
}

/** Seis chispas en hexágono (como `SPARKS`, en casillas: 2,7 rem de una de 60 px). */
const SPARKS = [[0, -0.72], [0.64, -0.36], [0.64, 0.36], [0, 0.72], [-0.64, 0.36], [-0.64, -0.36]] as const

function landingOverlay(cell: Rect, tone: string, s: number, start: number, speed: VideoSpeed): Overlay {
  const total = 830
  return {
    kind: 'landing',
    start,
    duration: total / speed,
    draw: (ctx, p) => {
      const ms = p * total
      const cx = cell.x + cell.w / 2
      const cy = cell.y + cell.h / 2
      if (ms < 560) flash(ctx, cx, cy, cell.w / 2, tone, ms / 560)
      ring(ctx, cell, tone, 3 * s, ms / 720, false)
      ring(ctx, cell, tone, 1 * s, (ms - 110) / 720, false)
      const spark = ms / 680
      if (spark < 1) {
        const e = easeSnap(spark)
        ctx.globalAlpha = 1 - e
        ctx.fillStyle = '#fff'
        for (const [dx, dy] of SPARKS) {
          const size = 6 * s * mix(1, 0.2, e)
          ctx.save()
          ctx.translate(cx + dx * cell.w * e, cy + dy * cell.w * e)
          ctx.rotate(Math.PI / 4 + Math.PI * e)
          ctx.fillRect(-size / 2, -size / 2, size, size)
          ctx.restore()
        }
        ctx.globalAlpha = 1
      }
    },
  }
}

function bannerOverlay(name: string, lead: string, field: Rect, width: number, theme: VideoAssets['theme'], s: number, start: number, speed: VideoSpeed): Overlay {
  const h = 110 * s
  const cy = field.y + field.h / 2
  return {
    kind: 'banner',
    start,
    duration: MESA.banner / speed,
    draw: (ctx, p) => {
      // La banda: se abre de una línea, se queda y se cierra (`fx-banner`); el texto entra de la izquierda y sale por la derecha (`fx-banner-text`).
      const sx = keyed(p, [[0, 1.12], [0.14, 1], [0.76, 1], [1, 1.06]])
      const sy = keyed(p, [[0, 0.08], [0.14, 1.06], [0.26, 1], [0.76, 1], [1, 0.2]])
      const alpha = keyed(p, [[0, 0], [0.14, 1], [0.76, 1], [1, 0]])
      ctx.save()
      ctx.translate(width / 2, cy)
      ctx.scale(sx, sy)
      ctx.globalAlpha = alpha
      const band = ctx.createLinearGradient(-width / 2, 0, width / 2, 0)
      band.addColorStop(0, rgba(theme.primaryRgb, 0))
      band.addColorStop(0.16, rgba(theme.primaryRgb, 0.5))
      band.addColorStop(0.5, rgba(theme.backgroundRgb, 0.92))
      band.addColorStop(0.84, rgba(theme.primaryRgb, 0.5))
      band.addColorStop(1, rgba(theme.primaryRgb, 0))
      ctx.fillStyle = band
      ctx.fillRect(-width / 2, -h / 2, width, h)
      const line = ctx.createLinearGradient(-width / 2, 0, width / 2, 0)
      line.addColorStop(0, rgba(theme.accentRgb, 0))
      line.addColorStop(0.22, rgba(theme.accentRgb, 1))
      line.addColorStop(0.78, rgba(theme.accentRgb, 1))
      line.addColorStop(1, rgba(theme.accentRgb, 0))
      ctx.fillStyle = line
      ctx.fillRect(-width / 2, -h / 2, width, 2 * s)
      ctx.fillRect(-width / 2, h / 2 - 2 * s, width, 2 * s)
      ctx.restore()
      const textAlpha = keyed(p, [[0, 0], [0.06, 0], [0.22, 1], [0.76, 1], [1, 0]])
      const shift = keyed(p, [[0, -28], [0.06, -28], [0.22, 0], [0.76, 0], [1, 28]]) * s
      ctx.globalAlpha = textAlpha
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (lead) {
        ctx.fillStyle = theme.accent
        ctx.font = `700 ${16 * s}px ${FONT}`
        ctx.letterSpacing = `${4 * s}px`
        ctx.fillText(lead.toUpperCase(), width / 2 + shift, cy - 26 * s)
      }
      ctx.fillStyle = theme.foreground
      ctx.font = `800 ${38 * s}px ${FONT}`
      ctx.letterSpacing = `${8 * s}px`
      ctx.fillText(name.toUpperCase(), width / 2 + shift, cy + (lead ? 14 : 0) * s)
      ctx.letterSpacing = '0px'
      ctx.globalAlpha = 1
    },
  }
}

function shuffleOverlay(cell: Rect, assets: VideoAssets, start: number, speed: VideoSpeed): Overlay {
  const card = poseOf(cell, { sideways: false, upsideDown: false })
  return {
    kind: 'shuffle',
    start,
    duration: MESA.shuffle / speed,
    draw: (ctx, p) => {
      // El riffle de `shuffle-fx.ts`: se parte en dos paquetes (pares a un lado, impares al otro), caen al centro alternando y la pila se golpea contra la mesa.
      const ms = p * MESA.shuffle
      const split = easeOut(clamp(ms / 160))
      const knock = ms > 560 ? 1 - 0.04 * Math.sin((Math.PI * (ms - 560)) / 60) : 1
      for (let index = 0; index < 6; index += 1) {
        const side = index % 2 === 0 ? -1 : 1
        const back = easeInOut(clamp((ms - 170 - index * 37) / 90))
        const open = split * (1 - back)
        drawCard(ctx, { ...card, x: card.x + side * 0.38 * card.w * open, y: card.y - 0.32 * card.h * open * 0.5 - index * 0.6, w: card.w * knock, h: card.h * knock }, { id: '', art: null, name: '', faceDown: true, sideways: false, upsideDown: false, counters: 0, materials: 0 }, assets, 1)
      }
    },
  }
}

function attackOverlay(from: Pose, to: { x: number; y: number }, cell: number, s: number, start: number, speed: VideoSpeed): Overlay {
  const tone = FX_RGB.red
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  return {
    kind: 'attack',
    start,
    duration: MESA.strike / speed,
    draw: (ctx, p) => {
      const ms = p * MESA.strike
      // El rayo (`fx-beam`): se estira hasta el objetivo y se afina al apagarse; la punta (`fx-blade`) llega en `IMPACT_MS`.
      const beam = clamp(ms / 900)
      const reach = keyed(beam, [[0, 0], [0.35, 1]])
      const thin = keyed(beam, [[0, 1], [0.35, 1], [1, 0.25]])
      ctx.save()
      ctx.translate(from.x, from.y)
      ctx.rotate(angle)
      ctx.globalAlpha = keyed(beam, [[0, 1], [0.35, 1], [1, 0]])
      const gradient = ctx.createLinearGradient(0, 0, len, 0)
      gradient.addColorStop(0, rgba(tone, 0))
      gradient.addColorStop(1, rgba(tone, 0.9))
      ctx.fillStyle = gradient
      ctx.fillRect(0, (-9 * s * thin) / 2, len * reach, 9 * s * thin)
      ctx.fillStyle = 'rgb(255 255 255 / 0.85)'
      ctx.fillRect(0, (-2 * s * thin) / 2, len * reach, 2 * s * thin)
      const tip = len * easeInOut(clamp(ms / MESA.impact))
      ctx.globalAlpha = keyed(clamp(ms / 900), [[0, 0], [0.06, 1], [0.33, 1], [1, 0]])
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(tip + 14 * s, 0)
      ctx.lineTo(tip, -6 * s)
      ctx.lineTo(tip - 22 * s, 0)
      ctx.lineTo(tip, 6 * s)
      ctx.fill()
      ctx.restore()
      ctx.globalAlpha = 1
      // El impacto.
      const hit = ms - MESA.impact
      if (hit > 0) {
        if (hit < 560) flash(ctx, to.x, to.y, cell / 2, tone, hit / 560)
        ring(ctx, { x: to.x - cell / 2, y: to.y - cell / 2, w: cell, h: cell }, tone, 3 * s, hit / 720, true)
      }
    },
  }
}

function deltaOverlay(side: 0 | 1, delta: number, scene: Scene, theme: VideoAssets['theme'], start: number, speed: VideoSpeed): Overlay {
  const { score, scale: s } = scene.layout
  return {
    kind: 'delta',
    start,
    duration: MESA.delta / speed,
    draw: (ctx, p) => {
      // Como `animate-linger`: entra, se queda y en el último 15 % sube un poco y se funde.
      ctx.globalAlpha = keyed(p, [[0, 0], [0.1, 1], [0.85, 1], [1, 0]])
      ctx.fillStyle = delta < 0 ? theme.danger : theme.success
      ctx.font = `800 ${20 * s}px ${FONT}`
      ctx.textAlign = side === 0 ? 'left' : 'right'
      ctx.textBaseline = 'top'
      ctx.fillText(`${delta < 0 ? '−' : '+'}${Math.abs(delta)}`, side === 0 ? score.x : score.x + score.w, score.y + 80 * s - keyed(p, [[0, 0], [0.85, 0], [1, 4]]) * s)
      ctx.globalAlpha = 1
    },
  }
}

/** Las vidas que cuentan de lo de antes a lo de después (como en la mesa: `lifeMs`, con su curva), o null si no cambiaron. */
export function lifeOf(before: Scene, after: Scene, speed: VideoSpeed): ((ms: number) => [number, number] | null) | null {
  const from = [before.sides[0].lp, before.sides[1].lp] as const
  const to = [after.sides[0].lp, after.sides[1].lp] as const
  if (from[0] === to[0] && from[1] === to[1]) return null
  const durations = [lifeMs(to[0] - from[0]) / speed, lifeMs(to[1] - from[1]) / speed]
  return (ms) => (ms >= Math.max(...durations) ? null : [0, 1].map((side) => Math.round(mix(from[side]!, to[side]!, easeOutCubic(clamp(ms / durations[side]!))))) as [number, number])
}

/** El título del principio o el cierre: la placa sobre el medio de la mesa, que aparece o se va fundiéndose. */
export function titleOverlay(draw: (ctx: Ctx, alpha: number) => void, start: number, duration: number, fade: number, fadeIn: boolean): Overlay {
  return {
    kind: 'title',
    start,
    duration,
    draw: (ctx, p) => {
      const ms = p * duration
      draw(ctx, fadeIn ? easeOut(clamp(ms / fade)) : 1 - easeOut(clamp((ms - (duration - fade)) / fade)))
    },
  }
}

/** Para agregar lo de una jugada nueva: lo del mismo tipo que sigue en pantalla se va (otra carta grande, otro destello). Un cartel de fase que sigue abierto no vuelve a abrirse: cambia el texto. */
export function replaceOverlays(live: readonly Overlay[], next: readonly Overlay[], now: number): Overlay[] {
  const kinds = new Set(next.map((overlay) => overlay.kind))
  const open = live.find((overlay) => overlay.kind === 'banner' && (now - overlay.start) / overlay.duration < 0.76)
  const added = next.map((overlay) => (overlay.kind === 'banner' && open ? { ...overlay, start: overlay.start - overlay.duration * 0.26 } : overlay))
  return [...live.filter((overlay) => overlay.start + overlay.duration > now && !(kinds.has(overlay.kind) && overlay.kind !== 'delta')), ...added]
}
