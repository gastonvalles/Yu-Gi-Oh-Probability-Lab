import { describe, expect, it } from 'vitest'

import { MAX_MESSAGE_BYTES, encodeMessage, parseMessage, type DuelMessage } from '../app/duel-protocol'
import { encodeAct, mirrorApply, openMirror, openPublic, senderKnown } from '../app/mat-public'
import { createMatState, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { random, randomAction } from './support/random-mat'

const main = Array.from({ length: 40 }, (_, index) => `card-${1000 + index}-1`)
const extra = Array.from({ length: 15 }, (_, index) => `card-${9000 + index}-1`)
const table = createMatState(main, extra, 5)

/** Una partida al azar de la que salen mensajes de verdad (jugadas, mesas, lo revelado). */
function playedGame(seed: number, moves: number) {
  const next = random(seed)
  const open = openPublic(table)
  let sender = open.sender
  let state: MatState = table
  const acts: DuelMessage[] = []

  for (let n = 1; n <= moves; n += 1) {
    const action = randomAction(state, next)
    const sent = encodeAct(sender, state, action)

    sender = sent.sender
    state = matReducer(state, action)
    acts.push({ t: 'act', n, wire: sent.wire })
  }

  const sync: DuelMessage = { t: 'sync', n: moves, state: open.masked, known: senderKnown(sender), lp: 8000, lifeN: 0 }
  return { acts, sync, open, state, sender }
}

const open = openPublic(table)
const placed = encodeAct(open.sender, table, { type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' }).wire

const samples: DuelMessage[] = [
  { t: 'hello', v: 1, sid: 'abc123', role: 'host', name: 'Ana', settings: { lp: 8000, hand: 5 } },
  { t: 'hello', v: 1, sid: 'abc123', role: 'guest', name: 'Beto' },
  { t: 'sync', n: 3, state: open.masked, known: { c1: 'card-1000-1' }, lp: 8000, lifeN: 2, clock: { running: true, elapsedMs: 1500 } },
  { t: 'sync', n: 0, state: open.masked, known: {}, lp: 8000, lifeN: 0 },
  { t: 'sync', n: 0, known: {}, lp: 6500, lifeN: 3, clock: { running: false, elapsedMs: 0 } },
  { t: 'act', n: 1, wire: placed },
  { t: 'act', n: 2, wire: { action: { type: 'tribute', id: 'c3', tributes: ['c1'], zone: 'mz', index: 1, pos: 'atk' }, reveal: {} } },
  { t: 'act', n: 3, wire: { action: { type: 'draw', count: 2 }, reveal: {} } },
  { t: 'undo', n: 0 },
  { t: 'life', n: 1, lp: 7000 },
  { t: 'clock', n: 1, running: false, elapsedMs: 0 },
  { t: 'resync' },
]

/** Copia del mensaje con un valor cambiado en `path`. */
function changed(message: DuelMessage, path: (string | number)[], value: unknown): string {
  const copy = JSON.parse(JSON.stringify(message)) as Record<string, unknown>
  let node: Record<string, unknown> = copy

  for (const key of path.slice(0, -1)) {
    node = node[key] as Record<string, unknown>
  }

  node[path.at(-1)!] = value
  return JSON.stringify(copy)
}

const sample = (type: DuelMessage['t'], index = 0) => samples.filter((message) => message.t === type)[index]!

describe('los mensajes del duelo', () => {
  it.each(samples.map((message, index) => [`${message.t} #${index}`, message] as const))('%s va y vuelve igual', (_name, message) => {
    expect(parseMessage(encodeMessage(message))).toEqual(message)
  })

  it('lo que no es un mensaje del protocolo se descarta', () => {
    const rejected = [null, undefined, 3, {}, '', '{', '[]', '"x"', 'null', '{"t":"nope"}', '{"t":3}', '{"t":"act"}', 'x'.repeat(MAX_MESSAGE_BYTES + 1)]

    expect(rejected.map(parseMessage)).toEqual(rejected.map(() => null))
  })

  it.each<[string, DuelMessage, (string | number)[], unknown]>([
    ['una jugada desconocida', sample('act'), ['wire', 'action', 'type'], 'teleport'],
    ['sacrificios que no son una lista', sample('act', 1), ['wire', 'action', 'tributes'], 'card-1'],
    ['un robo negativo', sample('act', 2), ['wire', 'action', 'count'], -1],
    ['una zona fuera de rango', sample('act'), ['wire', 'action', 'index'], 9],
    ['una posición inventada', sample('act'), ['wire', 'action', 'pos'], 'volando'],
    ['un id gigante', sample('act'), ['wire', 'action', 'id'], 'x'.repeat(500)],
    ['una jugada número cero', sample('act'), ['n'], 0],
    ['una revelación que no es texto', sample('act'), ['wire', 'reveal'], { c1: 7 }],
    ['una mesa sin una de sus filas', sample('sync'), ['state', 'mz'], [null, null, null, null]],
    ['una pila con algo que no es un id', sample('sync'), ['state', 'deck'], [1, 2, 3]],
    ['una fase inventada', sample('sync'), ['state', 'phase'], 'sueño'],
    ['puntos de vida enormes', sample('sync'), ['lp'], 1e9],
    ['un reloj negativo', sample('sync'), ['clock', 'elapsedMs'], -5],
    ['un rol inventado', sample('hello'), ['role'], 'espectador'],
    ['una versión que no es un número', sample('hello'), ['v'], 'uno'],
    ['una identidad vacía', sample('hello'), ['sid'], ''],
    ['unos ajustes sin vida', sample('hello'), ['settings', 'lp'], 0],
    ['puntos de vida con decimales', sample('life'), ['lp'], 10.5],
    ['un reloj desmedido', sample('clock'), ['elapsedMs'], 2 ** 40],
  ])('se descarta %s', (_name, message, path, value) => {
    expect(parseMessage(changed(message, path, value))).toBeNull()
  })

  it('el nombre se limpia: sin caracteres de control y con un largo razonable', () => {
    const hello = parseMessage(changed(sample('hello'), ['name'], `  An\u0000a\n${'z'.repeat(100)}  `))

    expect(hello).toMatchObject({ t: 'hello' })
    expect((hello as Extract<DuelMessage, { t: 'hello' }>).name).toBe(`Ana${'z'.repeat(37)}`)
    expect(parseMessage(changed(sample('hello'), ['name'], 7))).toBeNull()
  })

  it('una mesa completa a mitad de duelo cabe de sobra en un mensaje', () => {
    const { sync } = playedGame(5, 150)

    expect(encodeMessage(sync).length).toBeLessThan(MAX_MESSAGE_BYTES / 2)
  })
})

describe('contra mensajes alterados', () => {
  it('ninguno rompe la revisión, y lo que pasa es estable y se puede aplicar sin que nada explote', { timeout: 60_000 }, () => {
    const game = playedGame(11, 60)
    const pool = [...samples, ...game.acts.slice(0, 40), game.sync]
    const garbage: unknown[] = [null, -1, 0, 1.5, 1e9, 2 ** 40, '', 'x', 'x'.repeat(300), [], {}, [1, 2], true, 'deck', 'atk', 'draw']
    const next = random(99)
    let accepted = 0
    let rejected = 0

    /** Todas las rutas hasta una hoja del JSON. */
    const leaves = (value: unknown, path: (string | number)[] = []): (string | number)[][] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([key, child]) => leaves(child, [...path, Array.isArray(value) ? Number(key) : key]))
        : [path]

    for (let attempt = 0; attempt < 4000; attempt += 1) {
      const source = pool[Math.floor(next() * pool.length)]!
      const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>
      const paths = leaves(copy).filter((candidate) => candidate.length > 0)
      const path = paths[Math.floor(next() * paths.length)]!
      let node: Record<string | number, unknown> = copy

      for (const key of path.slice(0, -1)) {
        node = node[key] as Record<string | number, unknown>
      }

      const last = path.at(-1)!

      if (next() < 0.2) {
        delete node[last]
      } else {
        node[last] = garbage[Math.floor(next() * garbage.length)]
      }

      const parsed = parseMessage(JSON.stringify(copy))

      if (!parsed) {
        rejected += 1
        continue
      }

      accepted += 1
      expect(parseMessage(encodeMessage(parsed))).toEqual(parsed)

      if (parsed.t === 'act') {
        // Aplicada sobre la mesa real y sobre una mesa a medio jugar, no explota.
        const busy = game.acts.slice(0, 30).reduce((state, act) => (act.t === 'act' ? matReducer(state, act.wire.action) : state), table)
        expect(() => matReducer(table, parsed.wire.action)).not.toThrow()
        expect(() => matReducer(busy, parsed.wire.action)).not.toThrow()
        expect(() => mirrorApply(openMirror(game.open.masked), parsed.wire)).not.toThrow()
      }

      if (parsed.t === 'sync' && parsed.state) {
        const mirror = openMirror(parsed.state, parsed.known)
        const action: MatAction = { type: 'draw', count: 1 }

        expect(() => mirrorApply(mirror, { action, reveal: {} })).not.toThrow()
      }
    }

    // La prueba no es vacía: muchas alteraciones se descartan y otras (un id cambiado por otro texto) siguen siendo válidas.
    expect(rejected).toBeGreaterThan(500)
    expect(accepted).toBeGreaterThan(200)
  })
})

describe('las marcas de objetivo', () => {
  const parse = (value: unknown) => parseMessage(JSON.stringify(value))

  it('llega el conjunto entero de cartas (ids opacos) y pilas, sin repetidos', () => {
    expect(parse({ t: 'marks', cards: ['c1', 'c7'], piles: ['hand', 'gy'] })).toEqual({ t: 'marks', cards: ['c1', 'c7'], piles: ['hand', 'gy'] })
    expect(parse({ t: 'marks', cards: [], piles: [] })).toEqual({ t: 'marks', cards: [], piles: [] })
  })

  it('lo mal formado se descarta: pilas que no existen o repetidas, ids que no son ids, demasiadas cartas, otra forma', () => {
    expect(parse({ t: 'marks', cards: [], piles: ['mz'] })).toBeNull()
    expect(parse({ t: 'marks', cards: [], piles: ['gy', 'gy'] })).toBeNull()
    expect(parse({ t: 'marks', cards: [1], piles: [] })).toBeNull()
    expect(parse({ t: 'marks', cards: [''], piles: [] })).toBeNull()
    expect(parse({ t: 'marks', cards: Array.from({ length: 31 }, (_, index) => `c${index + 1}`), piles: [] })).toBeNull()
    expect(parse({ t: 'marks', cards: 'c1', piles: [] })).toBeNull()
    expect(parse({ t: 'marks', cards: [] })).toBeNull()
    expect(parse({ t: 'marks', cards: [], piles: ['hand', 'deck', 'extra', 'gy', 'banished', 'hand'] })).toBeNull()
  })
})
