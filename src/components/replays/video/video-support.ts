/**
 * Si este navegador puede armar el video de un replay (WebCodecs con H.264) y la configuración del codificador. Liviano a propósito: el diálogo lo importa para habilitar el
 * botón; lo que dibuja y codifica (`video-encode.ts`) se carga con `import()` recién al pedir un video.
 */

/** El video es vertical (9:16), del tamaño de un celular: 720×1280. */
export const VIDEO_WIDTH = 720
export const VIDEO_HEIGHT = 1280

/** Los perfiles que se prueban, del mejor al más compatible: High, Main y Baseline (nivel 4.0; 3.1 para lo más viejo, que alcanza para 720×1280). */
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42001f'] as const

export type VideoSupport = { ok: true; codec: string } | { ok: false; reason: 'webcodecs' | 'h264' }

/** Lo de WebCodecs que hace falta (en las pruebas, uno falso). */
export interface WebCodecsApi {
  VideoEncoder?: { isConfigSupported: (config: VideoEncoderConfig) => Promise<VideoEncoderSupport> }
  VideoFrame?: unknown
}

/**
 * A cuadros constantes el codificador gasta lo que se le da (medido en Edge: 1 Mbit/s eran 1 MB cada 8 s), así que se le da según lo largo: lo justo para que un video de hasta
 * 1 minuto (un combo) vaya a 600 kbit/s y lo que se mueve salga nítido, y que uno de hasta unos 4 minutos no pase de ~4,5 MB; más largo, 150 kbit/s (un duelo de 7 minutos, 7,5 MB:
 * lo quieto casi no pesa y lo que se mueve sale algo más blando).
 */
const MAX_BITRATE = 600_000
const MIN_BITRATE = 150_000
const BUDGET_BITS = 36_000_000
export const bitrateFor = (durationMs: number) => Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, BUDGET_BITS / Math.max(1, durationMs / 1000))))

/** H.264 a cuadros constantes (`FPS` de `video-timeline.ts`, 30). */
export const videoConfig = (codec: string, bitrate = MIN_BITRATE): VideoEncoderConfig => ({
  codec,
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  bitrate,
  framerate: 30,
  bitrateMode: 'variable',
  latencyMode: 'quality',
  avc: { format: 'avc' },
})

/** Con qué perfil se puede; si no, por qué (para decirlo en una línea al lado del botón). */
export async function videoSupport(api: WebCodecsApi = globalThis): Promise<VideoSupport> {
  const encoder = api.VideoEncoder
  if (!encoder || !api.VideoFrame) return { ok: false, reason: 'webcodecs' }
  for (const codec of CODECS) {
    try {
      if ((await encoder.isConfigSupported(videoConfig(codec))).supported) return { ok: true, codec }
    } catch {
      // Un perfil que el navegador no entiende: se prueba el siguiente.
    }
  }
  return { ok: false, reason: 'h264' }
}
