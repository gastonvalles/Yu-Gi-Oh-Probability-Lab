import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_BURST,
  AUTO_PROTOCOL_VERSION,
  AUTO_RATE_PER_SECOND,
  chunkAutoText,
  createPacer,
  createReassembler,
  encodeAutoMessage,
  GUEST_ACCEPTS,
  HOST_ACCEPTS,
  isAutoText,
  MAX_AUTO_BYTES,
  MAX_PARTS,
  MAX_WHOLE_BYTES,
  parseAutoMessage,
  type AutoMessage,
} from '../app/auto/online-protocol'
import { byteLength, MAX_MESSAGE_BYTES } from '../app/duel-relay-rules'
import { parseMessage } from '../app/duel-protocol'

const v = AUTO_PROTOCOL_VERSION
const EVENT: AutoMessage = { t: 'autoEvent', event: { t: 'events', seat: 1, n: 3, events: [{ type: 'draw', player: 1, drawn: [{ code: 55, position: 10 }] }] }, cards: [{ code: 55, type: 0x21, name: 'Ash Blossom', strs: ['Negar'] }] }
const GOOD: AutoMessage[] = [
  { t: 'autoDeck', v, main: [[14558127, 3], [23434538, 2]], extra: [[1, 1]] },
  { t: 'autoCheck', v, ok: false, bad: [99], theirsBad: 2 },
  { t: 'autoCheck', v, ok: false, bad: [], theirsBad: 0, reason: 'lost' },
  { t: 'autoInit', v, seed: 2 ** 32 - 1, seat: 1, players: [{ lp: 8000, hand: 5, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }], mine: { main: [5, 6, 7], extra: [8], hand: [] }, theirs: { main: 40, extra: 15 } },
  { t: 'autoReplay', skip: 12 },
  EVENT,
  { t: 'autoEvent', event: { t: 'loading', done: 0, total: 3 } },
  { t: 'autoBatch', events: [{ t: 'loading', done: 0, total: 3 }, { t: 'end', winner: 0, reason: 1 }], cards: [{ code: 9, type: 1 }] },
  { t: 'autoPart', id: 3, i: 1, n: 2, text: '{"t":' },
  { t: 'autoAnswer', askId: 17, answer: { type: 'select_chain', index: null } },
  { t: 'autoResync' },
  { t: 'autoManual', step: 'ask' },
  { t: 'autoManual', step: 'yes', dropped: true },
  { t: 'autoManual', step: 'no', why: 'control' },
  { t: 'autoManual', step: 'cancel' },
]

describe('el protocolo del duelo automático por enlace', () => {
  afterEach(() => vi.useRealTimers())

  it('cada mensaje bien formado vuelve igual; todos empiezan con {"t":"auto y el protocolo manual los ignora', () => {
    for (const message of GOOD) {
      const text = encodeAutoMessage(message)

      expect(isAutoText(text)).toBe(true)
      expect(parseAutoMessage(text)).toEqual(message)
      expect(parseMessage(text)).toBeNull()
    }
    // Una copia: lo que sobra no pasa.
    expect(parseAutoMessage('{"t":"autoResync","x":1}')).toEqual({ t: 'autoResync' })
    expect(parseAutoMessage(JSON.stringify({ t: 'autoAnswer', askId: 1, answer: { type: 'select_yesno', yes: true, hack: 1 } }))).toEqual({ t: 'autoAnswer', askId: 1, answer: { type: 'select_yesno', yes: true } })
  })

  it('cada lado acepta sólo lo que manda el otro (pasar a manual lo piden los dos), y entre los dos cubren todos los mensajes', () => {
    expect(HOST_ACCEPTS.filter((kind) => GUEST_ACCEPTS.includes(kind))).toEqual(['autoManual'])
    expect([...new Set([...HOST_ACCEPTS, ...GUEST_ACCEPTS])].sort()).toEqual([...new Set(GOOD.map((message) => message.t))].sort())
  })

  it('rechaza lo mal formado o lo que pasa los topes', () => {
    const rows = (n: number, copies = 1) => Array.from({ length: n }, (_, i) => [i + 1, copies])
    const init = GOOD[3] as Extract<AutoMessage, { t: 'autoInit' }>
    const bad: unknown[] = [
      { t: 'autoNada' },
      { t: 'autoDeck', v: -1, main: [], extra: [] },
      { t: 'autoDeck', v, main: rows(201), extra: [] },
      { t: 'autoDeck', v, main: [[1, 0]], extra: [] },
      { t: 'autoDeck', v, main: [[0, 1]], extra: [] },
      { t: 'autoDeck', v, main: [[1, 2.5]], extra: [] },
      { t: 'autoDeck', v, main: [[1, 1, 1]], extra: [] },
      // Más de 200 cartas en el Main o 100 en el Extra, aunque las filas sean pocas.
      { t: 'autoDeck', v, main: rows(70, 3), extra: [] },
      { t: 'autoDeck', v, main: [], extra: rows(34, 3) },
      { t: 'autoCheck', v, ok: 'si', bad: [], theirsBad: 0 },
      { t: 'autoCheck', v, ok: false, bad: [], theirsBad: 301 },
      { t: 'autoCheck', v, ok: false, bad: [0], theirsBad: 0 },
      { t: 'autoCheck', v, ok: false, bad: [], theirsBad: 0, reason: 'otra' },
      { ...init, seat: 2 },
      { ...init, seed: 2 ** 32 },
      { ...init, players: [init.players[0]] },
      { ...init, players: [{ lp: 0, hand: 5, draw: 1 }, init.players[1]] },
      { ...init, mine: { main: [5], extra: [], hand: [5, 6] } },
      { ...init, mine: { main: [0], extra: [], hand: [] } },
      { ...init, theirs: { main: 201, extra: 0 } },
      { t: 'autoReplay', skip: -1 },
      { t: 'autoReplay', skip: 20_001 },
      { t: 'autoEvent', event: { t: 'events', seat: 3, n: 0, events: [] } },
      { t: 'autoEvent', event: { t: 'loading', done: 0, total: 1 }, cards: [{ code: 0, type: 1 }] },
      { t: 'autoEvent', event: { t: 'loading', done: 0, total: 1 }, cards: [{ code: 1, type: 1, name: 'x'.repeat(201) }] },
      { t: 'autoEvent', event: { t: 'loading', done: 0, total: 1 }, cards: [{ code: 1, type: 1, strs: Array(17).fill('') }] },
      { t: 'autoBatch', events: [{ t: 'loading', done: 0, total: 1 }, { t: 'nada' }] },
      { t: 'autoPart', id: 1, i: 2, n: 2, text: '' },
      { t: 'autoPart', id: 1, i: 0, n: MAX_PARTS + 1, text: '' },
      { t: 'autoPart', id: 0, i: 0, n: 1, text: '' },
      { t: 'autoAnswer', askId: 0, answer: { type: 'select_chain', index: null } },
      { t: 'autoAnswer', askId: 1, answer: { type: 'select_nada' } },
      { t: 'autoAnswer', askId: 1, answer: { type: 'select_yesno', yes: 1 } },
      { t: 'autoManual' },
      { t: 'autoManual', step: 'maybe' },
      { t: 'autoManual', step: 'yes', dropped: false },
      { t: 'autoManual', step: 'no', why: 'otra' },
    ]

    for (const message of bad) expect(parseAutoMessage(JSON.stringify(message)), JSON.stringify(message).slice(0, 80)).toBeNull()
    expect(parseAutoMessage('{"t":"autoResync"')).toBeNull()
    expect(parseAutoMessage('[1]')).toBeNull()
    // Más de 16 KB no pasa (el relay ya lo corta), ni siquiera un mensaje que sería válido; reensamblado, sí, hasta su tope.
    const big = JSON.stringify({ t: 'autoBatch', events: Array.from({ length: 700 }, () => ({ t: 'loading', done: 0, total: 1 })) })

    expect(byteLength(big)).toBeGreaterThan(MAX_MESSAGE_BYTES)
    expect(parseAutoMessage(big)).toBeNull()
    expect(parseAutoMessage(big, MAX_WHOLE_BYTES)).toMatchObject({ t: 'autoBatch' })
  })

  it('un texto grande (con comillas, barras y emojis) viaja en partes que entran en el relay y se reensambla igual, en cualquier orden', () => {
    const names = Array.from({ length: 400 }, (_, i) => ({ code: i + 1, type: 1, name: `Dragón «${i}» 🐉 "quote" \\ ${'ñ'.repeat(i % 7)}`, strs: ['😀'.repeat(8)] }))
    const text = encodeAutoMessage({ t: 'autoBatch', events: [{ t: 'loading', done: 0, total: 1 }], cards: names.slice(0, 600) })
    const parts = chunkAutoText(text, 9)

    expect(byteLength(text)).toBeGreaterThan(40 * 1024)
    expect(parts.length).toBeGreaterThan(3)
    expect(parts.length).toBeLessThanOrEqual(MAX_PARTS)
    for (const part of parts) expect(byteLength(part)).toBeLessThanOrEqual(MAX_AUTO_BYTES + 100)
    const parsed = parts.map((part) => parseAutoMessage(part) as Extract<AutoMessage, { t: 'autoPart' }>)

    expect(parsed.every((part) => part?.t === 'autoPart' && part.id === 9 && part.n === parts.length)).toBe(true)
    // Ningún trozo corta un emoji por la mitad.
    expect(parsed.every((part) => !/[\uD800-\uDBFF]$/.test(part.text) && !/^[\uDC00-\uDFFF]/.test(part.text))).toBe(true)

    const reassembler = createReassembler()
    const shuffled = [...parsed].reverse()
    // Uno repetido no cuenta dos veces.
    const results = [...shuffled, shuffled[0]!].map((part) => reassembler.push(part))

    expect(results.filter((result) => result !== null)).toEqual([text])
    expect(parseAutoMessage(results.find((result) => result !== null)!, MAX_WHOLE_BYTES)).toEqual(JSON.parse(text))
    // Uno chico va entero; uno que no entra en 16 partes no se puede mandar.
    expect(chunkAutoText('{"t":"autoResync"}')).toEqual(['{"t":"autoResync"}'])
    expect(chunkAutoText(`{"t":"autoPart","text":"${'x'.repeat(MAX_PARTS * MAX_AUTO_BYTES + 10)}"}`)).toEqual([])
  })

  it('lo que no cierra se descarta: a los 60 s, con más de 4 a medias, o si el id vuelve con otro total', () => {
    let clock = 0
    const reassembler = createReassembler(() => clock)
    const part = (id: number, i: number, n: number, text = String(i)) => ({ t: 'autoPart' as const, id, i, n, text })

    expect(reassembler.push(part(1, 0, 2))).toBeNull()
    clock = 61_000
    expect(reassembler.push(part(1, 1, 2))).toBeNull()
    expect(reassembler.push(part(1, 0, 2))).toBe('01')

    for (const id of [2, 3, 4, 5, 6]) reassembler.push(part(id, 0, 2))
    // El 2 era el más viejo: se descartó al abrir el 6.
    expect(reassembler.push(part(2, 1, 2))).toBeNull()
    expect(reassembler.push(part(6, 1, 2))).toBe('01')

    reassembler.push(part(7, 0, 3))
    expect(reassembler.push(part(7, 1, 2))).toBeNull()
    expect(reassembler.push(part(7, 0, 2))).toBe('01')
  })

  it('el marcapasos manda la ráfaga y después 25 por segundo, en orden; un stats repetido al final de la cola reemplaza al anterior y nunca pisa eventos', () => {
    vi.useFakeTimers()
    const sent: string[] = []
    const pacer = createPacer((text) => sent.push(text), Date.now)

    for (let i = 0; i < 100; i += 1) pacer.push(`m${i}`)
    expect(sent).toHaveLength(AUTO_BURST)
    vi.advanceTimersByTime(1000)
    expect(sent.length).toBeGreaterThanOrEqual(AUTO_BURST + AUTO_RATE_PER_SECOND - 1)
    expect(sent.length).toBeLessThanOrEqual(AUTO_BURST + AUTO_RATE_PER_SECOND + 1)
    vi.advanceTimersByTime(5000)
    expect(sent).toEqual(Array.from({ length: 100 }, (_, i) => `m${i}`))

    // Con la cola llena: stats, stats (reemplaza), evento, stats (no reemplaza: hay un evento en el medio).
    sent.length = 0
    for (let i = 0; i < 60; i += 1) pacer.push(`x${i}`)
    pacer.push('stats-1', 'stats')
    pacer.push('stats-2', 'stats')
    pacer.push('events', undefined)
    pacer.push('stats-3', 'stats')
    vi.advanceTimersByTime(10_000)
    expect(sent.slice(-3)).toEqual(['stats-2', 'events', 'stats-3'])

    pacer.push('a')
    pacer.destroy()
    vi.advanceTimersByTime(10_000)
    pacer.push('b')
    expect(sent.at(-1)).not.toBe('b')
  })
})
