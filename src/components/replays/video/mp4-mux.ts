/**
 * Un MP4 con una sola pista de video H.264, armado en memoria con lo que da `VideoEncoder` (los cuadros codificados y su `avcC`): `ftyp`, `moov` adelante (el video
 * arranca sin bajarlo entero, como piden los chats) y `mdat`. Sin audio ni fragmentos: lo justo para un video corto que se baja y se manda. Cuadros de duración variable
 * (`stts`), y `ctts` sólo si el codificador los reordena (un B-frame).
 */

export interface Mp4Sample {
  data: Uint8Array<ArrayBuffer>
  /** En microsegundos, como `EncodedVideoChunk`. */
  timestamp: number
  duration: number
  key: boolean
}

export interface Mp4Track {
  width: number
  height: number
  /** El `avcC` (`decoderConfig.description` del codificador, con `avc.format: 'avc'`). */
  avcC: Uint8Array
  /** El espacio de color que dice el codificador (`decoderConfig.colorSpace`): va en `colr` para que los reproductores no adivinen. */
  colorSpace?: VideoColorSpaceInit | undefined
}

const TIMESCALE = 90_000
const MOVIE_TIMESCALE = 1000
const ticks = (us: number) => Math.round((us * TIMESCALE) / 1e6)

const enc = new TextEncoder()

function bytes(...parts: (Uint8Array | number[])[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const u8 = (n: number) => [n & 0xff]
const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff]
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const zeros = (n: number) => new Array<number>(n).fill(0)
const box = (type: string, ...parts: (Uint8Array | number[])[]) => {
  const body = bytes(...parts)
  return bytes(u32(body.length + 8), enc.encode(type), body)
}
const fullBox = (type: string, version: number, flags: number, ...parts: (Uint8Array | number[])[]) => box(type, u8(version), u32(flags).slice(1), ...parts)

/** La matriz identidad de `mvhd` y `tkhd` (16.16 y 2.30). */
const MATRIX = [...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)]

// Los códigos de ISO/IEC 23091-2 de lo que puede decir `VideoColorSpace`.
const PRIMARIES: Record<string, number> = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 }
const TRANSFER: Record<string, number> = { bt709: 1, smpte170m: 6, 'iec61966-2-1': 13, linear: 8, pq: 16, hlg: 18 }
const MATRIX_COEFFICIENTS: Record<string, number> = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 }

function colr(space: VideoColorSpaceInit | undefined) {
  if (!space?.primaries || !space.transfer || !space.matrix) return new Uint8Array(0)
  return box('colr', enc.encode('nclx'), u16(PRIMARIES[space.primaries] ?? 2), u16(TRANSFER[space.transfer] ?? 2), u16(MATRIX_COEFFICIENTS[space.matrix] ?? 2), u8(space.fullRange ? 0x80 : 0))
}

/** Las partes del archivo, en orden (para un `Blob`, sin copiar los cuadros). */
export function muxMp4(track: Mp4Track, samples: readonly Mp4Sample[]): Uint8Array<ArrayBuffer>[] {
  // Los tiempos de decodificación: los de presentación ordenados (iguales si el codificador no reordena).
  const pts = samples.map((sample) => ticks(sample.timestamp))
  const dts = [...pts].sort((a, b) => a - b)
  const end = samples.reduce((last, sample) => Math.max(last, ticks(sample.timestamp + sample.duration)), 0)
  const deltas = dts.map((at, index) => (dts[index + 1] ?? end) - at)
  const offsets = pts.map((at, index) => at - dts[index]!)
  const duration = end - (dts[0] ?? 0)

  const runs: [count: number, delta: number][] = []
  for (const delta of deltas) {
    const last = runs.at(-1)
    if (last && last[1] === delta) last[0] += 1
    else runs.push([1, delta])
  }
  const stts = fullBox('stts', 0, 0, u32(runs.length), runs.flatMap(([count, delta]) => [...u32(count), ...u32(delta)]))
  const ctts = offsets.some((offset) => offset !== 0) ? fullBox('ctts', 1, 0, u32(samples.length), offsets.flatMap((offset) => [...u32(1), ...u32(offset)])) : new Uint8Array(0)
  const keys = samples.flatMap((sample, index) => (sample.key ? [index + 1] : []))
  const stss = fullBox('stss', 0, 0, u32(keys.length), keys.flatMap(u32))
  const stsz = fullBox('stsz', 0, 0, u32(0), u32(samples.length), samples.flatMap((sample) => u32(sample.data.length)))
  const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1))

  const { width, height } = track
  const avc1 = box(
    'avc1',
    zeros(6), u16(1), zeros(16), u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff),
    box('avcC', track.avcC),
    colr(track.colorSpace),
  )
  const stsd = fullBox('stsd', 0, 0, u32(1), avc1)
  const movieDuration = Math.round((duration * MOVIE_TIMESCALE) / TIMESCALE)

  const moovWith = (chunkOffset: number) =>
    box(
      'moov',
      fullBox('mvhd', 0, 0, u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(movieDuration), u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(2)),
      box(
        'trak',
        fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(movieDuration), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
        box(
          'mdia',
          fullBox('mdhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(duration), u16(0x55c4), u16(0)),
          fullBox('hdlr', 0, 0, u32(0), enc.encode('vide'), zeros(12), enc.encode('VideoHandler'), [0]),
          box(
            'minf',
            fullBox('vmhd', 0, 1, zeros(8)),
            box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
            box('stbl', stsd, stts, ctts, stss, stsc, stsz, fullBox('stco', 0, 0, u32(1), u32(chunkOffset))),
          ),
        ),
      ),
    )

  const ftyp = box('ftyp', enc.encode('isom'), u32(0x200), enc.encode('isomiso2avc1mp41'))
  const size = samples.reduce((sum, sample) => sum + sample.data.length, 0)
  // El `moov` mide lo mismo con cualquier desplazamiento: se arma una vez para saber dónde empiezan los cuadros.
  const moov = moovWith(ftyp.length + moovWith(0).length + 8)
  return [ftyp, moov, bytes(u32(size + 8), enc.encode('mdat')), ...samples.map((sample) => sample.data)]
}
