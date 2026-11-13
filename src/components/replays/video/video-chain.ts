import type { ChainFeed, ChainRow, ChainStep } from '../../../app/auto/chain-feed'
import { medalsOf } from '../../../app/card-glow'
import { replayChainSteps, type DuelReplay, type ReplaySide } from '../../../app/duel-replay'
import { EASE_OUT, bezierEase, easeInOut } from '../../../app/motion'
import { t } from '../../../i18n'
import { BOND_TRIM, BURST_RAYS, CELL, CHAIN_LEAVE_MS, chainFeed, CORNER_TIES, DIGIT_STEP, LAYOUT, SAG, SHOWN, SIDE_LEFT, glyphCells, hangingLinks } from '../../auto/ChainNotice'
import { drawCard, FONT, type ChainColors, type Ctx, type VideoAssets } from './video-draw'
import { keyed, type Overlay } from './video-fx'
import { artOfId, cellsOf, fieldRect, placeRect, type Rect, type VideoLayout } from './video-scene'
import { chainTimeline, type VideoSpeed } from './video-timeline'

/**
 * La cadena en el video de un duelo, como la muestra el reproductor (`DuelReplayScreen` con `ChainStage`): mientras se arma, la escena sobre el campo (el velo que baja todo el cuadro,
 * cada carta que entra grande y cae inclinada a su lugar con su estallido, su número en bloques y sus esquinas atadas, la cadena colgando entre carta y carta y «CADENA» con dos o más);
 * al empezar a resolverse, la escena se va con un fundido. Las medidas, los lugares y las curvas salen de `ChainStage` (`LAYOUT` del celular, sus clases y sus tiempos) y de la mesa
 * (`fieldRect`); los colores, de `--color-chain-*`; el ritmo, de `chainTimeline`. Sólo se dibuja en el lienzo; sin cadena guardada no hay nada (el video sigue con la carta grande).
 */

/** Los tiempos de `ChainStage` (sus clases): la carta viaja 350 ms (`duration-350`) y la nueva espera 100 (`delay-100`); la cadena entre cartas entra 300 ms después (`delay-300`) en 200; el
 * velo, la salida y lo que se apaga, 200 (`duration-200`); «CADENA», 300 después de 100; el estallido y los destellos, `animate-fx-flash` (560); el campo baja de más `animate-chain-veil` (700). */
export const STAGE_MS = { move: 350, newest: 100, bondDelay: 300, fade: 200, wordDelay: 100, word: 300, flash: 560, dim: 700 } as const

/** Dónde queda una carta de la escena respecto de su lugar sin correr: cuánto se corre (en fracciones de su ancho y de su alto), cuánto gira (radianes), su escala y su opacidad. */
export interface StagePose {
  x: number
  y: number
  rotate: number
  scale: number
  opacity: number
}

const amount = (value: string) => (value === 'full' ? 1 : value.includes('/') ? Number(value.split('/')[0]) / Number(value.split('/')[1]) : Number(value))

/** Las clases de Tailwind de un lugar de `LAYOUT` (`-translate-x-2/5 translate-y-1/2 -rotate-8 scale-140`…) como números: la escena del video se mueve con las mismas. */
export function poseOfClasses(classes: string): StagePose {
  const pose: StagePose = { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }
  for (const token of classes.split(/\s+/)) {
    const match = /^(-?)(translate-x|translate-y|rotate|scale|opacity)-([\d/]+|full)$/.exec(token)
    if (!match) continue
    const value = (match[1] ? -1 : 1) * amount(match[3]!)
    if (match[2] === 'translate-x') pose.x = value
    else if (match[2] === 'translate-y') pose.y = value
    else if (match[2] === 'rotate') pose.rotate = (value * Math.PI) / 180
    else if (match[2] === 'scale') pose.scale = value / 100
    else pose.opacity = value / 100
  }
  return pose
}

/** De donde entra la carta nueva (`starting:` de `ChainStage`) y adonde se van las de antes del cuarto lugar (`back`). */
export const START_POSE = poseOfClasses('translate-x-0 translate-y-0 rotate-0 scale-150 opacity-0')
export const BACK_POSE = poseOfClasses('-translate-y-full scale-50 opacity-0')

const mix = (a: number, b: number, e: number) => a + (b - a) * e
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const easeOut = bezierEase(EASE_OUT)
const mixPose = (a: StagePose, b: StagePose, e: number): StagePose => ({ x: mix(a.x, b.x, e), y: mix(a.y, b.y, e), rotate: mix(a.rotate, b.rotate, e), scale: mix(a.scale, b.scale, e), opacity: mix(a.opacity, b.opacity, e) })
/** `animate-fx-flash`: crece desde la mitad, se ve entero al 28 % y se apaga agrandándose. */
const flashAt = (p: number) => ({ scale: keyed(p, [[0, 0.5], [0.28, 1.05], [1, 1.5]]), alpha: keyed(p, [[0, 0], [0.28, 1], [1, 0]]) })
/** `banner-veil`: entra, se queda y se va. */
const DIM_KEYS = [[0, 0], [0.12, 1], [0.78, 1], [1, 0]] as const

type Side = 'left' | 'right'
const narrow = (mirror: boolean) => LAYOUT.narrow[mirror ? 'right' : 'left']
/** El lugar de la carta de profundidad `depth` (0 = la última que entró) con `count` cartas en la escena: impar a la izquierda, par a la derecha, como `ChainStage`. */
export const stagePoseOf = (depth: number, count: number): StagePose => (depth >= SHOWN ? BACK_POSE : poseOfClasses(narrow(count % 2 === 0).depth[depth]!))
const sideOf = (depth: number, mirror: boolean): Side => {
  const side = SIDE_LEFT[Math.min(depth, SHOWN - 1)]!
  return mirror ? (side === 'left' ? 'right' : 'left') : side
}

/** La caja de la escena sobre el campo, como en el reproductor: del alto del campo y 3:4 (más angosta si el campo no da), centrada. */
export function stageBox(layout: VideoLayout): Rect {
  const field = fieldRect(cellsOf(layout, 5))
  const w = Math.min((field.h * 3) / 4, field.w)
  return { x: field.x + (field.w - w) / 2, y: field.y, w, h: field.h }
}

/** Un momento de la cadena en el video: lo que cuenta el reproductor (`feed`) y lo que se ve en grande (`stage`: null cuando ya terminó antes de esta jugada). */
interface Snapshot {
  t: number
  feed: ChainFeed | null
  stage: ChainFeed | null
}

export const chainSnapshots = (steps: readonly ChainStep[], starts: readonly number[], speed: VideoSpeed): Snapshot[] =>
  chainTimeline(steps, starts, speed).map(({ t, from, seen }) => {
    const feed = chainFeed(steps, seen)
    return { t, feed, stage: feed && !(feed.done && seen === from) ? feed : null }
  })

/** Ya empezó a resolverse o terminó: la escena se va (`over` de `ChainStage`). */
const overOf = (feed: ChainFeed) => feed.done || feed.current >= 0 || feed.rows.some((row) => row.state !== 'chained')

/** Una escena de la cadena de principio a fin: cuándo entra, cuándo entra cada carta (`mounts`), cuándo empieza a irse (`over`) y cuándo ya no está (`end`). */
export interface StageEpisode {
  start: number
  end: number
  mounts: number[]
  over: number | null
  rows: ChainRow[]
}

export function stageEpisodes(snapshots: readonly Snapshot[], videoEnd: number, speed: VideoSpeed): StageEpisode[] {
  const out: StageEpisode[] = []
  let open: StageEpisode | null = null
  let key = -1
  const close = (at: number) => {
    if (open) out.push({ ...open, end: Math.min(at, open.over === null ? at : open.over + CHAIN_LEAVE_MS / speed) })
    open = null
  }
  for (const { t, stage } of snapshots) {
    if (open && (!stage || stage.key !== key)) close(t)
    if (!stage) continue
    const episode: StageEpisode = open ?? { start: t, end: videoEnd, mounts: [], over: null, rows: [] }
    open = episode
    key = stage.key
    while (episode.mounts.length < stage.rows.length) episode.mounts.push(t)
    episode.rows = stage.rows
    if (episode.over === null && overOf(stage)) episode.over = t
  }
  close(videoEnd)
  return out.filter((episode) => episode.end > episode.start)
}

const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Los eslabones de metal de `ChainStage` (`Links`): uno de frente (un aro) y uno de canto (una barra), con su sombra, su cuerpo y su brillo; en las unidades de quien los llama. */
function drawLinks(ctx: Ctx, links: ReadonlyArray<{ x: number; y: number; angle: number }>, colors: ChainColors, size = 1, offset = 0) {
  const w = 16 * size
  const h = 9 * size
  const s = size
  links.forEach(({ x, y, angle }, i) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((angle * Math.PI) / 180)
    if ((i + offset) % 2 === 0) {
      ctx.lineWidth = 4.4 * s
      ctx.strokeStyle = colors.metalLo
      roundRect(ctx, -w / 2, -h / 2 + 0.8 * s, w, h, h / 2)
      ctx.stroke()
      ctx.lineWidth = 3 * s
      ctx.strokeStyle = colors.metal
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2)
      ctx.stroke()
      ctx.fillStyle = colors.metalHi
      roundRect(ctx, -w / 2 + 2.2 * s, -h / 2 - 0.9 * s, w - 4.4 * s, 1.4 * s, 0.7 * s)
      ctx.fill()
    } else {
      ctx.fillStyle = colors.metalLo
      roundRect(ctx, -w / 2, -2.6 * s, w, 6 * s, 2.6 * s)
      ctx.fill()
      ctx.fillStyle = colors.metal
      roundRect(ctx, -w / 2 + 0.8 * s, -2.6 * s, w - 1.6 * s, 4.2 * s, 2.1 * s)
      ctx.fill()
      ctx.fillStyle = colors.metalHi
      roundRect(ctx, -w / 2 + 2.4 * s, -2.2 * s, w - 4.8 * s, 1.2 * s, 0.6 * s)
      ctx.fill()
    }
    ctx.restore()
  })
}

/** Una capa con su opacidad (multiplicada por la de afuera). */
function faded(ctx: Ctx, alpha: number, paint: () => void) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha *= alpha
  paint()
  ctx.restore()
}

/** Lo que crece desde su centro (`cx`, `cy`) con `animate-fx-flash`, `p` de 0 a 1. */
function flashing(ctx: Ctx, p: number, cx: number, cy: number, paint: () => void) {
  const { scale, alpha } = flashAt(p)
  faded(ctx, alpha, () => {
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    ctx.translate(-cx, -cy)
    paint()
  })
}

/** El número del eslabón en bloques (`ChainNumber`), en su caja de `height` de alto con la esquina de arriba a la izquierda en `x`, `y`: el halo, el contorno celeste y el blanco; o la copia amarilla del destello. */
function drawNumber(ctx: Ctx, value: number, x: number, y: number, height: number, colors: ChainColors, flash: boolean) {
  const k = height / (5 * CELL + 24)
  ctx.save()
  ctx.translate(x + 12 * k, y + 12 * k)
  ctx.scale(k, k)
  ctx.beginPath()
  for (const cell of glyphCells(value)) ctx.rect(cell.x, cell.y, CELL, CELL)
  ctx.lineJoin = 'miter'
  const layer = (width: number, fill: string, fillAlpha: number, stroke: string, strokeAlpha: number) => {
    faded(ctx, fillAlpha, () => {
      ctx.fillStyle = fill
      ctx.fill()
    })
    if (width > 0)
      faded(ctx, strokeAlpha, () => {
        ctx.lineWidth = width
        ctx.strokeStyle = stroke
        ctx.stroke()
      })
  }
  if (flash) layer(16, colors.flash, 1, colors.flash, 0.6)
  else {
    layer(18, colors.glow, 0.3, colors.glow, 0.25)
    layer(8, colors.glow, 1, colors.glow, 1)
    layer(0, '#fff', 1, '', 0)
  }
  ctx.restore()
}

interface StageGeometry {
  box: Rect
  /** La carta sin correr: su centro y su tamaño (un tercio del ancho de la escena, `left-1/3 top-2/7 w-1/3`). */
  card: { cx: number; cy: number; w: number; h: number }
  /** El `viewBox` de 300 × 400 de la cadena sobre la caja (`meet`). */
  svg: { x: number; y: number; k: number }
  /** px del lienzo por px del celular (`layout.unit`) y la escala del lienzo. */
  unit: number
  scale: number
  width: number
  height: number
}

export function stageGeometry(layout: VideoLayout): StageGeometry {
  const box = stageBox(layout)
  const w = box.w / 3
  const h = (w * 614) / 421
  const k = Math.min(box.w / 300, box.h / 400)
  return {
    box,
    card: { cx: box.x + box.w / 3 + w / 2, cy: box.y + (box.h * 2) / 7 + h / 2, w, h },
    svg: { x: box.x + (box.w - 300 * k) / 2, y: box.y + (box.h - 400 * k) / 2, k },
    unit: layout.unit,
    scale: layout.scale,
    width: Math.round(720 * layout.scale),
    height: Math.round(1280 * layout.scale),
  }
}

/** Cómo se ve la carta de un eslabón: su arte (el mismo que carga el video) y su nombre. */
export type RowLook = (row: ChainRow) => { art: string | null; name: string }

/** Una carta de la escena en su pose: el estallido detrás (la nueva), el halo blanco, la carta, el destello amarillo (la nueva), las esquinas atadas y el número en la esquina de afuera. */
function drawStageCard(ctx: Ctx, row: ChainRow, pose: StagePose, geo: StageGeometry, side: Side, born: number | null, assets: VideoAssets, look: RowLook) {
  const { w, h } = geo.card
  const u = geo.unit
  const colors = assets.theme.chain
  const face = look(row)
  faded(ctx, pose.opacity, () => {
    ctx.translate(geo.card.cx + pose.x * w, geo.card.cy + pose.y * h)
    ctx.rotate(pose.rotate)
    ctx.scale(pose.scale, pose.scale)
    // El estallido de rayos dorados, detrás (`Burst`: el doble de la carta, estirado).
    if (born !== null && born < 1)
      flashing(ctx, born, 0, 0, () => {
        ctx.save()
        ctx.scale(w / 100, h / 100)
        faded(ctx, 0.7, () => {
          ctx.fillStyle = colors.burst
          for (const { angle, reach } of BURST_RAYS) {
            ctx.save()
            ctx.rotate((angle * Math.PI) / 180)
            ctx.beginPath()
            ctx.moveTo(-5, 0)
            ctx.lineTo(5, 0)
            ctx.lineTo(0, -reach)
            ctx.fill()
            ctx.restore()
          }
        })
        faded(ctx, 0.5, () => {
          ctx.fillStyle = colors.flash
          ctx.beginPath()
          ctx.arc(0, 0, 34, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.restore()
      })
    // El halo blanco (`shadow-chain-halo`): dos resplandores y la línea de 2 px. El desenfoque del lienzo no escala con la carta: va por la escala.
    for (const [blur, alpha] of [[32, 0.18], [14, 0.6]] as const) {
      ctx.save()
      ctx.shadowColor = `rgb(255 255 255 / ${alpha})`
      ctx.shadowBlur = blur * u * pose.scale
      ctx.fillStyle = assets.theme.raised
      ctx.fillRect(-w / 2, -h / 2, w, h)
      ctx.restore()
    }
    drawCard(ctx, { x: 0, y: 0, w, h, angle: 0 }, { id: String(row.number), art: face.art, name: face.name, faceDown: false, sideways: false, upsideDown: false, counters: 0, materials: 0 }, assets, geo.scale)
    faded(ctx, 0.9, () => {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2 * u
      ctx.strokeRect(-w / 2 - u, -h / 2 - u, w + 2 * u, h + 2 * u)
    })
    // El destello amarillo alrededor (`-inset-2 border-4`).
    if (born !== null && born < 1)
      flashing(ctx, born, 0, 0, () => {
        ctx.strokeStyle = colors.flash
        ctx.lineWidth = 4 * u
        ctx.strokeRect(-w / 2 - 6 * u, -h / 2 - 6 * u, w + 12 * u, h + 12 * u)
      })
    // Las esquinas atadas con cadena (en el `viewBox` de la carta, 100 × 146).
    ctx.save()
    ctx.translate(-w / 2, -h / 2)
    ctx.scale(w / 100, h / 146)
    for (const [from, to] of CORNER_TIES) drawLinks(ctx, hangingLinks(from, to, 2, 7.5), colors, 0.7)
    ctx.restore()
    // El número: la mitad del alto de la carta, pisando la esquina de abajo del lado de afuera (corrido un tercio de su tamaño).
    const nh = h / 2
    const nw = (nh * (DIGIT_STEP * String(row.number).length + 14)) / (5 * CELL + 24)
    const nx = side === 'left' ? -w / 2 - nw / 3 : w / 2 + nw / 3 - nw
    const ny = h / 2 - nh + nh / 3
    drawNumber(ctx, row.number, nx, ny, nh, colors, false)
    if (born !== null && born < 1) flashing(ctx, born, nx + nw / 2, ny + nh / 2, () => drawNumber(ctx, row.number, nx, ny, nh, colors, true))
  })
}

interface Bond {
  from: readonly [number, number]
  to: readonly [number, number]
  fromAt: number
  toAt: number
}

/** La cadena entre cada carta y la anterior, mientras las dos están a la vista (los cuatro primeros lugares), con `count` cartas en la escena. */
const bondsOf = (count: number): Bond[] => {
  const { bond } = narrow(count % 2 === 0)
  return Array.from({ length: Math.max(0, count - 1) }, (_, i) => i + 1)
    .filter((index) => count - index < SHOWN)
    .map((index) => ({ from: bond[count - index]!, to: bond[count - 1 - index]!, fromAt: count - index, toAt: count - 1 - index }))
}

/** Un tramo de cadena colgando (`Bond`): recortado donde pisa cada carta y, roto (`broken`, 0 a 1), las dos mitades se separan y se apagan. */
function drawBond(ctx: Ctx, bond: Bond, colors: ChainColors, broken: number) {
  const length = Math.hypot(bond.to[0] - bond.from[0], bond.to[1] - bond.from[1]) || 1
  const [ux, uy] = [(bond.to[0] - bond.from[0]) / length, (bond.to[1] - bond.from[1]) / length]
  const start = [bond.from[0] + ux * BOND_TRIM[bond.fromAt]!, bond.from[1] + uy * BOND_TRIM[bond.fromAt]!] as const
  const end = [bond.to[0] - ux * BOND_TRIM[bond.toAt]!, bond.to[1] - uy * BOND_TRIM[bond.toAt]!] as const
  const links = hangingLinks(start, end, SAG)
  const half = Math.ceil(links.length / 2)
  ;[links.slice(0, half), links.slice(half)].forEach((piece, i) =>
    faded(ctx, 1 - broken, () => {
      ctx.translate((i === 0 ? -12 : 12) * broken, 8 * broken)
      drawLinks(ctx, piece, colors, 1, i === 0 ? 0 : half)
    }),
  )
}

/** La escena en el momento `now` (ms de video). */
export function drawStage(ctx: Ctx, episode: StageEpisode, now: number, geo: StageGeometry, assets: VideoAssets, speed: VideoSpeed, look: RowLook) {
  const ms = (value: number) => value / speed
  const colors = assets.theme.chain
  const count = episode.mounts.filter((mount) => mount <= now).length
  if (count === 0) return
  const changed = episode.mounts[count - 1]!
  const hidden = episode.over !== null && now >= episode.over
  const leave = episode.over === null ? 0 : easeOut(clamp((now - episode.over) / ms(CHAIN_LEAVE_MS)))
  const u = geo.unit

  // El velo sobre todo el cuadro (entra y se va con un fundido) y, mientras entra un eslabón, el campo baja de más.
  faded(ctx, 0.65 * easeOut(clamp((now - episode.start) / ms(STAGE_MS.fade))) * (1 - leave), () => {
    ctx.fillStyle = colors.veil
    ctx.fillRect(0, 0, geo.width, geo.height)
  })
  const dim = (now - changed) / ms(STAGE_MS.dim)
  if (!hidden && dim < 1)
    faded(ctx, 0.45 * keyed(dim, DIM_KEYS), () => {
      ctx.fillStyle = colors.veil
      ctx.fillRect(0, 0, geo.width, geo.height)
    })

  faded(ctx, 1 - leave, () => {
    // Las cartas, de la primera a la última (la nueva, adelante): cada una viaja de su lugar de antes al de ahora; la nueva entra grande y derecha desde el centro.
    const mirror = count % 2 === 0
    for (let index = 0; index < count; index += 1) {
      const depth = count - 1 - index
      const newest = index === count - 1
      const to = stagePoseOf(depth, count)
      const pose = newest ? mixPose(START_POSE, to, easeInOut(clamp((now - episode.mounts[index]! - ms(STAGE_MS.newest)) / ms(STAGE_MS.move)))) : mixPose(stagePoseOf(depth - 1, count - 1), to, easeInOut(clamp((now - changed) / ms(STAGE_MS.move))))
      const born = newest && !hidden ? (now - episode.mounts[index]!) / ms(STAGE_MS.flash) : null
      if (pose.opacity > 0) drawStageCard(ctx, episode.rows[index]!, pose, geo, sideOf(depth, mirror), born, assets, look)
    }

    // La cadena entre carta y carta, por delante: la de ahora entra cuando las cartas llegaron, la de los lugares de antes se apaga y, al resolverse, se corta en el medio.
    ctx.save()
    ctx.translate(geo.svg.x, geo.svg.y)
    ctx.scale(geo.svg.k, geo.svg.k)
    const broken = hidden ? easeOut(clamp((now - episode.over!) / ms(STAGE_MS.fade))) : 0
    const appear = easeOut(clamp((now - changed - ms(STAGE_MS.bondDelay)) / ms(STAGE_MS.fade)))
    for (const bond of bondsOf(count)) faded(ctx, appear, () => drawBond(ctx, bond, colors, broken))
    const fading = (now - changed) / ms(STAGE_MS.fade)
    if (fading < 1) for (const bond of bondsOf(count - 1)) faded(ctx, 1 - easeOut(fading), () => drawBond(ctx, bond, colors, broken))
    ctx.restore()

    // «CADENA», con dos o más: al medio, por delante; aparece cuando la carta se asienta.
    if (count > 1) {
      const e = easeOut(clamp((now - changed - ms(STAGE_MS.wordDelay)) / ms(STAGE_MS.word)))
      const x = geo.box.x + geo.box.w / 2
      const y = geo.box.y + geo.box.h * 0.4 + 15 * u
      faded(ctx, e, () => {
        ctx.translate(x, y)
        ctx.scale(mix(0.75, 1, e), mix(0.75, 1, e))
        ctx.font = `italic 800 ${24 * u}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = colors.glow
        ctx.shadowBlur = 8 * u
        ctx.shadowOffsetY = 2 * u
        ctx.fillStyle = '#fff'
        ctx.fillText(t('auto.chain.title').toUpperCase(), 0, 0)
      })
    }
  })
}

/** El arte y el nombre de la carta de un eslabón en el replay (por su passcode: el video ya cargó su arte, `artUrls`). */
export const replayRowLook = (replay: DuelReplay): RowLook => (row) => ({ art: row.code ? artOfId(`card-${row.code}-1`) : null, name: replay.cards[String(row.code)] ?? t('practice.card.unknown') })

/**
 * Los medallones de `ChainBadge`: de 36 px (`size-9`) en el viewBox de 40, corridos 24 px si hay varios en un lugar (`MEDAL_STEP_PX`); entran creciendo desde 0,75, se van creciendo
 * hasta 1,25 mientras se apagan y se reacomodan, todo en 200 ms (`duration-200`); el que se resuelve late (`animate-pulse`: 2 s, a la mitad de opacidad).
 */
export const MEDAL = { size: 36, step: 24, fade: 200, pulse: 2000 } as const

/** Un medallón de principio a fin: dónde va (lado y lugar de `medalPlaceOf`), cuándo entra y se va, cuándo cambia de lugar entre los de su casilla y cuándo empieza o deja de latir. */
export interface MedalTrack {
  side: ReplaySide
  place: string
  number: number
  enter: number
  leave: number | null
  /** Su corrimiento (px del celular) desde cada momento. */
  xs: Array<{ t: number; x: number }>
  resolving: Array<{ t: number; on: boolean }>
  voided: Array<{ t: number; on: boolean }>
}

/** Los medallones de toda la cadena del video (`medalsOf` en cada momento): abajo los de quien grabó, arriba los del rival. */
export function medalTracks(snapshots: readonly Snapshot[]): MedalTrack[] {
  const open = new Map<string, MedalTrack>()
  const all: MedalTrack[] = []
  const flip = (list: Array<{ t: number; on: boolean }>, t: number, on: boolean) => {
    if ((list.at(-1)?.on ?? false) !== on) list.push({ t, on })
  }
  for (const { t, feed } of snapshots) {
    const medals = medalsOf(feed)
    const seen = new Set<string>()
    for (const [owner, side] of [['mine', 0], ['theirs', 1]] as const) {
      for (const [place, list] of medals[owner]) {
        list.forEach((medal, index) => {
          const key = `${side}|${place}|${medal.number}`
          const x = (index - (list.length - 1) / 2) * MEDAL.step
          let track = open.get(key)
          if (!track) {
            track = { side, place, number: medal.number, enter: t, leave: null, xs: [{ t, x }], resolving: [], voided: [] }
            open.set(key, track)
            all.push(track)
          }
          if (track.xs.at(-1)!.x !== x) track.xs.push({ t, x })
          flip(track.resolving, t, medal.resolving)
          flip(track.voided, t, medal.voided)
          seen.add(key)
        })
      }
    }
    for (const [key, track] of open) {
      if (seen.has(key)) continue
      track.leave = t
      open.delete(key)
    }
  }
  return all
}

const onAt = (list: ReadonlyArray<{ t: number; on: boolean }>, now: number) => list.filter((item) => item.t <= now).at(-1)
/** `pulse` de Tailwind con la palabra `ease-in-out` de CSS (simétrica): de lleno a la mitad y de vuelta. */
const cssEaseInOut = bezierEase('cubic-bezier(0.42, 0, 0.58, 1)')
const pulseAt = (p: number) => keyed(p - Math.floor(p), [[0, 1], [0.5, 0.5], [1, 1]], cssEaseInOut)

/** Un medallón en el momento `now`: el aro de cadena sobre el fondo, su número blanco con luz celeste y, negado, tachado en rojo. */
export function drawMedal(ctx: Ctx, track: MedalTrack, now: number, layout: VideoLayout, assets: VideoAssets, speed: VideoSpeed) {
  const rect = placeRect(layout, track.side, track.place)
  const fade = MEDAL.fade / speed
  const out = track.leave === null ? 0 : clamp((now - track.leave) / fade)
  if (!rect || now < track.enter || out >= 1) return
  const entered = easeOut(clamp(((track.leave !== null && out > 0 ? track.leave : now) - track.enter) / fade))
  const leaving = easeOut(out)
  const scale = mix(mix(0.75, 1, entered), 1.25, leaving)
  const alpha = mix(entered, 0, leaving)
  // Se reacomoda entre los de su casilla (un `translate` de 200 ms); el que se va, desde donde estaba.
  const at = track.xs.filter((item) => item.t <= now).length - 1
  const x = at > 0 ? mix(track.xs[at - 1]!.x, track.xs[at]!.x, easeOut(clamp((now - track.xs[at]!.t) / fade))) : track.xs[0]!.x
  const since = out > 0 ? undefined : onAt(track.resolving, now)
  const beat = since?.on ? pulseAt((now - since.t) / (MEDAL.pulse / speed)) : 1
  const k = (MEDAL.size * layout.unit) / 40
  const colors = assets.theme.chain
  faded(ctx, alpha * beat, () => {
    ctx.translate(rect.x + rect.w / 2 + x * layout.unit, rect.y + rect.h / 2)
    ctx.scale(scale * k, scale * k)
    ctx.translate(-20, -20)
    ctx.fillStyle = assets.theme.background
    ctx.beginPath()
    ctx.arc(20, 20, 18, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < 12; i += 1) {
      ctx.save()
      ctx.translate(20, 20)
      ctx.rotate((i * Math.PI) / 6)
      ctx.translate(-20, -20)
      if (i % 2 === 0) {
        ctx.lineWidth = 2.4
        ctx.strokeStyle = colors.metal
        roundRect(ctx, 16.5, 0.5, 7, 4.5, 2.25)
        ctx.stroke()
      } else {
        ctx.fillStyle = colors.metalLo
        roundRect(ctx, 16.5, 1.25, 7, 3, 1.5)
        ctx.fill()
      }
      ctx.restore()
    }
    if (onAt(track.voided, now)?.on) {
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'
      ctx.strokeStyle = assets.theme.danger
      ctx.beginPath()
      ctx.moveTo(9, 31)
      ctx.lineTo(31, 9)
      ctx.stroke()
    }
    // El número: `text-lead` (19 px de un medallón de 36), blanco con la luz celeste de `text-shadow-md`.
    ctx.font = `800 ${(19 * 40) / MEDAL.size}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = colors.glow
    ctx.shadowBlur = 4 * layout.unit * scale
    ctx.fillStyle = '#fff'
    ctx.fillText(String(track.number), 20, 21)
  })
}

/** Los tramos en que hay algún medallón a la vista (de que entra el primero a que termina de irse el último): una capa por tramo. */
function medalRuns(tracks: readonly MedalTrack[], videoEnd: number, speed: VideoSpeed): Array<{ start: number; end: number }> {
  const spans = tracks.map((track) => ({ start: track.enter, end: track.leave === null ? videoEnd : Math.min(videoEnd, track.leave + MEDAL.fade / speed) })).sort((a, b) => a.start - b.start)
  return spans.reduce<Array<{ start: number; end: number }>>((runs, span) => {
    const last = runs.at(-1)
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end)
    else runs.push({ ...span })
    return runs
  }, [])
}

/** Lo que la cadena dibuja en el video de un duelo (`starts`: dónde empieza cada tramo): una capa por cada escena y otra por cada tramo con medallones. Sin cadena guardada, nada. */
export function chainOverlays(replay: DuelReplay, starts: readonly number[], speed: VideoSpeed, layout: VideoLayout, assets: VideoAssets): Overlay[] {
  const steps = replayChainSteps(replay, 0)
  if (steps.length === 0) return []
  const snapshots = chainSnapshots(steps, starts, speed)
  const geo = stageGeometry(layout)
  const look = replayRowLook(replay)
  const videoEnd = starts.at(-1)!
  const tracks = medalTracks(snapshots)
  const span = (start: number, end: number, kind: Overlay['kind'], paint: (ctx: Ctx, now: number) => void): Overlay => ({ kind, start, duration: end - start, draw: (ctx, p) => paint(ctx, start + p * (end - start)) })
  return [
    ...medalRuns(tracks, videoEnd, speed).map(({ start, end }) => span(start, end, 'medal', (ctx, now) => tracks.forEach((track) => drawMedal(ctx, track, now, layout, assets, speed)))),
    ...stageEpisodes(snapshots, videoEnd, speed).map((episode) => span(episode.start, episode.end, 'chain', (ctx, now) => drawStage(ctx, episode, now, geo, assets, speed, look))),
  ]
}
