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
 * Cuadros de duración variable con la cuenta de 30 por segundo: el codificador reparte `bitrate` como si fueran 30 por segundo (unos 1,7 KB por cuadro; un cuadro clave se
 * lleva más). Lo quieto es un cuadro por jugada y lo que se mueve, 10 cuadros: un duelo sale a unos 120 kbit/s, 10 minutos en menos de 10 MB (medido en Edge y Chrome de
 * escritorio). Con 1 Mbit/s pesaba 2,5 veces más sin verse mejor en un celular; con la cuenta real de cuadros (uno por segundo), cada uno se llevaba 30 veces más.
 */
export const videoConfig = (codec: string): VideoEncoderConfig => ({
  codec,
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  bitrate: 400_000,
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
