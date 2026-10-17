import { describe, expect, it } from 'vitest'

import { MAX_MESSAGE_BYTES, cleanName, encodeMessage, parseMessage, type DuelMessage } from '../app/duel-protocol'
import { cleanChat } from '../app/duel-games'
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
  { t: 'hello', v: 1, sid: 'abc123', role: 'host', name: 'Ana', settings: { lp: 8000, hand: 5, limitMin: 50, format: 'unlimited', match: false, siding: false } },
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

  it('el nombre se limpia: sin caracteres de control y con 20 caracteres como máximo', () => {
    const hello = parseMessage(changed(sample('hello'), ['name'], `  An\u0000a\n${'z'.repeat(100)}  `))

    expect(hello).toMatchObject({ t: 'hello' })
    expect((hello as Extract<DuelMessage, { t: 'hello' }>).name).toBe(`Ana${'z'.repeat(17)}`)
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
    // (Con ids de carta estrictos, "x" ya no es un id: pasan menos que antes.)
    expect(accepted).toBeGreaterThan(100)
  })
})

describe('contra un rival malicioso', () => {
  const message = (value: unknown) => parseMessage(JSON.stringify(value))
  const wire = (action: unknown, reveal: unknown = {}) => ({ t: 'act', n: 1, wire: { action, reveal } })

  it('el tiempo del reloj de los ajustes: sin él vale el de siempre, y fuera de rango o mal escrito se rechaza', () => {
    const hello = (settings: unknown) => ({ t: 'hello', v: 1, sid: 'abc123', role: 'host', name: 'Ana', settings })

    expect(message(hello({ lp: 8000, hand: 5 }))).toMatchObject({ settings: { limitMin: 50, format: 'unlimited', match: false, siding: false } })
    expect(message(hello({ lp: 8000, hand: 5, limitMin: 0 }))).toMatchObject({ settings: { limitMin: 0 } })
    expect(message(hello({ lp: 8000, hand: 5, limitMin: 90 }))).toMatchObject({ settings: { limitMin: 90 } })

    for (const limitMin of [-1, 181, 1.5, '40', null]) {
      expect(message(hello({ lp: 8000, hand: 5, limitMin })), String(limitMin)).toBeNull()
    }
  })

  it('el tope de puntos de Genesys de los ajustes: sólo cuenta en Genesys, y fuera de rango o mal escrito se rechaza', () => {
    const hello = (settings: unknown) => ({ t: 'hello', v: 1, sid: 'abc123', role: 'host', name: 'Ana', settings })

    expect(message(hello({ lp: 8000, hand: 5, format: 'genesys', genesysCap: 80 }))).toMatchObject({ settings: { format: 'genesys', genesysCap: 80 } })
    // Un anfitrión de antes no lo manda: queda sin tope propio (vale el oficial al revisar el deck).
    expect(message(hello({ lp: 8000, hand: 5, format: 'genesys' }))).toMatchObject({ settings: { format: 'genesys' } })
    expect((message(hello({ lp: 8000, hand: 5, format: 'genesys' })) as { settings: object }).settings).not.toHaveProperty('genesysCap')
    expect((message(hello({ lp: 8000, hand: 5, format: 'tcg', genesysCap: 80 })) as { settings: object }).settings).not.toHaveProperty('genesysCap')

    for (const genesysCap of [0, 1000, 1.5, '80', null]) {
      expect(message(hello({ lp: 8000, hand: 5, format: 'genesys', genesysCap })), String(genesysCap)).toBeNull()
    }
  })

  /** Ids que, usados como clave de un objeto común, devuelven algo heredado (una función) en vez de nada. */
  const INHERITED = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype']

  it('un id de carta sólo puede ser opaco (c12) o de ficha (token-3): nada que sea una propiedad de los objetos', () => {
    for (const id of [...INHERITED, 'card-123-1', 'c', 'c1x', 'C1', 'c123456', 'token-', 'token-12345', ' c1', 'c1\n', '']) {
      expect(message(wire({ type: 'reveal', id })), id).toBeNull()
      expect(message(wire({ type: 'move', id, to: 'gy' })), id).toBeNull()
      expect(message({ t: 'marks', cards: [id], piles: [] }), id).toBeNull()
    }

    expect(message(wire({ type: 'reveal', id: 'c12' }))).not.toBeNull()
    expect(message(wire({ type: 'move', id: 'token-3', to: 'gy' }))).not.toBeNull()
    expect(message({ t: 'marks', cards: ['c1', 'c99999'], piles: [] })).not.toBeNull()
  })

  it('tampoco en lo que nombra otras cartas (sacrificios, materiales, a qué se une, a quién se ataca) ni en la mesa entera', () => {
    for (const id of INHERITED) {
      expect(message(wire({ type: 'tribute', id: 'c1', tributes: [id], zone: 'mz', index: 0, pos: 'atk' }))).toBeNull()
      expect(message(wire({ type: 'summon', id: 'c1', how: 'xyz', materials: [id], zone: 'mz', index: 0, pos: 'atk' }))).toBeNull()
      expect(message(wire({ type: 'attach', id: 'c1', to: id }))).toBeNull()
      expect(message(wire({ type: 'attack', id: 'c1', target: id }))).toBeNull()

      const table = { deck: [], extra: [], hand: [id], gy: [], banished: [], mz: [null, null, null, null, null], emz: [null, null], st: [null, null, null, null, null], field: null, tokens: 0, phase: 'draw', turn: 1, facedown: [], targeted: [] }
      expect(message({ t: 'sync', n: 0, known: {}, lp: 8000, lifeN: 0, state: table })).toBeNull()
      expect(message({ t: 'sync', n: 0, known: {}, lp: 8000, lifeN: 0, state: { ...table, hand: [], mz: [{ id, pos: 'atk', counters: 0, materials: [] }, null, null, null, null] } })).toBeNull()
      expect(message({ t: 'sync', n: 0, known: {}, lp: 8000, lifeN: 0, state: { ...table, hand: [], targeted: [id] } })).toBeNull()
    }
  })

  it('lo revelado: la clave es un id opaco y el valor, una carta real (card-123-2); nada más', () => {
    const known = (entries: Record<string, string>) => message({ t: 'sync', n: 0, known: entries, lp: 8000, lifeN: 0 })

    expect(known({ c1: 'card-14558127-2' })).not.toBeNull()
    expect(message(wire({ type: 'draw', count: 1 }, { c3: 'card-5-1' }))).not.toBeNull()

    for (const key of INHERITED) {
      expect(known({ [key]: 'card-1-1' }), key).toBeNull()
      expect(message(wire({ type: 'draw', count: 1 }, { [key]: 'card-1-1' })), key).toBeNull()
    }

    for (const value of ['constructor', 'card-', 'card-1', 'card-x-1', 'token-1', 'c1', 'card-1-1; drop', 'https://evil.example/x.jpg', 'card-1234567890123-1']) {
      expect(known({ c1: value }), value).toBeNull()
    }
  })

  it('un mensaje con un id de carta heredado no llega a ningún lado: ni a la mesa del rival ni a lo que se revela', () => {
    // El reflejo del rival sólo se arma con lo que pasó la revisión, así que una clave heredada nunca figura entre lo conocido.
    const parsed = message({ t: 'sync', n: 0, known: { c1: 'card-9-1' }, lp: 8000, lifeN: 0 })

    expect(parsed).not.toBeNull()
    expect(parsed?.t === 'sync' && Object.keys(parsed.known)).toEqual(['c1'])
  })
})

describe('nombres y chat de otra persona', () => {
  const message = (value: unknown) => parseMessage(JSON.stringify(value))

  it('no llevan controles, ni el espacio de ancho cero, ni las marcas que dan vuelta el texto', () => {
    const hidden = '\u0000\u001f\u007f\u0085\u009f\u200b\u2028\u2029\u202a\u202b\u202c\u202d\u202e\u2060\u2066\u2067\u2068\u2069\ufeff'

    expect(cleanName(`A${hidden}na`)).toBe('Ana')
    expect(cleanName(`${hidden}`)).toBe('')
    expect(cleanChat(`\u202egnirts${hidden} ok`)).toBe('gnirts ok')
    expect(message({ t: 'hello', v: 1, sid: 'sid-1', role: 'host', name: `Ana\u202e\u200b` })).toMatchObject({ name: 'Ana' })
    expect(message({ t: 'chat', n: 1, text: '\u202ehola\u200b' })).toMatchObject({ text: 'hola' })
    expect(message({ t: 'chat', n: 1, text: '\u202e\u200b' })).toBeNull()
  })

  it('los emoji compuestos y el texto de escrituras que usan el unidor siguen enteros', () => {
    expect(cleanChat('👨\u200d👩\u200d👧 ok')).toBe('👨\u200d👩\u200d👧 ok')
    expect(cleanName('گچ\u200cپ')).toBe('گچ\u200cپ')
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

describe('señalar', () => {
  const parse = (value: unknown) => parseMessage(JSON.stringify(value))

  it('llega una carta (id opaco) o una pila, de su lado o del mío', () => {
    expect(parse({ t: 'ping', n: 1, at: 'yours', card: 'c7' })).toEqual({ t: 'ping', n: 1, at: 'yours', card: 'c7' })
    expect(parse({ t: 'ping', n: 2, at: 'mine', card: 'token-3' })).toEqual({ t: 'ping', n: 2, at: 'mine', card: 'token-3' })
    expect(parse({ t: 'ping', n: 3, at: 'yours', pile: 'hand' })).toEqual({ t: 'ping', n: 3, at: 'yours', pile: 'hand' })
  })

  it('lo mal formado se descarta: las dos cosas o ninguna, ids que no son ids, pilas que no existen, de quién es, el número', () => {
    expect(parse({ t: 'ping', n: 1, at: 'yours' })).toBeNull()
    expect(parse({ t: 'ping', n: 1, at: 'yours', card: 'c1', pile: 'gy' })).toBeNull()
    expect(parse({ t: 'ping', n: 1, at: 'yours', card: 'card-123-1' })).toBeNull()
    expect(parse({ t: 'ping', n: 1, at: 'yours', card: '__proto__' })).toBeNull()
    expect(parse({ t: 'ping', n: 1, at: 'yours', pile: 'mz' })).toBeNull()
    expect(parse({ t: 'ping', n: 1, at: 'theirs', card: 'c1' })).toBeNull()
    expect(parse({ t: 'ping', n: 0, at: 'yours', card: 'c1' })).toBeNull()
    expect(parse({ t: 'ping', at: 'yours', card: 'c1' })).toBeNull()
  })
})
