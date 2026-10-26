import { chachaBlock, coreSeedOf, DUEL_KEY, isDuelKey, newDuelKey, shuffleWithKey, uniformBelow } from '../app/auto/duel-key'

/** Bytes en hex → palabras little-endian, como lee ChaCha20 la clave y el nonce. */
const words = (hex: string) => Uint32Array.from({ length: hex.length / 8 }, (_, at) => parseInt(hex.slice(at * 8, at * 8 + 8).match(/../g)!.reverse().join(''), 16))
const range = (n: number) => Array.from({ length: n }, (_, at) => at)
/** Claves deterministas a partir de un contador (y un prefijo, para no repetir entre pruebas). */
const keyOf = (n: number, prefix = '') => (prefix + n.toString(16)).padStart(64, '0')
const K = '0b30557a9fc4e90e33587da2c7ec11365b80a5caef14395e83a8cdf2173c6186'

/** Chi-cuadrado de unos conteos contra la uniforme. */
const chiSquare = (counts: number[]) => {
  const expected = counts.reduce((sum, count) => sum + count, 0) / counts.length
  return counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0)
}

describe('chachaBlock', () => {
  it('reproduce el bloque de la RFC 8439 §2.3.2', () => {
    const key = words(range(32).map((byte) => byte.toString(16).padStart(2, '0')).join(''))
    const block = chachaBlock(key, 1, words('000000090000004a00000000'))

    expect(Array.from(block)).toEqual([
      0xe4e7f110, 0x15593bd1, 0x1fdd0f50, 0xc47120a3, 0xc7f4d1c7, 0x0368c033, 0x9aaa2204, 0x4e6cd4c3, 0x466482d2, 0x09aa9f07, 0x05d7c214, 0xa2028bd9, 0xd19c12b5,
      0xb94e16de, 0xe883d0cb, 0x4e3c50a2,
    ])
  })

  it('reproduce el vector 1 de la RFC 8439 A.1 (clave y nonce en cero, contador 0)', () => {
    const keystream = '76b8e0ada0f13d90405d6ae55386bd28bdd219b8a08ded1aa836efcc8b770dc7da41597c5157488d7724e03fb8d84a376a43b8f41518a11cc387b669b2ee6586'

    expect(Array.from(chachaBlock(new Uint32Array(8), 0, new Uint32Array(3)))).toEqual(Array.from(words(keystream)))
  })

  it('lanza con una clave o un nonce del largo equivocado', () => {
    expect(() => chachaBlock(new Uint32Array(7), 0, new Uint32Array(3))).toThrow()
    expect(() => chachaBlock(new Uint32Array(8), 0, new Uint32Array(2))).toThrow()
  })
})

describe('shuffleWithKey y coreSeedOf', () => {
  it('no cambian sin querer (vectores fijos)', () => {
    expect(shuffleWithKey(range(40), K, 0)).toEqual([7, 12, 28, 9, 11, 33, 35, 27, 24, 5, 17, 15, 20, 0, 1, 21, 19, 4, 36, 30, 34, 16, 25, 32, 10, 31, 38, 2, 22, 14, 3, 13, 8, 39, 29, 18, 37, 23, 6, 26])
    expect(shuffleWithKey(range(40), K, 1)).toEqual([22, 17, 38, 19, 36, 2, 39, 16, 0, 3, 13, 1, 29, 28, 25, 20, 24, 6, 9, 5, 14, 18, 4, 8, 15, 32, 31, 35, 23, 30, 10, 11, 21, 26, 37, 33, 34, 12, 27, 7])
    expect(coreSeedOf(K)).toEqual([0x5a94f5f2475ad2can, 0xee90ba43dd7cc91cn, 0xd048e2609bad9d0dn, 0x45a41fcbabec0861n])
  })

  it('leen el flujo de ChaCha20 que dice el contrato: clave hex → palabras LE, nonce [flujo, 0, 0], contador 0', () => {
    for (const key of [K, keyOf(1), keyOf(0xbeef, 'f')]) {
      for (const stream of [0, 1, 7, 0xffffffff]) {
        // Con dos cartas hay un solo paso, j = w % 2 (2 divide 2³²: nunca rechaza); j = 0 las da vuelta.
        const first = chachaBlock(words(key), 0, Uint32Array.of(stream, 0, 0))[0]!
        expect(shuffleWithKey(['a', 'b'], key, stream)).toEqual(first % 2 === 0 ? ['b', 'a'] : ['a', 'b'])
      }

      const core = chachaBlock(words(key), 0, Uint32Array.of(2, 0, 0))
      expect(coreSeedOf(key)).toEqual(range(4).map((at) => BigInt(core[2 * at]!) | (BigInt(core[2 * at + 1]!) << 32n)))
    }
  })

  it('una clave que cambia en el primer o el último byte da otra baraja, y los flujos 0, 1 y 2 son distintos', () => {
    const first = `ff${K.slice(2)}`
    const last = `${K.slice(0, 62)}00`
    const deck = range(40)

    expect(shuffleWithKey(deck, first, 0)).not.toEqual(shuffleWithKey(deck, K, 0))
    expect(shuffleWithKey(deck, last, 0)).not.toEqual(shuffleWithKey(deck, K, 0))
    expect(coreSeedOf(first)).not.toEqual(coreSeedOf(K))
    expect(coreSeedOf(last)).not.toEqual(coreSeedOf(K))
    expect(shuffleWithKey(deck, K, 0)).not.toEqual(shuffleWithKey(deck, K, 1))
    // El flujo 2 como baraja tampoco es ninguna de las otras dos.
    expect(shuffleWithKey(deck, K, 2)).not.toEqual(shuffleWithKey(deck, K, 0))
    expect(shuffleWithKey(deck, K, 2)).not.toEqual(shuffleWithKey(deck, K, 1))
  })

  it('las 24 permutaciones de 4 cartas salen parejas (chi-cuadrado con 24.000 claves)', () => {
    const counts = new Map<string, number>()
    for (let n = 0; n < 24_000; n += 1) {
      const order = shuffleWithKey(range(4), keyOf(n), 0).join('')
      counts.set(order, (counts.get(order) ?? 0) + 1)
    }

    expect(counts.size).toBe(24)
    // 23 grados de libertad: el 99,9 % queda debajo de 49,7; 70 es holgado y las claves son fijas, así que no es intermitente.
    expect(chiSquare([...counts.values()])).toBeLessThan(70)
  })

  it.each([3, 5, 7])('con un tope que no divide 2³² (%i) cada valor sale parejo', (bound) => {
    // El primer paso de Fisher-Yates elige la última carta con j en [0, bound): es `uniformBelow` del flujo, tal cual.
    const counts = range(bound).map(() => 0)
    for (let n = 0; n < 3_000 * bound; n += 1) counts[shuffleWithKey(range(bound), keyOf(n, `${bound}`), 1)[bound - 1]!]! += 1

    expect(chiSquare(counts)).toBeLessThan(35)
  })
})

describe('uniformBelow', () => {
  /** Una fuente de palabras fija, que cuenta cuántas se tomaron. */
  const source = (list: number[]) => {
    const taken = { count: 0 }
    return { taken, next: () => list[taken.count++]! }
  }

  it.each([
    // 2³² mod 3 = 1 y 2³² mod 7 = 4: el tope de aceptación es 2³² − 1 y 2³² − 4; la palabra justo debajo pasa.
    [3, 0xffffffff, 0xfffffffe],
    [7, 0xfffffffc, 0xfffffffb],
  ])('con tope %i descarta la cola (desde %i) y usa la palabra siguiente', (bound, rejected, accepted) => {
    const words = source([rejected, 0xffffffff, accepted])

    expect(uniformBelow(words.next, bound)).toBe(accepted % bound)
    expect(words.taken.count).toBe(3)
  })

  it('con un tope que divide 2³² no descarta nada', () => {
    const words = source([0xffffffff])

    expect(uniformBelow(words.next, 4)).toBe(3)
    expect(words.taken.count).toBe(1)
  })
})

describe('la clave', () => {
  it('isDuelKey sólo acepta 64 caracteres hex en minúscula', () => {
    expect(isDuelKey(K)).toBe(true)
    expect(isDuelKey(K.toUpperCase())).toBe(false)
    expect(isDuelKey(K.slice(1))).toBe(false)
    expect(isDuelKey(`${K}0`)).toBe(false)
    expect(isDuelKey(`${K.slice(1)}g`)).toBe(false)
    expect(isDuelKey(12345)).toBe(false)
    expect(isDuelKey(undefined)).toBe(false)
  })

  it('newDuelKey da una clave válida y distinta cada vez', () => {
    const one = newDuelKey()
    const two = newDuelKey()

    expect(one).toMatch(DUEL_KEY)
    expect(one).toHaveLength(64)
    expect(two).toMatch(DUEL_KEY)
    expect(one).not.toBe(two)
  })

  it('shuffleWithKey no muta la entrada, conserva las cartas y lanza con una clave o un flujo inválidos', () => {
    const deck = Object.freeze([5, 5, 9, 1, 1, 1, 3])
    const shuffled = shuffleWithKey(deck, K, 0)

    expect(deck).toEqual([5, 5, 9, 1, 1, 1, 3])
    expect([...shuffled].sort()).toEqual([...deck].sort())
    for (const bad of [K.toUpperCase(), K.slice(1), 42 as unknown as string]) {
      expect(() => shuffleWithKey(deck, bad, 0)).toThrow()
      expect(() => coreSeedOf(bad)).toThrow()
    }
    for (const stream of [1.5, -1, 2 ** 32, Number.NaN]) expect(() => shuffleWithKey(deck, K, stream)).toThrow()
    // Aunque no haya nada que barajar.
    expect(() => shuffleWithKey([], 'nope', 0)).toThrow()
  })
})
