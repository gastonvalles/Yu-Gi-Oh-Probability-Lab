import type { DuelReplay } from '../../../app/duel-replay'
import { t } from '../../../i18n'
import { playerName, replayResultText, titleOf } from '../duel-replay-text'
import { muxMp4, type Mp4Sample } from './mp4-mux'
import { drawFrame, drawMotions, loadVideoAssets } from './video-draw'
import { movingKeys, transitionOf } from './video-motion'
import { artUrls, replayScenes, type Scene } from './video-scene'
import { VIDEO_HEIGHT, VIDEO_WIDTH, videoConfig, videoSupport } from './video-support'
import { FRAME_US, frameDurations, moveFrames, type VideoSpeed } from './video-timeline'

/**
 * El video de un replay, entero en el navegador: cada escena se pinta en un lienzo, `VideoEncoder` (WebCodecs) la codifica en H.264 y `mp4-mux.ts` arma el .mp4. Va más
 * rápido que el tiempo real (no se graba la pantalla) y cede el hilo cada tanto: la página no se congela, se puede cancelar y avisa cuánto lleva. Se carga con `import()`
 * cuando se pide un video: no pesa en la carga del sitio.
 */

/** Un cuadro clave cada tanto (en tiempo de video): para poder adelantar sin que el archivo crezca de más. */
const KEY_EVERY_US = 10_000_000
/** Cuánto se trabaja de corrido antes de ceder el hilo (la página sigue respondiendo). */
const SLICE_MS = 30

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

export async function makeReplayVideo(replay: DuelReplay, options: VideoOptions = {}): Promise<VideoResult> {
  const { signal, speed = 1 } = options
  const support = await videoSupport()
  if (!support.ok) throw new Error(`replay-video: ${support.reason}`)

  const assets = await loadVideoAssets(artUrls(replay), signal)
  signal?.throwIfAborted()

  const durations = frameDurations(replay, speed)
  const canvas = canvasOf()
  const ctx = contextOf(canvas)
  // El fondo de una transición (todo menos las cartas en vuelo): se pinta una vez y cada cuadro lo copia.
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
  encoder.configure(videoConfig(support.codec))

  const title = titleOf(replay)
  const view = replay.view === 'mine' ? t('meta.duels.withHand', { name: playerName(replay, 0) }) : t('meta.duels.public')
  let at = 0
  let lastKey = -Infinity
  let slice = performance.now()
  const emit = async (us: number) => {
    const frame = new VideoFrame(canvas, { timestamp: at, duration: us })
    const key = at - lastKey >= KEY_EVERY_US
    if (key) lastKey = at
    encoder.encode(frame, { keyFrame: key })
    frame.close()
    at += us
    // Que el codificador no se atrase de más (memoria): se espera su aviso (o el de un error), no se pregunta en vueltas.
    while (encoder.encodeQueueSize > 4 && !failure) {
      await new Promise<void>((resolve) => {
        wake = resolve
        encoder.addEventListener('dequeue', () => resolve(), { once: true })
      })
    }
  }

  try {
    let index = 0
    let before: Scene | null = null
    for (const scene of replayScenes(replay, VIDEO_WIDTH)) {
      if (failure) throw failure
      signal?.throwIfAborted()
      let rest = durations[index]! * 1000
      const motions = before ? transitionOf(before, scene) : []
      if (before && motions.length > 0) {
        drawFrame(baseCtx, scene, assets, { keys: movingKeys(motions), before })
        const frames = moveFrames(speed)
        for (let frame = 0; frame < frames; frame += 1) {
          ctx.drawImage(base, 0, 0)
          drawMotions(ctx, motions, frame / frames, assets, scene.layout.scale)
          await emit(FRAME_US)
        }
        rest = Math.max(FRAME_US, rest - frames * FRAME_US)
      }
      if (index === 0) scene.banner = { title, subtitle: view }
      if (index === durations.length - 1 && replay.steps.length > 0) scene.banner = { title, subtitle: replayResultText(replay) }
      drawFrame(ctx, scene, assets)
      await emit(rest)
      before = scene
      index += 1

      if (performance.now() - slice > SLICE_MS) {
        options.onProgress?.(index / durations.length)
        await pause()
        slice = performance.now()
      }
    }
    await encoder.flush()
    if (failure) throw failure
  } finally {
    if (encoder.state !== 'closed') encoder.close()
    for (const bitmap of [assets.back, ...assets.arts.values()]) bitmap?.close()
  }
  if (!avcC) throw new Error('replay-video: avcC')
  options.onProgress?.(1)

  const parts = muxMp4({ width: VIDEO_WIDTH, height: VIDEO_HEIGHT, avcC, colorSpace }, samples)
  return { blob: new Blob(parts, { type: 'video/mp4' }), durationMs: at / 1000, frames: samples.length, codec: support.codec }
}
