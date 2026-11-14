import { ARRIVAL, CHARGE_SIZE, DUST_ANGLES, DUST_RADIUS, HIT_MS, LINE_ANGLES, LINE_RADIUS, SECOND_AT, SECOND_KEYS, SECOND_MS, WAVE_FROM, WAVE_HOLD, WAVE_MS, arrivalRingAt, punchAt, shakeOf, type ArrivalTone, type Shake } from '../../../app/field-impact'
import type { LandingTone, ShowcaseKind, SpotlightKind } from '../../../app/mat-effects'
import { EASE_IN_OUT, EASE_OUT, EASE_SNAP, UI_ANIMATION_MS, bezierEase, easeInOut } from '../../../app/motion'
import { PHASES } from '../../../app/practice-mat'
import { UNKNOWN_SUMMON, landingToneOf } from '../../../app/summon-entrance'
import { t } from '../../../i18n'
import { FX_RGB } from '../../probability/practice-styles'
import { drawCard, drawTargetMark, FONT, TARGET_LOCK_MS, TARGET_OUT_MS, TARGET_PING_MS, wrap, type Ctx, type VideoAssets } from './video-draw'
import { placesOf, poseOf, type Motion, type Pose } from './video-motion'
import { fieldRect, STAGE_TONE, type Rect, type Scene, type SceneCard, type SceneSlot } from './video-scene'
import type { VideoSpeed } from './video-timeline'

export { STAGE_TONE }

/**
 * Lo que la mesa anima con cada jugada, para el video: cuándo y cuánto vuela cada carta (`flightsOf`) y lo que se dibuja encima un rato (`overlaysOf`): la carta grande del
 * centro al activar, mostrar o declarar (y, en un combo, lo que mueve cada paso, como al reproducirlo), el destello de una invocación, la banda de la fase, el barajado, el
 * ataque y las vidas que bajan. Los tiempos y las curvas son los de la mesa (`MESA`); cada efecto se pinta por cuadro en el lienzo, sin DOM. Todo en ms de video: a 2×, la mitad.
 */

/**
 * Los tiempos de la mesa, copiados para no cargar la mesa (React) con el video: `FLIGHT_MS`, `FLIGHT_STAGGER_MS` y `LANDING_AT` de `use-card-flights.ts`, `SPOTLIGHT_TRAVEL_MS`
 * de `MatFx.tsx`, `DECK_SHUFFLE_MS` y `HAND_SHUFFLE_MS` de `shuffle-fx.ts`, `FIRST_DEAL_MS`, `NEXT_DEAL_MS` y `DEAL_LAND_AT` de `deal-flight.ts`, `IMPACT_MS` de `AttackFx.tsx`,
 * `DELTA_MS` de `life-effects.ts`, `PHASE_BAND_MS` y `TURN_BAND_MS` de `PhaseBand.tsx`, `HITSTOP_MS` de `card-weight.ts` (`video-fx.test.ts` vigila que sigan iguales) y, sin exportar, `ACTIVATE_MS` y `FLIP_MS` de `PracticeMat.tsx`, `HAND_FLASH_MS` de `PracticeMat.tsx`, `DEAL_MS` de
 * `PracticeHand.tsx` y `STRIKE_MS` de `AttackFx.tsx`.
 */
export const MESA = {
  flight: UI_ANIMATION_MS * 2,
  stagger: 70,
  landingAt: 0.85,
  travel: 320,
  stage: 950,
  banner: 850,
  turnBanner: 1250,
  handFlash: 900,
  flip: 380,
  shuffle: 620,
  handShuffle: 900,
  firstDeal: 760,
  nextDeal: 100,
  deal: 380,
  dealLandAt: 0.8,
  impact: 300,
  strike: 1050,
  delta: 1600,
  hitstop: 50,
} as const

/**
 * El impacto de la mesa (`field-impact.ts`), en px del celular: la sacudida del campo (`SHAKES`: los cuadros repartidos parejo, cada vaivén con `EASE_IN_OUT`). La llegada al campo
 * (`arriveAt`) se lee de `ARRIVAL`. El test vigila que sigan iguales.
 */
export const IMPACT = {
  shakes: {
    light: { path: [[0, 0], [3, -2], [-3, 1.5], [2, 1], [-1, -0.5], [0, 0]], ms: 180 },
    strong: { path: [[0, 0], [5, -3], [-5, 2], [4, 2], [-2, -1.5], [1, 0.5], [0, 0]], ms: 240 },
  },
  /**
   * El golpe de un ataque (`ringAt` con `hit`), dorado y con la curva «puñetazo» (`punchAt`): el aro (`size-36`, `border-3`, su gemela un contorno de 2 px), el destello aditivo
   * (`size-40`) sobre su halo negro (`size-44`, libre hasta el 30 %), las líneas (`h-0.5 w-3`) y el polvo (`size-1.5`) de la segunda onda. Los radios, ángulos y cuadros los lee de
   * `field-impact.ts`.
   */
  hit: {
    ring: { size: 144, border: 3, twin: 2 },
    flash: { size: 160, twin: 176, alpha: 0.9, stop: 0.7, hole: 0.3 },
    lines: { width: 2, length: 12 },
    dust: { size: 6 },
  },
  /** La onda de pantalla completa (`border-4`, contorno de 4 px) y la carga del ataque (`border-2`, relleno al 35 %). */
  wave: { border: 4, twin: 4 },
  charge: { border: 2, alpha: 0.35 },
} as const

/** Lo que dura un vuelo de `distance` (en px del lienzo de referencia de 720): como `flightMs` de la mesa. */
export const flightMs = (distance: number) => Math.round(UI_ANIMATION_MS + (MESA.flight - UI_ANIMATION_MS) * Math.min(1, distance / 600))
/** Lo que cuentan las vidas al cambiar `delta`: como `lifeCountMs` de `life-effects.ts`. */
export const lifeMs = (delta: number) => Math.round(320 + (900 - 320) * Math.min(1, Math.abs(delta) / 8000))

const LANDING_TONE = (tone: LandingTone) => STAGE_TONE[tone]

const easeOut = bezierEase(EASE_OUT)
const easeSnap = bezierEase(EASE_SNAP)
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const mix = (a: number, b: number, e: number) => a + (b - a) * e
const rgba = (rgb: string, alpha: number) => `rgb(${rgb} / ${alpha})`

/** Una animación por cuadros clave (como un `@keyframes`): el valor en `p` (0 a 1), con `ease` en cada tramo. */
export function keyed(p: number, keys: readonly (readonly [number, number])[], ease: (x: number) => number = easeOut): number {
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
  kind: 'stage' | 'landing' | 'banner' | 'shuffle' | 'handShuffle' | 'deal' | 'hand' | 'attack' | 'delta' | 'title' | 'chain' | 'medal' | 'target' | 'impact' | 'shake'
  start: number
  duration: number
  draw: (ctx: Ctx, p: number) => void
  /** La sacudida de un impacto: cuánto se corre el campo dibujado (px del lienzo) en `p`. Lo de encima (el texto, las chapas, los efectos, lo que vuela) no se mueve. */
  shift?: (p: number) => readonly [number, number]
  /** Las cartas que este efecto anima en su lugar (`lado:id`, o `lado:pile:deck`): mientras dura, la mesa de abajo no las pinta. */
  hides?: readonly string[]
  /** La banda de fase: de quién es (0 = tuya) y cómo sigue, sin volver a entrar, si llega otra fase mientras se ve (`carry`). */
  side?: number
  carry?: Overlay
}

const fieldOf = (scene: Scene): Rect => fieldRect(scene.cells)

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

/**
 * Lo que dibuja cada efecto de una jugada, con sus tiempos. `start`: cuándo empieza la jugada (ms de video). `chain`: el replay trae la cadena (el duelo automático): lo que se
 * activa no sale grande, lo dice la escena de la cadena (`video-chain.ts`), como en el reproductor.
 */
export function overlaysOf(before: Scene, after: Scene, flights: readonly Flight[], assets: VideoAssets, speed: VideoSpeed, start: number, kind: 'duel' | 'combo', chain = false): Overlay[] {
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
  const spot = effects.spotlight && effects.spotlight.kind !== 'target' && effects.spotlight.kind !== 'attack' && !(chain && effects.spotlight.kind === 'activate') ? { ids: effects.spotlight.ids ?? [effects.spotlight.id], kind: effects.spotlight.kind as SpotlightKind | ShowcaseKind, flip: false } : null
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
    if (cards.length > 0) out.push(stageOverlay(cards, stage.kind, stage.flip, field, assets, s, at(0), speed))
  }

  // El destello de una invocación, cuando la carta toca la zona.
  if (effects.landing) {
    const id = 'id' in action ? action.id : null
    const pose = id ? placeIn(now, id, sides)?.pose : null
    const rect = pose ? { x: pose.x - after.layout.cell / 2, y: pose.y - after.layout.cell / 2, w: after.layout.cell, h: after.layout.cell } : after.focus[0]
    const hit = start + (effects.landing.flies && id ? landingOf(id) : 0)
    if (rect) {
      out.push(landingOverlay(rect, FX_RGB[LANDING_TONE(effects.landing.tone)], s, hit, speed))
      // El impacto de la mesa (`field-impact.ts`), cuando toca: la llegada del color de su tipo desde la casilla y la sacudida del campo, del grado de la mesa (el video no sabe el
      // marco de la carta: un Ritual va como Especial).
      out.push(...impactOverlays(rect.x + rect.w / 2, rect.y + rect.h / 2, shakeOf({ landing: effects.landing.tone }), after.layout.unit, theme, hit, hit, speed, false, landingToneOf(effects.landing, UNKNOWN_SUMMON)))
    }
  }

  // La banda de la fase: el nombre sobre el color de quien juega (violeta lo tuyo, lima lo del rival), como `PhaseBand` de la mesa. Un pase de turno, antes «Cambio de turno», y las dos del color de quien empieza.
  if (effects.banner) {
    const name = PHASES.find((phase) => phase.id === effects.banner!.phase)?.name ?? effects.banner.phase
    const passed = effects.banner.turn !== null
    const side = (actor === 0) !== passed ? 0 : 1
    const k = after.layout.unit
    const middle = after.layout.cellAt(after.layout.middle, 1)
    const row = { ...field, y: middle.y, h: middle.h }
    if (passed) out.push(bannerOverlay(t('duel.phase.turnChange'), side, row, theme, k, at(0), speed, false, true))
    out.push(bannerOverlay(name, side, row, theme, k, at(passed ? MESA.turnBanner : 0), speed))
  }

  // Una carta entró a tu mano: la mano se enmarca un instante en celeste (`fx-zone` de la mesa; la del rival, no).
  if (effects.hand && actor === 0) out.push(handFrameOverlay(after.layout.myHand, s, at(0), speed))

  // El barajado: el deck de quien jugó (y su mano, cuando ya llegó lo que se sumó a ella), como en la mesa.
  if (effects.shuffle) {
    const deck = after.sides[actor].slots.find((slot) => slot.pile === 'deck')
    if (deck && assets.back) out.push(shuffleOverlay(deck, actor, assets, s, at(0), speed))
    const hand = after.sides[actor].hand
    const landed = Math.max(0, ...flights.map((flight) => flight.delay + flight.duration))
    if (hand.length > 1) out.push(handShuffleOverlay(hand, actor, assets, s, start + landed, speed))
  }

  // El ataque: un rayo rojo del atacante a su objetivo (o a las vidas del rival) y el impacto al llegar.
  if (action.type === 'attack') {
    const from = placeIn(now, action.id, [actor])?.pose
    const target = action.target ? placeIn(now, action.target, [1 - actor])?.pose : null
    const score = after.layout.score
    const to = target ?? { x: actor === 0 ? score.x + score.w - 60 * s : score.x + 60 * s, y: actor === 0 ? score.y + 50 * s : field.y + field.h }
    // Al conectar, el impacto de la mesa (`AttackFx`): el aro y el destello donde pega y, pasada la pausa del golpe, la sacudida (fuerte si es directo, leve contra una carta).
    if (from) out.push(attackOverlay(from, to, after.layout.cell, s, at(0), speed), ...impactOverlays(to.x, to.y, shakeOf({ attack: target ? 'card' : 'direct' }), after.layout.unit, theme, at(MESA.impact), at(MESA.impact + MESA.hitstop), speed, true))
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

function stageOverlay(cards: readonly StageCard[], kind: SpotlightKind | ShowcaseKind, flip: boolean, field: Rect, assets: VideoAssets, s: number, start: number, speed: VideoSpeed): Overlay {
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
        // El nombre abajo, en la segunda mitad del viaje, sólo en la carta sin imagen (con imagen ya está impreso; y lo que pasó se lee en el texto del paso, en el cuadro).
        const label = clamp((ms - MESA.travel / 2) / (MESA.travel / 2))
        if (card.face.name && !card.face.art && label > 0) {
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

/** Los tiempos de la banda de la mesa (`PhaseBand`): entra 200 ms desde el costado de quien juega, el nombre llega 100 ms después, se queda hasta los 600 ms y sale en otros 200 por el otro lado. */
// En px del celular: 52 de alto (`h-13`), el nombre de 24 (`text-title`, `tracking-wide`) y llega desde 32 px (`translate-x-8`).
const BAND = { in: 200, hold: 600, out: 200, textAt: 100, h: 52, font: 24, tracking: 0.025, from: 32, ms: MESA.banner }
/** La de «Cambio de turno»: más alta (`h-20`), la frase de 33 (`text-stat`, `tracking-tighter`) que llega desde 48 px (`translate-x-12`); entra en 250, se queda hasta los 1000 y sale en 250. */
const TURN_BAND = { in: 250, hold: 1000, out: 250, textAt: 100, h: 80, font: 33, tracking: -0.05, from: 48, ms: MESA.turnBanner }

/** `field`: el ancho del campo y la fila del medio (la banda va centrada en ella, `p2`); `k`: px del video por px del celular (`layout.unit`). */
function bannerOverlay(name: string, side: 0 | 1, field: Rect, theme: VideoAssets['theme'], k: number, start: number, speed: VideoSpeed, resumed = false, turn = false): Overlay {
  const band = turn ? TURN_BAND : BAND
  const h = band.h * k
  const cy = field.y + field.h / 2
  const [rgb, ink] = side === 0 ? [theme.primaryRgb, theme.primaryForeground] : [theme.infoRgb, theme.accentForeground]
  const dir = side === 0 ? 1 : -1
  const overlay: Overlay = {
    kind: 'banner',
    side,
    start,
    duration: band.ms / speed,
    draw: (ctx, p) => {
      const ms = p * band.ms
      const entered = resumed ? 1 : easeOut(clamp(ms / band.in))
      const left = easeInOut(clamp((ms - band.hold) / band.out))
      const alpha = entered * (1 - left)
      if (alpha <= 0) return
      const dx = field.w * dir * (left - (1 - entered))
      ctx.save()
      ctx.beginPath()
      ctx.rect(field.x, cy - h / 2, field.w, h)
      ctx.clip()
      ctx.globalAlpha = alpha
      const fill = ctx.createLinearGradient(field.x + dx, 0, field.x + dx + field.w, 0)
      fill.addColorStop(0, rgba(rgb, 0))
      fill.addColorStop(0.14, rgba(rgb, 1))
      fill.addColorStop(0.86, rgba(rgb, 1))
      fill.addColorStop(1, rgba(rgb, 0))
      ctx.fillStyle = fill
      ctx.fillRect(field.x + dx, cy - h / 2, field.w, h)
      if (turn) {
        // El contorno luminoso: una línea clara arriba y otra abajo.
        const edge = ctx.createLinearGradient(field.x + dx, 0, field.x + dx + field.w, 0)
        edge.addColorStop(0, 'rgba(255,255,255,0)')
        edge.addColorStop(0.5, 'rgba(255,255,255,0.85)')
        edge.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = edge
        ctx.fillRect(field.x + dx, cy - h / 2, field.w, 2 * k)
        ctx.fillRect(field.x + dx, cy + h / 2 - 2 * k, field.w, 2 * k)
      }
      // El nombre, en mayúsculas e itálica: llega un instante después desde el mismo costado.
      const text = easeOut(clamp((ms - band.textAt) / band.in))
      ctx.globalAlpha = alpha * text
      ctx.fillStyle = ink
      ctx.font = `italic 800 ${band.font * k}px ${FONT}`
      ctx.letterSpacing = `${band.tracking * band.font * k}px`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (turn) {
        // `text-shadow-lg text-shadow-white/35`: el resplandor claro de la frase.
        ctx.shadowColor = 'rgb(255 255 255 / 0.35)'
        ctx.shadowBlur = 8 * k
        ctx.shadowOffsetY = 4 * k
      }
      ctx.fillText(name.toUpperCase(), field.x + field.w / 2 + dx - dir * band.from * k * (1 - text), cy + k, field.w * 0.72)
      ctx.letterSpacing = '0px'
      ctx.restore()
    },
  }
  return resumed ? overlay : { ...overlay, carry: bannerOverlay(name, side, field, theme, k, start, speed, true, turn) }
}

/**
 * Los planes del barajado de la mesa (`DECK` y `HAND` de `shuffle-fx.ts`, en ms y en tamaños de carta; el test los vigila): el riffle en dos paquetes que caen alternando al
 * centro y se golpean contra la mesa; la mano, antes, se junta en una pila y, después, se abre salteada a sus lugares.
 */
export const RIFFLE = {
  deck: { gather: 0, split: 160, dropFrom: 170, dropSpan: 220, drop: 90, knock: 560, openFrom: 560, openSpan: 0, open: 60, spread: 0.38, lift: 0.32, shift: 0.38 },
  hand: { gather: 170, split: 280, dropFrom: 290, dropSpan: 180, drop: 90, knock: 580, openFrom: 600, openSpan: 110, open: 190, spread: 0.42, lift: 0.32, shift: 0 },
} as const
type Plan = (typeof RIFFLE)[keyof typeof RIFFLE]
/** Las capas del deck de la mesa (`DECK_LAYERS` y la de arriba), en px de una carta de 56 px de ancho. */
const DECK_LAYERS = [...Array<number>(6).fill(3), 1.5, 0]
const NOISE = [0.6, -0.9, 0.3, -0.4, 1, -0.7, 0.8, -0.2, 0.5, -1, 0.1, 0.9]
const noise = (index: number) => NOISE[index % NOISE.length]!
const easeOf = { out: easeOut, inOut: easeInOut, snap: easeSnap, linear: (x: number) => x }

/** Una carta del barajado en `ms`: cuánto se corre (en el plano de su pila o de la mano) y cuánto gira de más, en grados; como los cuadros de `shuffle()` de la mesa. */
function riffleAt(plan: Plan, index: number, count: number, gather: { dx: number; dy: number; straight: number } | null, size: { w: number; h: number }, k: number, ms: number) {
  const dx = gather ? gather.dx : -plan.shift * size.w
  const dy = gather ? gather.dy : 0
  const straight = gather ? gather.straight : 0
  const side = index % 2 === 0 ? -1 : 1
  const inPacket = index >> 1
  const pose = (x: number, y: number, r: number) => [dx + x * k, dy + y * k, straight + r] as const
  const home = [0, 0, 0] as const
  const pile = pose(noise(index) * 1.5, -index * 0.6, noise(index + 4) * 2)
  const packet = [dx + side * (plan.spread * size.w + inPacket * 3 * k) + noise(index) * 2 * k, dy - plan.lift * size.h - inPacket * 3 * k + noise(index + 3) * 1.5 * k, straight + side * (7 + noise(index + 5) * 2)] as const
  const landed = [dx - side * 0.12 * size.w, dy - index * 0.6 * k, straight - side * 2] as const
  const knocked = gather ? pose(0, 2, 0) : ([0, 2 * k, 0] as const)
  const dropAt = plan.dropFrom + (count > 1 ? (index * plan.dropSpan) / (count - 1) : 0)
  const order = Array.from({ length: count }, (_, i) => i).sort((x, y) => ((x * 37 + 11) % 101) - ((y * 37 + 11) % 101))
  const openAt = plan.openFrom + (count > 1 ? (order.indexOf(index) * plan.openSpan) / (count - 1) : 0)
  const total = plan.openFrom + plan.openSpan + plan.open
  const steps: [number, readonly [number, number, number], keyof typeof easeOf][] = [
    [0, home, gather ? 'inOut' : 'out'],
    ...(gather ? [[plan.gather, pile, 'out'] as [number, readonly [number, number, number], keyof typeof easeOf]] : []),
    [plan.split, packet, 'linear'],
    [dropAt, packet, 'inOut'],
    [dropAt + plan.drop, landed, 'snap'],
    [plan.knock, knocked, 'linear'],
    [openAt, knocked, 'inOut'],
    [openAt + plan.open, home, 'linear'],
    [total, home, 'linear'],
  ]
  for (let i = 1; i < steps.length; i += 1) {
    const [to, value] = steps[i]!
    const [from, start, ease] = steps[i - 1]!
    if (ms < to) {
      const e = easeOf[ease](to === from ? 1 : clamp((ms - from) / (to - from)))
      return { x: mix(start[0], value[0], e), y: mix(start[1], value[1], e), r: (mix(start[2], value[2], e) * Math.PI) / 180 }
    }
  }
  return { x: 0, y: 0, r: 0 }
}

const BACK: SceneCard = { id: '', art: null, name: '', faceDown: true, sideways: false, upsideDown: false, counters: 0, materials: 0 }

/** El deck se baraja a la vista: sus ocho capas de dorso, en el plano de su lado (el del rival, de cabeza), como `shuffleDeck`. */
function shuffleOverlay(deck: SceneSlot, side: number, assets: VideoAssets, s: number, start: number, speed: VideoSpeed): Overlay {
  const card = poseOf(deck.rect, { sideways: false, upsideDown: side === 1 })
  const k = card.w / 56
  return {
    kind: 'shuffle',
    start,
    duration: MESA.shuffle / speed,
    hides: [`${side}:pile:deck`],
    draw: (ctx, p) => {
      const ms = p * MESA.shuffle
      ctx.save()
      ctx.translate(card.x, card.y)
      ctx.rotate(card.angle)
      DECK_LAYERS.forEach((offset, index) => {
        const at = riffleAt(RIFFLE.deck, index, DECK_LAYERS.length, null, card, k, ms)
        ctx.save()
        ctx.translate(at.x - offset * k, at.y + offset * k)
        ctx.rotate(at.r)
        drawCard(ctx, { x: 0, y: 0, w: card.w, h: card.h, angle: 0 }, BACK, assets, s, 0.4)
        ctx.restore()
      })
      ctx.restore()
    },
  }
}

/** La mano se baraja a la vista (`shuffleHand`): se junta en una pila, el riffle y se abre salteada a su lugar en el abanico. */
function handShuffleOverlay(hand: readonly SceneSlot[], side: number, assets: VideoAssets, s: number, start: number, speed: VideoSpeed): Overlay {
  const poses = hand.map((slot) => poseOf(slot.rect, slot.card!))
  const center = { x: poses.reduce((sum, pose) => sum + pose.x, 0) / poses.length, y: poses.reduce((sum, pose) => sum + pose.y, 0) / poses.length - 12 * s }
  const k = poses[0]!.w / 64
  return {
    kind: 'handShuffle',
    start,
    duration: MESA.handShuffle / speed,
    hides: hand.map((slot) => `${side}:${slot.card!.id}`),
    draw: (ctx, p) => {
      const ms = p * MESA.handShuffle
      hand.forEach((slot, index) => {
        const pose = poses[index]!
        const at = riffleAt(RIFFLE.hand, index, hand.length, { dx: center.x - pose.x, dy: center.y - pose.y, straight: (-pose.angle * 180) / Math.PI }, pose, k, ms)
        drawCard(ctx, { ...pose, x: pose.x + at.x, y: pose.y + at.y, angle: pose.angle + at.r }, slot.card!, assets, s, 0.5)
      })
    },
  }
}

/**
 * El reparto de la mano al empezar, como en la mesa: el deck se baraja y, `MESA.firstDeal` después, sale una carta cada `MESA.nextDeal` por una curva baja hasta su lugar en el
 * abanico (`dealFrames`: arranca rápido y llega despacio, dándose vuelta en el camino, y se asienta apenas más grande).
 */
export function dealOverlays(scene: Scene, assets: VideoAssets, speed: VideoSpeed): Overlay[] {
  const side = scene.sides[0]
  const deck = side.slots.find((slot) => slot.pile === 'deck')
  if (!deck || side.hand.length === 0 || !assets.back) return []
  const s = scene.layout.scale
  const from = poseOf(deck.rect, { sideways: false, upsideDown: false })
  const cards = side.hand.map((slot) => ({ card: slot.card!, to: poseOf(slot.rect, slot.card!) }))
  const total = MESA.firstDeal + (cards.length - 1) * MESA.nextDeal + MESA.deal
  const turnEase = easeInOut
  return [
    shuffleOverlay(deck, 0, assets, s, 0, speed),
    {
      kind: 'deal',
      start: 0,
      duration: total / speed,
      hides: cards.map(({ card }) => `0:${card.id}`),
      draw: (ctx, p) => {
        const ms = p * total
        cards.forEach(({ card, to }, index) => {
          const t = (ms - MESA.firstDeal - index * MESA.nextDeal) / MESA.deal
          if (t <= 0) return
          if (t >= 1) return drawCard(ctx, to, card, assets, s, 0.5)
          const flying = t < MESA.dealLandAt
          const done = flying ? easeOut(t / MESA.dealLandAt) : 1
          const settle = flying ? 0 : easeOut((t - MESA.dealLandAt) / (1 - MESA.dealLandAt))
          const startScale = Math.max(0.3, from.w / to.w)
          const scale = flying ? mix(startScale, 1.04, done) : mix(1.04, 1, settle)
          const turn = turnEase(Math.min(1, t / MESA.dealLandAt))
          const arc = 24 * (to.h / 96)
          const pose = { x: mix(from.x, to.x, done), y: mix(from.y, to.y, done) - arc * 4 * done * (1 - done), w: to.w * scale * Math.abs(Math.cos(Math.PI * turn)), h: to.h * scale, angle: mix(-Math.PI / 18, to.angle, done) }
          drawCard(ctx, pose, turn < 0.5 ? BACK : card, assets, s, flying ? 1 : 0.5)
        })
      },
    },
  ]
}

function handFrameOverlay(area: Rect, s: number, start: number, speed: VideoSpeed): Overlay {
  const tone = FX_RGB.cyan
  const r = { x: area.x - 10 * s, y: area.y - 10 * s, w: area.w + 20 * s, h: area.h + 20 * s }
  return {
    kind: 'hand',
    start,
    duration: MESA.handFlash / speed,
    draw: (ctx, p) => {
      ctx.save()
      ctx.globalAlpha = keyed(p, [[0, 0], [0.15, 1], [0.7, 1], [1, 0]])
      ctx.fillStyle = rgba(tone, 0.06)
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.shadowColor = rgba(tone, 0.5)
      ctx.shadowBlur = 20 * s
      ctx.strokeStyle = rgba(tone, 1)
      ctx.lineWidth = 2.5 * s
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.restore()
    },
  }
}

function attackOverlay(from: Pose, to: { x: number; y: number }, cell: number, s: number, start: number, speed: VideoSpeed): Overlay {
  const tone = FX_RGB.red
  const gold = FX_RGB.gold
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
      // La carga (`chargeOn`): hasta el impacto, el marco dorado de la carta que ataca (opaco hasta la mitad) y el polvo que converge hacia ella.
      if (ms < MESA.impact) {
        const c = ms / MESA.impact
        const [w, h] = [from.w * CHARGE_SIZE.w, from.h * CHARGE_SIZE.h]
        ctx.globalAlpha = c < 0.5 ? 1 : 2 - 2 * c
        ctx.fillStyle = rgba(gold, IMPACT.charge.alpha)
        ctx.fillRect(from.x - w / 2, from.y - h / 2, w, h)
        ctx.strokeStyle = rgba(gold, 1)
        ctx.lineWidth = IMPACT.charge.border * s
        ctx.strokeRect(from.x - w / 2, from.y - h / 2, w, h)
        ctx.globalAlpha = keyed(c, [[0, 0], [0.2, 0.9], [0.6, 0.9], [1, 0]], (v) => v)
        const reach = from.w * 0.75 * (1 - easeOut(c))
        ctx.fillStyle = rgba(gold, 1)
        for (let i = 0; i < 6; i += 1) {
          ctx.beginPath()
          ctx.arc(from.x + Math.cos((i * Math.PI) / 3) * reach, from.y + Math.sin((i * Math.PI) / 3) * reach, 3 * s, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      // El impacto, dorado como en la mesa (el rojo queda para el rayo y la espada).
      const hit = ms - MESA.impact
      if (hit > 0) {
        if (hit < 560) flash(ctx, to.x, to.y, cell / 2, gold, hit / 560)
        ring(ctx, { x: to.x - cell / 2, y: to.y - cell / 2, w: cell, h: cell }, gold, 3 * s, hit / 720, true)
      }
    },
  }
}

const swing = bezierEase(EASE_IN_OUT)

/**
 * El impacto de la mesa en el lienzo (`arriveAt`, `ringAt` y `shakeField` de `field-impact.ts`, con `IMPACT`): en `(x, y)` a los `ringAt` ms, la llegada del color de `tone` (`drawArrival`); a los
 * `shakeAt`, la sacudida del campo. `hit` (un ataque): el golpe dorado con la curva «puñetazo», su gemela oscura y la segunda onda (`IMPACT.hit`). Si sacude fuerte, además, la onda
 * que cruza el lienzo. `k`: px del lienzo por px del celular. En el video no hay «Livianos»: va completo.
 */
export function impactOverlays(x: number, y: number, shake: Shake, k: number, theme: VideoAssets['theme'], ringAt: number, shakeAt: number, speed: VideoSpeed, hit = false, tone: ArrivalTone = 'special'): Overlay[] {
  const strong = shake === 'strong'
  const total = hit ? Math.max(HIT_MS, SECOND_AT + SECOND_MS) : arrivalMs(strong)
  // `from-fx-destello` a `to-transparent`: el mismo color, sin alfa (un degradé a `transparent` se oscurece en el lienzo).
  const clear = /^#[0-9a-f]{6}$/i.test(theme.fx.destello) ? `${theme.fx.destello}00` : 'transparent'
  const out: Overlay[] = [
    {
      kind: 'impact',
      start: ringAt,
      duration: total / speed,
      draw: (ctx, p) => {
        const ms = p * total
        if (hit) {
          if (strong) drawWave(ctx, x, y, k, theme.fx.destello, ms / WAVE_MS)
          drawHit(ctx, x, y, k, theme.fx.destello, clear, ms)
          return
        }
        drawArrival(ctx, x, y, ARRIVAL_UNIT * k, theme.fx.llegada[tone], strong, ms)
      },
    },
  ]
  if (shake === 'none') return out
  const { path, ms } = IMPACT.shakes[shake]
  const axis = (index: 0 | 1) => path.map((point, at) => [at / (path.length - 1), point[index] * k] as const)
  const [xs, ys] = [axis(0), axis(1)]
  out.push({ kind: 'shake', start: shakeAt, duration: ms / speed, draw: () => {}, shift: (p) => [keyed(p, xs, swing), keyed(p, ys, swing)] })
  return out
}

const TWIN = 'rgb(0 0 0 / 0.4)'

/** Un aro con su gemela oscura afuera (el contorno de la mesa): primero el negro, más ancho, y encima el dorado. */
function twinRing(ctx: Ctx, x: number, y: number, radius: number, border: number, twin: number, color: string) {
  ctx.lineWidth = border + 2 * twin
  ctx.strokeStyle = TWIN
  ctx.beginPath()
  ctx.arc(x, y, radius + twin / 2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = border
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
}

/** El ancho de la carta del campo en el celular (px): la llegada se mide en cartas (`ARRIVAL`). */
export const ARRIVAL_UNIT = 48
/** Lo que dura la llegada: el anillo (la fuerte, su tercer anillo sale 200 ms después). */
export const arrivalMs = (strong: boolean) => ARRIVAL.ms + (strong ? (ARRIVAL.strong.rings - 1) * ARRIVAL.strong.every : 0)

/**
 * La llegada al campo (`arriveAt` de `field-impact.ts`) en `ms` desde que la carta toca: el brillo aditivo del piso, la cruz de cuatro cuñas y el anillo con su gemela oscura; la fuerte, tres
 * anillos más grandes y la onda. `unit`: el ancho de la carta en px del lienzo.
 */
export function drawArrival(ctx: Ctx, x: number, y: number, unit: number, color: string, strong: boolean, ms: number) {
  const { glow, cross, ring } = ARRIVAL
  const g = ms / glow.ms
  if (g > 0 && g < 1) {
    const radius = (glow.size / 2) * unit * mix(0.6, 1, easeOut(g))
    const fill = ctx.createRadialGradient(x, y, 0, x, y, radius * Math.SQRT2)
    fill.addColorStop(0, color)
    fill.addColorStop(0.7, /^#[0-9a-f]{6}$/i.test(color) ? `${color}00` : 'transparent')
    ctx.globalAlpha = glow.alpha * 0.6 * (g < glow.peak ? g / glow.peak : (1 - g) / (1 - glow.peak))
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
  const c = ms / cross.ms
  if (c > 0 && c < 1) {
    const scale = c < cross.fastAt ? mix(cross.from, cross.fast, easeOut(c / cross.fastAt)) : mix(cross.fast, 1, easeOut((c - cross.fastAt) / (1 - cross.fastAt)))
    ctx.globalAlpha = c < cross.hold ? 1 : (1 - c) / (1 - cross.hold)
    for (const [width, style] of [[4, TWIN], [2, color]] as const) {
      ctx.lineWidth = (width * unit) / ARRIVAL_UNIT
      ctx.strokeStyle = style
      ctx.beginPath()
      for (const angle of [45, 135, 225, 315]) {
        const [cos, sin] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)]
        ctx.moveTo(x, y)
        ctx.lineTo(x + cos * cross.reach * unit * scale, y + sin * cross.reach * unit * scale)
      }
      ctx.stroke()
    }
  }
  const grow = strong ? ARRIVAL.strong.grow : 1
  const rings = strong ? ARRIVAL.strong.rings : 1
  for (let index = 0; index < rings; index += 1) {
    const p = (ms - index * ARRIVAL.strong.every) / ARRIVAL.ms
    if (p <= 0 || p >= 1) continue
    const { scale, alpha } = arrivalRingAt(p)
    ctx.globalAlpha = alpha
    twinRing(ctx, x, y, ((ring.to * unit * grow) / 2) * scale, (2 * unit) / ARRIVAL_UNIT, (2 * unit) / ARRIVAL_UNIT, color)
  }
  if (strong) {
    const { wave, waveMs, waveFrom, waveFast, waveFastAt } = ARRIVAL.strong
    const w = ms / waveMs
    if (w > 0 && w < 1) {
      const scale = w < waveFastAt ? mix(waveFrom, waveFast, easeOut(w / waveFastAt)) : mix(waveFast, 1, easeOut((w - waveFastAt) / (1 - waveFastAt)))
      ctx.globalAlpha = w < 0.5 ? 1 - 1.6 * w : 0.2 * (1 - (w - 0.5) / 0.5)
      twinRing(ctx, x, y, (Math.min(wave * unit, Math.hypot(ctx.canvas.width, ctx.canvas.height)) / 2) * scale, (3 * unit) / ARRIVAL_UNIT, (3 * unit) / ARRIVAL_UNIT, color)
    }
  }
  ctx.globalAlpha = 1
}

/** La onda de pantalla completa del golpe fuerte (`WAVE_*`): lineal, de la diagonal del lienzo. */
function drawWave(ctx: Ctx, x: number, y: number, k: number, color: string, w: number) {
  if (w <= 0 || w >= 1) return
  const scale = WAVE_FROM + (1 - WAVE_FROM) * w
  const { border, twin } = IMPACT.wave
  ctx.globalAlpha = w < WAVE_HOLD ? 1 : (1 - w) / (1 - WAVE_HOLD)
  twinRing(ctx, x, y, (Math.hypot(ctx.canvas.width, ctx.canvas.height) / 2) * scale, border * k * scale, twin * k * scale, color)
  ctx.globalAlpha = 1
}

/** El golpe de un ataque en `ms` desde el impacto: la gemela del destello, el aro y el destello aditivo con la curva «puñetazo» y, a los `SECOND_AT`, las líneas y el polvo. */
function drawHit(ctx: Ctx, x: number, y: number, k: number, color: string, clear: string, ms: number) {
  const { ring, flash, lines, dust } = IMPACT.hit
  const h = ms / HIT_MS
  if (h > 0 && h < 1) {
    const { scale, alpha } = punchAt(h)
    // El halo negro (libre en el centro) debajo del destello.
    const twinR = (flash.twin / 2) * k * scale
    const halo = ctx.createRadialGradient(x, y, 0, x, y, twinR * Math.SQRT2)
    halo.addColorStop(flash.hole, 'rgb(0 0 0 / 0)')
    halo.addColorStop(0.5, TWIN)
    halo.addColorStop(flash.stop, 'rgb(0 0 0 / 0)')
    ctx.globalAlpha = alpha
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(x, y, twinR, 0, Math.PI * 2)
    ctx.fill()
    twinRing(ctx, x, y, ((ring.size - ring.border) / 2) * k * scale, ring.border * k * scale, ring.twin * k * scale, color)
    const radius = (flash.size / 2) * k * scale
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * Math.SQRT2)
    glow.addColorStop(0, color)
    glow.addColorStop(flash.stop, clear)
    ctx.globalAlpha = flash.alpha * alpha
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
  const s = (ms - SECOND_AT) / SECOND_MS
  if (s > 0 && s < 1) {
    const at = (keys: ReadonlyArray<readonly [number, number, number]>, index: 1 | 2) => keyed(s, keys.map((key) => [key[0], key[index]] as const))
    // Las líneas se cierran hacia el centro (su gemela, el trazo negro más ancho debajo).
    const ls = at(SECOND_KEYS.lines, 1)
    ctx.globalAlpha = at(SECOND_KEYS.lines, 2)
    for (const [width, style] of [[lines.width + 2, TWIN], [lines.width, color]] as const) {
      ctx.lineWidth = width * k * ls
      ctx.strokeStyle = style
      ctx.beginPath()
      for (const angle of LINE_ANGLES) {
        const [cos, sin] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)]
        ctx.moveTo(x + cos * LINE_RADIUS * k * ls, y + sin * LINE_RADIUS * k * ls)
        ctx.lineTo(x + cos * (LINE_RADIUS + lines.length) * k * ls, y + sin * (LINE_RADIUS + lines.length) * k * ls)
      }
      ctx.stroke()
    }
    // El polvo se abre.
    const ds = at(SECOND_KEYS.dust, 1)
    ctx.globalAlpha = at(SECOND_KEYS.dust, 2)
    ctx.fillStyle = color
    for (const angle of DUST_ANGLES) {
      ctx.beginPath()
      ctx.arc(x + Math.cos((angle * Math.PI) / 180) * DUST_RADIUS * k * ds, y + Math.sin((angle * Math.PI) / 180) * DUST_RADIUS * k * ds, (dust.size / 2) * k * ds, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

/** Cuánto se corre el campo en `now` (ms de video): la sacudida viva, o nada. */
export function shiftAt(alive: readonly Overlay[], now: number): readonly [number, number] {
  const shake = alive.find((overlay) => overlay.shift)
  return shake?.shift ? shake.shift(clamp((now - shake.start) / shake.duration)) : [0, 0]
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

/** Para agregar lo de una jugada nueva: lo del mismo tipo que sigue en pantalla se va (otra carta grande, otro destello). Una banda de fase que sigue a la vista, si es del mismo dueño, no vuelve a entrar: cambia el texto (`carry`). */
const targetsOf = (scene: Scene) => new Map([...placesOf(scene)].filter(([, place]) => place.card?.targeted))

/** Lo que se marca como objetivo en esta jugada (`lado:id`): su mira la dibuja `targetOverlays` mientras cae, no la mesa de abajo. */
export const freshTargets = (before: Scene, after: Scene): Set<string> => {
  const was = targetsOf(before)
  return new Set([...targetsOf(after).keys()].filter((key) => !was.has(key)))
}

/**
 * La mira de un objetivo que entra o se va, como en la mesa: la que se marca en esta jugada cae girando y se fija con su onda (`fx-lock`, `fx-ping`) y se queda toda la jugada (`length`);
 * la que se saca se apaga en `TARGET_OUT_MS` donde estaba. La que sigue marcada la pinta la mesa de abajo (`drawFrame`).
 */
export function targetOverlays(before: Scene, after: Scene, start: number, length: number, speed: VideoSpeed): Overlay[] {
  const was = targetsOf(before)
  const now = targetsOf(after)
  const k = after.layout.unit
  const fresh = [...now].filter(([key]) => !was.has(key)).map(([, place]): Overlay => ({
    kind: 'target',
    start,
    duration: length,
    draw: (ctx, p) => {
      const ms = p * length * speed
      drawTargetMark(ctx, place.pose, k, Math.min(1, ms / TARGET_LOCK_MS), 1, ms > TARGET_LOCK_MS * LOCK_AT ? (ms - TARGET_LOCK_MS * LOCK_AT) / TARGET_PING_MS : undefined)
    },
  }))
  const gone = [...was].filter(([key]) => !now.has(key)).map(([, place]): Overlay => ({
    kind: 'target',
    start,
    duration: TARGET_OUT_MS / speed,
    draw: (ctx, p) => drawTargetMark(ctx, place.pose, k, 1, 1 - easeInOut(p)),
  }))
  return [...fresh, ...gone]
}

/** La onda sale cuando la mira se fija (a los 55 % de `fx-lock`). */
const LOCK_AT = 0.55

export function replaceOverlays(live: readonly Overlay[], next: readonly Overlay[], now: number): Overlay[] {
  const kinds = new Set(next.map((overlay) => overlay.kind))
  const open = live.find((overlay) => overlay.kind === 'banner' && (now - overlay.start) / overlay.duration < 1)
  const added = next.map((overlay) => (overlay.kind === 'banner' && open && open.side === overlay.side && overlay.carry ? overlay.carry : overlay))
  return [...live.filter((overlay) => overlay.start + overlay.duration > now && !(kinds.has(overlay.kind) && overlay.kind !== 'delta')), ...added]
}
