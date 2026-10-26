/**
 * Duelos automáticos · la clave del duelo por enlace. El anfitrión baraja y siembra el núcleo con una clave de 256 bits en vez de una semilla u32: con 32 bits de semilla
 * (mulberry32 tiene 32 bits de estado y `coreSeed`, 32 bits de entropía real) un invitado modificado prueba las 2³² semillas contra su mano inicial y ve los dos decks.
 * De la clave salen, con ChaCha20 (RFC 8439), flujos independientes por nonce `[flujo, 0, 0]`: **0** = baraja del deck del equipo 0, **1** = baraja del deck del equipo 1,
 * **2** = estado inicial del núcleo; los que sigan se reservan. Un solo primitivo hace de derivador y de generador, y conocer un flujo entero no da la clave ni los otros
 * (descartados: `crypto.subtle`, asíncrono; SHA-256 a mano más un PRNG aparte, más código; splitmix/xoshiro encadenados, invertibles). Lo que NO resuelve: el
 * xoshiro256** del núcleo no es criptográfico, y las monedas, los dados y las barajadas que se ven en el duelo dan unos pocos bits de su estado (la misma exposición que
 * EDOPro). Puro y sincrónico: lo usan el Worker y la sesión.
 */
export const DUEL_KEY = /^[0-9a-f]{64}$/

export const isDuelKey = (value: unknown): value is string => typeof value === 'string' && DUEL_KEY.test(value)

/** 32 bytes del generador del sistema, en hex minúscula. */
export function newDuelKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const rotl = (value: number, bits: number) => (value << bits) | (value >>> (32 - bits))

function quarterRound(x: Uint32Array, a: number, b: number, c: number, d: number) {
  x[a] = x[a]! + x[b]!
  x[d] = rotl(x[d]! ^ x[a]!, 16)
  x[c] = x[c]! + x[d]!
  x[b] = rotl(x[b]! ^ x[c]!, 12)
  x[a] = x[a]! + x[b]!
  x[d] = rotl(x[d]! ^ x[a]!, 8)
  x[c] = x[c]! + x[d]!
  x[b] = rotl(x[b]! ^ x[c]!, 7)
}

/** El bloque de ChaCha20 (RFC 8439 §2.3): «expand 32-byte k», 8 palabras de clave, contador de 32 bits y 3 de nonce, 20 rondas y la suma final; palabras little-endian. */
export function chachaBlock(key: Uint32Array, counter: number, nonce: Uint32Array): Uint32Array {
  if (key.length !== 8 || nonce.length !== 3) throw new Error('ChaCha20: la clave son 8 palabras y el nonce, 3')
  const input = Uint32Array.of(0x61707865, 0x3320646e, 0x79622d32, 0x6b206574, ...key, counter, ...nonce)
  const x = input.slice()

  for (let round = 0; round < 10; round += 1) {
    quarterRound(x, 0, 4, 8, 12)
    quarterRound(x, 1, 5, 9, 13)
    quarterRound(x, 2, 6, 10, 14)
    quarterRound(x, 3, 7, 11, 15)
    quarterRound(x, 0, 5, 10, 15)
    quarterRound(x, 1, 6, 11, 12)
    quarterRound(x, 2, 7, 8, 13)
    quarterRound(x, 3, 4, 9, 14)
  }

  return x.map((word, at) => word + input[at]!)
}

/** Las palabras de 32 bits del flujo `stream`, en orden: bloques con nonce `[stream, 0, 0]` y el contador desde 0. Lanza si la clave o el flujo no sirven. */
function keyStream(key: string, stream: number): () => number {
  if (!isDuelKey(key)) throw new Error('Clave de duelo inválida')
  if (!Number.isInteger(stream) || stream < 0 || stream > 0xffffffff) throw new Error(`Flujo de la clave inválido: ${stream}`)
  const words = new Uint32Array(8)
  for (let at = 0; at < 32; at += 1) words[at >> 2] = words[at >> 2]! | (parseInt(key.slice(at * 2, at * 2 + 2), 16) << (8 * (at & 3)))
  const nonce = Uint32Array.of(stream, 0, 0)
  let counter = 0
  let block = chachaBlock(words, counter, nonce)
  let at = 0

  return () => {
    if (at === 16) {
      counter += 1
      block = chachaBlock(words, counter, nonce)
      at = 0
    }
    return block[at++]!
  }
}

/** Un entero en [0, bound) sin sesgo: se descartan las palabras de la cola que no completa una vuelta de `bound` (muestreo por rechazo). Exportado para las pruebas. */
export function uniformBelow(next: () => number, bound: number): number {
  const limit = 2 ** 32 - (2 ** 32 % bound)
  for (;;) {
    const word = next()
    if (word < limit) return word % bound
  }
}

/** Fisher-Yates como `shuffleWithSeed` (de i = n−1 a 1, j en [0, i]) con el flujo `stream` de la clave. No muta `items`. */
export function shuffleWithKey<T>(items: readonly T[], key: string, stream: number): T[] {
  const next = keyStream(key, stream)
  const shuffled = [...items]

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = uniformBelow(next, i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }

  return shuffled
}

/** Estado inválido para xoshiro (todo en cero, probabilidad 2⁻²⁵⁶): se cambia por éste, fijo. */
const NONZERO_CORE_SEED: [bigint, bigint, bigint, bigint] = [1n, 0n, 0n, 0n]

/** El estado de 256 bits del xoshiro256** del núcleo: las 8 primeras palabras del flujo 2, de a pares (baja | alta << 32). */
export function coreSeedOf(key: string): [bigint, bigint, bigint, bigint] {
  const next = keyStream(key, 2)
  const word64 = () => BigInt(next()) | (BigInt(next()) << 32n)
  const seed: [bigint, bigint, bigint, bigint] = [word64(), word64(), word64(), word64()]

  return seed.every((part) => part === 0n) ? [...NONZERO_CORE_SEED] : seed
}
