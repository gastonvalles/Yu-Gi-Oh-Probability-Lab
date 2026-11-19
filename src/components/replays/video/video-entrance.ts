import { ENTRANCE, ENTRANCE_COMMON, ENTRANCE_FIGURE, PENDULUM, figureTime, pendulumAt, pendulumHit, type EntranceKind } from '../../../app/summon-entrance'
import { EASE_IN_OUT, EASE_OUT, EASE_REVELAR, EASE_SNAP, bezierEase } from '../../../app/motion'
import { drawCard, type Ctx, type VideoAssets } from './video-draw'
import type { Overlay } from './video-fx'
import type { Pose } from './video-motion'
import type { SceneCard } from './video-scene'
import type { VideoSpeed } from './video-timeline'

/**
 * La entrada larga de la mesa (`playEntrance` de `summon-entrance.ts`) en el lienzo: los mismos tiempos (`ENTRANCE`, que el video lee de ahí, sin copiarlos) y las mismas piezas, más
 * simples: el velo, la figura del tipo, los materiales que convergen, la carta que cae grande hasta su casilla con su aplastón y, en el golpe, nada más (la llegada fuerte y la sacudida
 * las pone `impactOverlays`). La carta de la mesa de abajo no se pinta mientras dura (`hides`): la dibuja ésta desde que toca. Lo que vuela antes queda bajo el velo.
 */

const out = bezierEase(EASE_OUT)
const inOut = bezierEase(EASE_IN_OUT)
const reveal = bezierEase(EASE_REVELAR)
const snap = bezierEase(EASE_SNAP)
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const mix = (a: number, b: number, e: number) => a + (b - a) * e
const TWIN = 'rgb(0 0 0 / 0.4)'

/** Una figura que entra en 200 ms desde `from` y se va en los 200 ms antes de `to`: su alfa en `ms`. */
const held = (ms: number, from: number, to: number) => clamp((ms - from) / 200) * clamp((to - ms) / 200)

function ring(ctx: Ctx, x: number, y: number, radius: number, width: number, color: string) {
  if (radius <= 0) return
  ctx.lineWidth = width + 2
  ctx.strokeStyle = TWIN
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = width
  ctx.strokeStyle = color
  ctx.stroke()
}

function glow(ctx: Ctx, x: number, y: number, radius: number, color: string, alpha: number) {
  if (radius <= 0 || alpha <= 0) return
  const fill = ctx.createRadialGradient(x, y, 0, x, y, radius)
  fill.addColorStop(0, '#ffffff')
  fill.addColorStop(0.35, color)
  fill.addColorStop(1, /^#[0-9a-f]{6}$/i.test(color) ? `${color}00` : 'transparent')
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

/** La figura de cada tipo en `ms` de su línea de tiempo (`ENTRANCE_FIGURE`), en el centro `(x, y)` con radio `r`. */
function drawFigure(ctx: Ctx, kind: EntranceKind, ms: number, x: number, y: number, r: number, color: string, k: number) {
  const t = ENTRANCE_FIGURE[kind]
  const until = t.hit + 150
  switch (kind) {
    case 'fusion': {
      // El remolino: arcos que giran y se cierran.
      const a = held(ms, t.figure, until)
      const turn = (ms / until) * Math.PI * 3
      ctx.globalAlpha = a * 0.85
      ctx.lineWidth = 6 * k
      for (let index = 0; index < 3; index += 1) {
        ctx.strokeStyle = index === 1 ? '#ff3c00' : color
        ctx.beginPath()
        ctx.arc(x, y, r * mix(1.1, 0.35, ms / until) * (1 - index * 0.2), turn + index * 2.1, turn + index * 2.1 + 1.6)
        ctx.stroke()
      }
      const f = (ms - t.accent) / 767
      if (f > 0 && f < 1) glow(ctx, x, y, r * 0.6 * mix(0.3, 1.4, out(f)), color, f < 0.22 ? f / 0.22 : (1 - f) / 0.78)
      return
    }
    case 'xyz': {
      const a = held(ms, t.figure, until)
      glow(ctx, x, y, r * 1.1, color, a * 0.35)
      const h = (ms - t.accent) / 1000
      if (h > 0 && h < 1) {
        const scale = h < 0.3 ? snap(h / 0.3) : mix(1, 0.15, (h - 0.3) / 0.65)
        ctx.globalAlpha = 1
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.arc(x, y, r * 0.45 * scale, 0, Math.PI * 2)
        ctx.fill()
        ring(ctx, x, y, r * 0.45 * scale, 2 * k, color)
      }
      const b = (ms - t.accent - 933) / 700
      if (b > 0 && b < 1) {
        ctx.globalAlpha = 1 - b
        ring(ctx, x, y, r * mix(0.1, 1.6, out(b)), 4 * k, color)
      }
      return
    }
    case 'link': {
      const a = held(ms, t.figure + 250, until)
      const g = clamp((ms - t.figure - 250) / 400)
      ctx.globalAlpha = a
      ctx.lineWidth = 3 * k
      ctx.strokeStyle = color
      const side = r * 1.1 * mix(0.2, 1, snap(g))
      ctx.strokeRect(x - side / 2, y - side / 2, side, side)
      for (let index = 0; index < 8; index += 1) {
        const on = clamp((ms - t.accent - index * 120) / 120) * a
        if (on <= 0) continue
        const angle = ((index * 45 - 45) * Math.PI) / 180
        const [cx, cy] = [x + Math.cos(angle) * r * 0.8, y + Math.sin(angle) * r * 0.8]
        ctx.globalAlpha = on
        ctx.beginPath()
        ctx.moveTo(cx - Math.cos(angle - 0.8) * 8 * k, cy - Math.sin(angle - 0.8) * 8 * k)
        ctx.lineTo(cx, cy)
        ctx.lineTo(cx - Math.cos(angle + 0.8) * 8 * k, cy - Math.sin(angle + 0.8) * 8 * k)
        ctx.stroke()
      }
      return
    }
    case 'synchro': {
      for (const [index, size] of [0.6, 1, 1.4].entries()) {
        const from = t.figure + index * 250
        ctx.globalAlpha = held(ms, from, until)
        ring(ctx, x, y, (size * r * mix(0.2, 1.6, clamp((ms - from) / (until - from)))) / 2, 2 * k, '#ffffff')
      }
      const s = (ms - t.accent) / 833
      if (s > 0 && s < 1) {
        ctx.globalAlpha = s < 0.2 ? s / 0.2 : s > 0.85 ? (1 - s) / 0.15 : 1
        ctx.fillStyle = color
        for (let index = 0; index < 5; index += 1) {
          const sx = x + (index - 2) * 0.45 * r * (s < 0.4 ? 1 : 1 - inOut((s - 0.4) / 0.6))
          ctx.fillRect(sx - 5 * k, y - 5 * k, 10 * k, 10 * k)
        }
      }
      const beamFrom = t.accent + 700
      const b = (ms - beamFrom) / (until - beamFrom)
      if (b > 0 && b < 1) {
        ctx.globalAlpha = b < 0.3 ? b / 0.3 : (1 - b) / 0.7
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = color
        const w = 0.35 * r * (b < 0.3 ? 1 : mix(1, 0.4, (b - 0.3) / 0.7))
        ctx.fillRect(x - w / 2, 0, w, ctx.canvas.height * (b < 0.3 ? out(b / 0.3) : 1))
        ctx.globalCompositeOperation = 'source-over'
      }
      return
    }
    case 'ritual': {
      for (const [index, size] of [0.5, 0.75, 1, 1.25, 1.5].entries()) {
        const from = t.figure + (index < 2 ? 0 : 383)
        ctx.globalAlpha = held(ms, from, until)
        ring(ctx, x, y, (size * r * mix(0.6, 1.05, clamp((ms - from) / (until - from)))) / 2, 2 * k, color)
      }
      for (let index = 0; index < 8; index += 1) {
        const from = t.accent + index * 67
        const f = (ms - from) / (t.hit - 150 - from)
        if (f <= 0 || f >= 1) continue
        const angle = (index * Math.PI) / 4
        glow(ctx, x + Math.cos(angle) * 0.68 * r, y + Math.sin(angle) * 0.68 * r, 10 * k * (f < 0.2 ? f / 0.2 : 1), color, f > 0.9 ? (1 - f) / 0.1 : 1)
      }
      const l = (ms - (t.hit - 184)) / 450
      if (l > 0 && l < 1) glow(ctx, x, y, 0.8 * r, color, 0.9 * (l < 0.52 ? l / 0.52 : (1 - l) / 0.48))
      return
    }
  }
}

/**
 * La entrada de `kind` sobre la casilla `to` (la pose de la carta en la mesa de abajo, `side:id` para esconderla), a los `start` ms del video y al ritmo `speed`. `k`: px del lienzo por
 * px del celular. Dura hasta que el duelo sigue (`end`).
 */
export function entranceOverlay(kind: EntranceKind, to: Pose, card: SceneCard | undefined, key: string, materials: number, color: string, assets: VideoAssets, k: number, s: number, start: number, speed: VideoSpeed): Overlay {
  const t = ENTRANCE
  const c = ENTRANCE_COMMON
  return {
    kind: 'entrance',
    start,
    duration: t.end / speed,
    hides: [key],
    draw: (ctx, p) => {
      const ms = p * t.end
      const { width, height } = ctx.canvas
      const [x, y, r] = [width / 2, height / 2, Math.min(width, height) * 0.36]
      ctx.save()
      // El velo.
      ctx.globalAlpha = c.veil * Math.min(clamp(ms / c.veilIn), clamp((t.end - ms) / c.veilOut))
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      // La figura y los materiales corren su línea de tiempo acomodada al golpe de todas, como en la mesa (`figureAt`).
      const at = figureTime(kind, ms)
      drawFigure(ctx, kind, at, x, y, r, color, k)
      // Los materiales, de los costados al centro.
      const m = at / ENTRANCE_FIGURE[kind].materials
      if (m > 0 && m < 1) {
        const n = Math.max(1, Math.min(6, materials || 2))
        const e = inOut(m)
        ctx.globalAlpha = m < 0.12 ? m / 0.12 : m > 0.85 ? (1 - m) / 0.15 : 1
        ctx.lineWidth = 2 * k
        ctx.strokeStyle = color
        for (let index = 0; index < n; index += 1) {
          const sideX = index % 2 === 0 ? -1 : 1
          const row = Math.floor(index / 2) - (Math.ceil(n / 2) - 1) / 2
          const scale = mix(1, 0.3, e)
          const [mx, my] = [x + sideX * 1.35 * r * (1 - e), y + row * 0.5 * r * (1 - e)]
          ctx.fillStyle = 'rgb(0 0 0 / 0.7)'
          ctx.fillRect(mx - 14 * k * scale, my - 20 * k * scale, 28 * k * scale, 40 * k * scale)
          ctx.strokeRect(mx - 14 * k * scale, my - 20 * k * scale, 28 * k * scale, 40 * k * scale)
        }
      }
      // La revelación y la carta que cae grande hasta su casilla.
      const since = ms - (t.hit - c.reveal)
      const f = since / 500
      if (f > 0 && f < 1) glow(ctx, x, y, 0.45 * r * mix(1, 2, out(f)), color, f < 1 / 3 ? f * 3 : (1 - f) * 1.5)
      if (since > 0 && card) {
        const big = Math.max(1, Math.min((0.42 * width) / to.w, (0.62 * height) / to.h))
        const fall = clamp((since - c.show) / (c.reveal - c.show))
        const scale =
          since < c.show
            ? 2 * big
            : since < c.show + c.fall
              ? mix(2 * big, 1.15 * big, reveal((since - c.show) / c.fall))
              : since < c.reveal
                ? mix(1.15 * big, c.squash, reveal((since - c.show - c.fall) / (c.reveal - c.show - c.fall)))
                : mix(c.squash, 1, snap(clamp((since - c.reveal) / c.settle)))
        const [px, py] = [mix(x, to.x, inOut(fall)), mix(y, to.y, inOut(fall))]
        ctx.globalAlpha = clamp(since / c.show)
        drawCard(ctx, { x: px, y: py, w: to.w * scale, h: to.h * scale, angle: to.angle }, { ...card, faceDown: false, dim: false }, assets, s)
      }
      ctx.restore()
    },
  }
}

/** En qué punto de su animación va una pieza de `playPendulum` a los `ms` de la escena: la mesa corre cada una entre `pendulumAt` de su principio y de su final. */
const paced = (ms: number, delay: number, duration: number) => (ms - pendulumAt(delay)) / (pendulumAt(delay + duration) - pendulumAt(delay))
/** `keep` de la mesa: entra en los primeros 200 ms de su línea (`EASE_OUT`) hasta `alpha` y se apaga en los últimos 200. Fuera de su animación, no se ve (`opacity-0`). */
const kept = (g: number, total: number, alpha = 1) => (g <= 0 || g >= 1 ? 0 : alpha * Math.min(out(clamp((g * total) / 200)), clamp(((1 - g) * total) / 200)))
/** El vaivén del péndulo (grados), cada uno más corto, como en la mesa. */
const SWINGS = [0, 18, -16, 12, -8, 4, 0]

/** Cómo está cada pieza de la Invocación por Péndulo de la mesa (`playPendulum`) a los `ms` de la escena, con `count` cartas: lo que dibuja `pendulumOverlay` (y lo que mide su test). */
export function pendulumFrame(ms: number, count: number) {
  const c = ENTRANCE_COMMON
  const p = PENDULUM
  const light = paced(ms, p.light, p.lightMs)
  const swing = paced(ms, p.swing, p.swingMs)
  const at = clamp(swing) * (SWINGS.length - 1)
  const segment = Math.min(SWINGS.length - 2, Math.floor(at))
  const turn = inOut(at - segment)
  return {
    veil: c.veil * Math.min(clamp(ms / c.veilIn), clamp((ENTRANCE.end - ms) / c.veilOut)),
    scales: { alpha: kept(paced(ms, p.scales, p.end - p.scales), p.end - p.scales), rise: out(clamp(paced(ms, p.scales, 400))) },
    light: { alpha: kept(light, p.lightMs, 0.85), scale: mix(0.4, 1, out(clamp(light))) },
    swing: { alpha: swing <= 0 || swing >= 1 ? 0 : segment === 0 ? turn : segment === SWINGS.length - 2 ? 1 - turn : 1, deg: mix(SWINGS[segment]!, SWINGS[segment + 1]!, turn) },
    // Cada carta: de ×1,6 a ×1,15 y a su tamaño en su golpe (`pendulumHit`), con el aplastón; `drop`, cuánto le falta bajar (1: arriba de la pantalla, 0: en su casilla).
    cards: Array.from({ length: count }, (_, index) => {
      const f = ms - (pendulumHit(index) - c.reveal)
      const scale = f < c.show ? 1.6 : f < c.show + c.fall ? mix(1.6, 1.15, reveal((f - c.show) / c.fall)) : f < c.reveal ? mix(1.15, c.squash, reveal((f - c.show - c.fall) / (c.reveal - c.show - c.fall))) : mix(c.squash, 1, snap(clamp((f - c.reveal) / c.settle)))
      return { alpha: clamp(f / c.show), drop: f < c.show ? 1 : 1 - reveal(clamp((f - c.show) / (c.reveal - c.show))), scale }
    }),
  }
}

/** Un degradé a lo largo de `(x0, y0)`–`(x1, y1)` con sus paradas `[dónde, color, alfa]` (un color `#rrggbb`; otro, entero). */
function gradient(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: ReadonlyArray<readonly [number, string, number]>) {
  const fill = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [at, color, alpha] of stops) fill.addColorStop(at, /^#[0-9a-f]{6}$/i.test(color) ? `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : alpha > 0 ? color : 'transparent')
  return fill
}

/**
 * La Invocación por Péndulo de la mesa (`playPendulum`) en el lienzo: una sola escena con todas las cartas de la Invocación (`cards`, en el orden en que llegaron), con las mismas piezas,
 * más simples: el velo, las dos escalas que suben a los costados (azul y roja) con su gema, la luz blanca entre ellas, el péndulo que oscila colgado del medio y las cartas que bajan
 * derechas hasta su casilla. Los tiempos los lee de la mesa (`pendulumFrame`). La llegada blanca de cada carta y la sacudida las pone `impactOverlays`. Las cartas de la mesa de abajo
 * (`keys`) no se pintan mientras dura: las dibuja ésta. `k`: px del lienzo por px del celular.
 */
export function pendulumOverlay(cards: ReadonlyArray<{ to: Pose; card: SceneCard | undefined }>, keys: readonly string[], assets: VideoAssets, k: number, s: number, start: number, speed: VideoSpeed): Overlay {
  const { penduloAzul: azul, penduloRojo: rojo } = assets.theme.fx
  return {
    kind: 'pendulum',
    start,
    duration: ENTRANCE.end / speed,
    hides: keys,
    draw: (ctx, p) => {
      const now = pendulumFrame(p * ENTRANCE.end, cards.length)
      const { width, height } = ctx.canvas
      const r = Math.min(width, height) * 0.36
      ctx.save()
      ctx.globalAlpha = now.veil
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      // Las dos escalas: suben desde abajo a los costados (de abajo hacia arriba, `origin-bottom`) y su gema arriba.
      const [w, h] = [0.14 * r, 0.78 * height]
      const [top, bottom] = [(height - h) / 2, (height + h) / 2]
      if (now.scales.alpha > 0)
        for (const [x, color] of [[0.1 * width, azul], [0.9 * width, rojo]] as const) {
          ctx.globalAlpha = now.scales.alpha * 0.75
          const rise = h * now.scales.rise
          ctx.fillStyle = gradient(ctx, 0, bottom, 0, top, [[0, color, 0], [0.5, color, 1], [1, color, 0]])
          ctx.fillRect(x - w / 2, bottom - rise, w, rise)
          ctx.globalAlpha = now.scales.alpha
          ctx.save()
          ctx.translate(x, top)
          ctx.rotate(Math.PI / 4)
          ctx.fillStyle = color
          ctx.fillRect(-8 * k, -8 * k, 16 * k, 16 * k)
          ctx.lineWidth = 2 * k
          ctx.strokeStyle = '#fff'
          ctx.strokeRect(-7 * k, -7 * k, 14 * k, 14 * k)
          ctx.restore()
        }
      // La luz blanca entre las escalas, de arriba hacia abajo (crece desde arriba).
      if (now.light.alpha > 0) {
        ctx.globalAlpha = now.light.alpha
        ctx.globalCompositeOperation = 'lighter'
        const [lw, lh] = [0.9 * r * now.light.scale, height * now.light.scale]
        ctx.fillStyle = gradient(ctx, 0, 0, 0, lh, [[0, '#ffffff', 0.45], [0.5, azul, 0.2], [1, azul, 0]])
        ctx.fillRect(width / 2 - lw / 2, 0, lw, lh)
        ctx.globalCompositeOperation = 'source-over'
      }
      // El péndulo, colgado arriba en el medio: oscila y se va apagando.
      if (now.swing.alpha > 0) {
        const length = 0.3 * height
        const bob = 0.11 * r
        ctx.globalAlpha = now.swing.alpha
        ctx.save()
        ctx.translate(width / 2, height / 12)
        ctx.rotate((now.swing.deg * Math.PI) / 180)
        ctx.fillStyle = 'rgb(255 255 255 / 0.85)'
        ctx.fillRect(-k, 0, 2 * k, length)
        const fill = ctx.createRadialGradient(0, length, 0, 0, length, bob)
        fill.addColorStop(0, '#ffffff')
        fill.addColorStop(0.5, azul)
        fill.addColorStop(1, rojo)
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.arc(0, length, bob, 0, Math.PI * 2)
        ctx.fill()
        ring(ctx, 0, length, bob, 2 * k, '#ffffff')
        ctx.restore()
      }
      // Las cartas: bajan derechas desde arriba de la pantalla hasta su casilla.
      now.cards.forEach(({ alpha, drop, scale }, index) => {
        const { to, card } = cards[index]!
        if (alpha <= 0 || !card) return
        ctx.globalAlpha = alpha
        drawCard(ctx, { x: to.x, y: to.y - drop * (to.y + 1.5 * to.h), w: to.w * scale, h: to.h * scale, angle: to.angle }, { ...card, faceDown: false, dim: false }, assets, s)
      })
      ctx.restore()
    },
  }
}
