import type { DuelReplay } from '../../../app/duel-replay'
import { t } from '../../../i18n'
import { fetchCardNamesByIds } from '../../../ygoprodeck'
import { playerName, replayResultText, titleOf } from '../duel-replay-text'
import { muxMp4, type Mp4Sample } from './mp4-mux'
import { drawBanner, drawFlight, drawFrame, loadVideoAssets } from './video-draw'
import { flightsOf, lifeOf, overlaysOf, replaceOverlays, titleOverlay, type Flight, type Overlay } from './video-fx'
import { movingKeys, transitionOf } from './video-motion'
import { comboArtUrls, comboScenes, resolveComboNames } from './video-combo'
import { artUrls, replayScenes, type Scene } from './video-scene'
import { bitrateFor, VIDEO_HEIGHT, VIDEO_WIDTH, videoConfig, videoSupport } from './video-support'
import { FPS, frameDurations, frameOf, type VideoSpeed, type VideoSubject } from './video-timeline'

/**
 * El video de un replay o un combo, entero en el navegador: cada cuadro se pinta en un lienzo, `VideoEncoder` (WebCodecs) lo codifica en H.264 y `mp4-mux.ts` arma el .mp4.
 * Va a cuadros constantes (`FPS`): lo que se mueve (las cartas que vuelan y lo que anima la mesa, `video-fx.ts`) se pinta cuadro a cuadro y lo quieto repite el último cuadro
 * sin volver a pintarlo. Va más rápido que el tiempo real (no se graba la pantalla) y cede el hilo cada tanto: la página no se congela, se puede cancelar y avisa cuánto
 * lleva. Se carga con `import()` cuando se pide un video: no pesa en la carga del sitio.
 */

/** Un cuadro clave cada tanto (10 s de video): para poder adelantar sin que el archivo crezca de más. */
const KEY_EVERY = 10 * FPS
/** Cuánto se trabaja de corrido antes de ceder el hilo (la página sigue respondiendo). */
const SLICE_MS = 30
/** Lo que tardan el título en irse y el cierre en aparecer. */
const TITLE_FADE_MS = 250

export interface VideoOptions {
  speed?: VideoSpeed
  signal?: AbortSignal
  /** De 0 a 1. */
  onProgress?: (done: number) => void
}

export interface VideoResult {
  blob: Blob
  durationMs: number
  frames: number
  codec: string
}

/**
 * Ceder el hilo con un mensaje: con la pestaña en segundo plano el navegador estira los temporizadores (`setTimeout`) a un segundo o más, y el video tardaría treinta veces
 * lo mismo; un mensaje no se estira. Y no `scheduler.yield`: su continuación pasa antes que lo demás, y un toque en «Cancelar» o el repintado del progreso esperarían.
 */
const pause = () =>
  new Promise<void>((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => resolve()
    channel.port2.postMessage(null)
  })

const canvasOf = () => (typeof OffscreenCanvas === 'undefined' ? Object.assign(document.createElement('canvas'), { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }) : new OffscreenCanvas(VIDEO_WIDTH, VIDEO_HEIGHT))
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const contextOf = (canvas: HTMLCanvasElement | OffscreenCanvas) => {
  const ctx = canvas.getContext('2d', { alpha: false }) as Ctx | null
  if (!ctx) throw new Error('replay-video: canvas')
  return ctx
}

/** Lo que cambia entre un duelo y un combo: las escenas, las imágenes a cargar, el título y el cierre. */
interface Plan {
  scenes: Iterable<Scene>
  arts: string[]
  intro: { title: string; subtitle: string }
  outro: { title: string; subtitle: string } | null
}

function duelPlan(replay: DuelReplay): Plan {
  const title = titleOf(replay)
  return {
    scenes: replayScenes(replay, VIDEO_WIDTH),
    arts: artUrls(replay),
    intro: { title, subtitle: replay.view === 'mine' ? t('meta.duels.withHand', { name: playerName(replay, 0) }) : t('meta.duels.public') },
    outro: replay.steps.length > 0 ? { title, subtitle: replayResultText(replay) } : null,
  }
}

/** Un combo abierto por enlace no trae los nombres de sus cartas: se piden antes (como hace la mesa); sin red, «Carta» donde falten. */
async function comboPlan(combo: Extract<VideoSubject, { kind: 'combo' }>['combo']): Promise<Plan> {
  const names = await resolveComboNames(combo, fetchCardNamesByIds)
  const plays = t('meta.duels.plays', { count: combo.actions.length })
  return {
    scenes: comboScenes(combo, names, VIDEO_WIDTH),
    arts: comboArtUrls(combo),
    intro: { title: combo.name, subtitle: combo.deckName ? `${combo.deckName} · ${plays}` : plays },
    outro: combo.actions.length > 0 ? { title: combo.name, subtitle: t('meta.duels.video.comboEnd') } : null,
  }
}

export async function makeReplayVideo(subject: VideoSubject, options: VideoOptions = {}): Promise<VideoResult> {
  const { signal, speed = 1 } = options
  const support = await videoSupport()
  if (!support.ok) throw new Error(`replay-video: ${support.reason}`)

  const plan = subject.kind === 'duel' ? duelPlan(subject.replay) : await comboPlan(subject.combo)
  signal?.throwIfAborted()
  const assets = await loadVideoAssets(plan.arts, signal)
  signal?.throwIfAborted()

  // Dónde empieza cada tramo (la mesa al empezar, cada jugada, el cierre), en ms de video.
  const durations = frameDurations(subject, speed)
  const starts = durations.reduce<number[]>((list, ms) => [...list, list.at(-1)! + ms], [0])
  const total = frameOf(starts.at(-1)!)
  const canvas = canvasOf()
  const ctx = contextOf(canvas)
  // La mesa sin lo que se anima encima (las cartas en vuelo, los efectos): se pinta cuando cambia y cada cuadro animado la copia.
  const base = canvasOf()
  const baseCtx = contextOf(base)

  const samples: Mp4Sample[] = []
  let avcC: Uint8Array | null = null
  let colorSpace: VideoColorSpaceInit | undefined
  let failure: unknown = null
  // Quien espera que el codificador se ponga al día: lo despierta un cuadro que sale de la cola o un error.
  let wake: (() => void) | null = null
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const description = metadata?.decoderConfig?.description
      if (description && !avcC) avcC = new Uint8Array(ArrayBuffer.isView(description) ? description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength) : description.slice(0))
      if (metadata?.decoderConfig?.colorSpace) colorSpace = metadata.decoderConfig.colorSpace
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      samples.push({ data, timestamp: chunk.timestamp, duration: chunk.duration ?? 0, key: chunk.type === 'key' })
    },
    error: (error) => {
      failure = error
      wake?.()
    },
  })
  encoder.configure(videoConfig(support.codec, bitrateFor(starts.at(-1)!)))

  // El último cuadro pintado: lo quieto lo repite (un `VideoFrame` de otro comparte la imagen, no la copia).
  let still: VideoFrame | null = null
  const usOf = (frame: number) => Math.round((frame * 1e6) / FPS)
  const emit = async (frame: number, fresh: boolean) => {
    const timestamp = usOf(frame)
    const init = { timestamp, duration: usOf(frame + 1) - timestamp }
    if (fresh || !still) {
      still?.close()
      still = new VideoFrame(canvas, init)
      encoder.encode(still, { keyFrame: frame % KEY_EVERY === 0 })
    } else {
      const copy = new VideoFrame(still, init)
      encoder.encode(copy, { keyFrame: frame % KEY_EVERY === 0 })
      copy.close()
    }
    // Que el codificador no se atrase de más (memoria): se espera su aviso (o el de un error), no se pregunta en vueltas.
    while (encoder.encodeQueueSize > 4 && !failure) {
      await new Promise<void>((resolve) => {
        wake = resolve
        encoder.addEventListener('dequeue', () => resolve(), { once: true })
      })
    }
  }

  try {
    let live: Overlay[] = []
    let before: Scene | null = null
    let slice = performance.now()
    const scenes = plan.scenes[Symbol.iterator]()
    let scene: Scene | null = null
    for (let index = 0; index < durations.length; index += 1) {
      // El cierre no tiene escena propia: es la última jugada, quieta, con el resultado encima.
      const next = scenes.next()
      if (!next.done) scene = next.value
      if (!scene) break
      const start = starts[index]!
      const outro = index === durations.length - 1 && index > 0
      let flights: Flight[] = []
      let life: ReturnType<typeof lifeOf> = null
      if (before && before !== scene) {
        flights = flightsOf(transitionOf(before, scene), scene.layout.scale, speed, durations[index]!)
        live = replaceOverlays(live, overlaysOf(before, scene, flights, assets, speed, start, subject.kind), start)
        life = lifeOf(before, scene, speed)
      }
      const shown = scene
      if (index === 0) live.push(titleOverlay((target, alpha) => drawBanner(target, shown, plan.intro, assets, alpha), 0, durations[0]! + TITLE_FADE_MS, TITLE_FADE_MS, false))
      if (outro && plan.outro) {
        const banner = plan.outro
        live.push(titleOverlay((target, alpha) => drawBanner(target, shown, banner, assets, alpha), start, durations[index]!, TITLE_FADE_MS, true))
      }
      const moving = flights.length > 0 ? { keys: movingKeys(flights.map((flight) => flight.motion)), before: before! } : undefined
      const landed = Math.max(0, ...flights.map((flight) => flight.delay + flight.duration))
      let drawnBase = ''
      let clean = false

      for (let frame = frameOf(start); frame < frameOf(starts[index + 1]!); frame += 1) {
        if (failure) throw failure
        signal?.throwIfAborted()
        const now = (frame * 1000) / FPS
        const ms = now - start
        const flying = ms < landed
        const lp = life?.(ms) ?? null
        const alive = live.filter((overlay) => now >= overlay.start && now < overlay.start + overlay.duration)
        // La mesa de abajo: sin las cartas en vuelo mientras vuelan, y con las vidas que cuentan.
        const key = `${flying}:${lp?.join(',') ?? ''}`
        if (key !== drawnBase) {
          drawFrame(baseCtx, scene, assets, flying ? moving : undefined, lp)
          drawnBase = key
          clean = false
        }
        const animated = flying || alive.length > 0
        if (animated || !clean) {
          ctx.drawImage(base, 0, 0)
          if (flying) for (const flight of flights) drawFlight(ctx, flight, ms, assets, scene.layout.scale)
          for (const overlay of alive) overlay.draw(ctx, (now - overlay.start) / overlay.duration)
          clean = !animated
          await emit(frame, true)
        } else await emit(frame, false)

        if (performance.now() - slice > SLICE_MS) {
          options.onProgress?.(frame / total)
          await pause()
          slice = performance.now()
        }
      }
      // Lo que ya terminó no se arrastra a la jugada siguiente.
      live = live.filter((overlay) => overlay.start + overlay.duration > starts[index + 1]!)
      before = scene
    }
    await encoder.flush()
    if (failure) throw failure
  } finally {
    ;(still as VideoFrame | null)?.close()
    if (encoder.state !== 'closed') encoder.close()
    for (const bitmap of [assets.back, ...assets.arts.values()]) bitmap?.close()
  }
  if (!avcC) throw new Error('replay-video: avcC')
  options.onProgress?.(1)

  const parts = muxMp4({ width: VIDEO_WIDTH, height: VIDEO_HEIGHT, avcC, colorSpace }, samples)
  return { blob: new Blob(parts, { type: 'video/mp4' }), durationMs: usOf(total) / 1000, frames: samples.length, codec: support.codec }
}
