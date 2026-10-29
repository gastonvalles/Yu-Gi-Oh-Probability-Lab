import type { DuelReplay } from '../../../app/duel-replay'
import { t } from '../../../i18n'
import { playerName, replayResultText, titleOf } from '../duel-replay-text'
import { muxMp4, type Mp4Sample } from './mp4-mux'
import { drawFrame, loadVideoAssets } from './video-draw'
import { artUrls, replayScenes, VIDEO_HEIGHT_OF } from './video-scene'
import { frameDurations } from './video-timeline'

/**
 * El video de un replay, entero en el navegador: cada escena se pinta en un lienzo, `VideoEncoder` (WebCodecs) la codifica en H.264 y `mp4-mux.ts` arma el .mp4. Va más
 * rápido que el tiempo real (no se graba la pantalla) y cede el hilo cada tanto: la página no se congela, se puede cancelar y avisa cuánto lleva. Se carga con `import()`
 * cuando se pide un video: no pesa en la carga del sitio.
 */

/** Los perfiles que se prueban, del mejor al más compatible: High, Main y Baseline (nivel 4.0, que alcanza para 1080×1920; 3.1 para 720×1280 en lo más viejo). */
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42001f'] as const

export type VideoSupport = { ok: true; codec: string } | { ok: false; reason: 'webcodecs' | 'h264' }

/** Lo de WebCodecs que hace falta (en las pruebas, uno falso). */
interface WebCodecsApi {
  VideoEncoder?: { isConfigSupported: (config: VideoEncoderConfig) => Promise<VideoEncoderSupport> }
  VideoFrame?: unknown
}

/**
 * Cuadros de duración variable con la cuenta de 30 por segundo: el codificador reparte `bitrate` como si fueran 30 por segundo (unos 4 KB por cuadro), y como hay uno por
 * jugada el video sale a unos 64 kbit/s (medido en Edge y Chrome de escritorio, con el codificador de hardware y el de software: 5 minutos, unos 2,4 MB). Con la cuenta
 * real (uno por segundo) cada cuadro se llevaba 30 veces más y el video pesaba 6 veces más sin verse mejor.
 */
const FRAMERATE = 30
const BITRATE = 1_000_000

const configOf = (codec: string, width: number, height: number): VideoEncoderConfig => ({
  codec,
  width,
  height,
  bitrate: BITRATE,
  framerate: FRAMERATE,
  bitrateMode: 'variable',
  latencyMode: 'quality',
  avc: { format: 'avc' },
})

/** Si este navegador puede hacer el video, y con qué perfil; si no, por qué (para decirlo en una línea al lado del botón). */
export async function videoSupport(width: number, api: WebCodecsApi = globalThis): Promise<VideoSupport> {
  const encoder = api.VideoEncoder
  if (!encoder || !api.VideoFrame) return { ok: false, reason: 'webcodecs' }
  for (const codec of CODECS) {
    try {
      const { supported } = await encoder.isConfigSupported(configOf(codec, width, VIDEO_HEIGHT_OF(width)))
      if (supported) return { ok: true, codec }
    } catch {
      // Un perfil que el navegador no entiende: se prueba el siguiente.
    }
  }
  return { ok: false, reason: 'h264' }
}

/** Un cuadro clave cada tanto (en tiempo de video): para poder adelantar sin que el archivo crezca de más. */
const KEY_EVERY_US = 10_000_000
/** Cuánto se trabaja de corrido antes de ceder el hilo (la página sigue respondiendo). */
const SLICE_MS = 30

export interface VideoOptions {
  width?: number
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

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export async function makeReplayVideo(replay: DuelReplay, options: VideoOptions = {}): Promise<VideoResult> {
  const width = options.width ?? 720
  const height = VIDEO_HEIGHT_OF(width)
  const { signal } = options
  const support = await videoSupport(width)
  if (!support.ok) throw new Error(`replay-video: ${support.reason}`)

  const assets = await loadVideoAssets(artUrls(replay), signal)
  signal?.throwIfAborted()

  const durations = frameDurations(replay)
  const totalMs = durations.reduce((sum, ms) => sum + ms, 0)
  const canvas = typeof OffscreenCanvas === 'undefined' ? Object.assign(document.createElement('canvas'), { width, height }) : new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('replay-video: canvas')

  const samples: Mp4Sample[] = []
  let avcC: Uint8Array | null = null
  let colorSpace: VideoColorSpaceInit | undefined
  let failure: unknown = null
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
    },
  })
  encoder.configure(configOf(support.codec, width, height))

  const title = titleOf(replay)
  const view = replay.view === 'mine' ? t('meta.duels.withHand', { name: playerName(replay, 0) }) : t('meta.duels.public')
  let at = 0
  let lastKey = -Infinity
  let index = 0
  let slice = performance.now()

  try {
    for (const scene of replayScenes(replay, width)) {
      if (failure) throw failure
      signal?.throwIfAborted()
      const ms = durations[index]!
      if (index === 0) scene.banner = { title, subtitle: view }
      if (index === durations.length - 1 && replay.steps.length > 0) scene.banner = { title, subtitle: replayResultText(replay) }
      drawFrame(ctx, scene, assets)

      const frame = new VideoFrame(canvas, { timestamp: at * 1000, duration: ms * 1000 })
      const key = at * 1000 - lastKey >= KEY_EVERY_US
      if (key) lastKey = at * 1000
      encoder.encode(frame, { keyFrame: key })
      frame.close()
      at += ms
      index += 1

      // Que el codificador no se atrase de más (memoria) y que la página respire.
      while (encoder.encodeQueueSize > 4) await new Promise((resolve) => encoder.addEventListener('dequeue', resolve, { once: true }))
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

  const parts = muxMp4({ width, height, avcC, colorSpace }, samples)
  return { blob: new Blob(parts, { type: 'video/mp4' }), durationMs: totalMs, frames: samples.length, codec: support.codec }
}
