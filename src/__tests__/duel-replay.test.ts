import { deflateRawSync } from 'node:zlib'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { comboFileText, encodeComboPayload, buildComboLink } from '../app/combo-share'
import { buildDuelReplay, duelReplayAt, walkReplay, type DuelReplay, type ReplayInput } from '../app/duel-replay'
import {
  buildReplayLink,
  decodeReplayPayload,
  encodeReplayPayload,
  MAX_SAVED_REPLAYS,
  parseReplayText,
  readSavedReplays,
  readShared,
  replayFileName,
  replayFileText,
  replayPayloadOf,
  saveReplay,
} from '../app/duel-replay-share'
import { mapMatIds, openPublic, type WireAct } from '../app/mat-public'
import { createMatState, replayMat, type MatAction } from '../app/practice-mat'
import { createSavedCombo } from '../app/saved-combos'

// Un duelo chico: mi deck (ids reales) y el del rival como me llega (opaco), con una jugada de cada uno intercalada.
const deck = Array.from({ length: 20 }, (_, i) => `card-${14558127 + (i % 7) * 1000}-${Math.floor(i / 7) + 1}`)
const mine = createMatState(deck, ['card-90000000-1'], 5)
const theirs = createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5)
const [h0, h1, h2, h3] = mine.hand as [string, string, string, string]
const myActions: MatAction[] = [
  { type: 'phase', phase: 'main1' },
  { type: 'place', id: h0, zone: 'mz', index: 0, pos: 'atk', how: 'normal' },
  { type: 'place', id: h1, zone: 'st', index: 0, pos: 'set' },
  { type: 'activate', id: h2 },
  { type: 'move', id: h2, to: 'gy' },
  { type: 'move', id: deck[10]!, to: 'hand' },
  { type: 'phase', phase: 'end' },
]
const rivalActs: WireAct[] = [
  { action: { type: 'draw', count: 1 }, reveal: {} },
  { action: { type: 'place', id: 'c6', zone: 'mz', index: 2, pos: 'atk', how: 'normal' }, reveal: { c6: 'card-55144522-1' } },
  { action: { type: 'attack', id: 'c6', target: h0 }, reveal: {} },
]
const order: ReplayInput['order'] = ['mine', 'mine', 'mine', 'mine', 'mine', 'mine', 'mine', 'theirs', 'theirs', 'theirs']
const input: ReplayInput = {
  mode: 'solo-auto',
  view: 'public',
  players: ['Ana', 'Beto'],
  starter: 0,
  mine: { initial: mine, actions: myActions },
  theirs: { initial: theirs, acts: rivalActs },
  order,
  life: [{ at: 0, lp: [8000, 8000] }, { at: 10, lp: [7200, 8000] }],
  nameOf: (code) => `Carta ${code}`,
  result: { winner: 1, reason: 'lp' },
  now: new Date('2026-10-29T12:00:00Z'),
}
const replay = buildDuelReplay(input)
const envelope = (inner: unknown, extra = {}) => ({ app: 'ygoultralab', kind: 'duel', v: 1, replay: inner, ...extra })
const text = (inner: unknown, extra = {}) => JSON.stringify(envelope(inner, extra))
const toPayload = (value: unknown) => `j${Buffer.from(JSON.stringify(value)).toString('base64url')}`

describe('el replay de un duelo', () => {
  it('termina en las dos mesas del duelo (la mía con ids opacos), con las vidas y el turno', () => {
    const { opaque } = openPublic(mine).sender
    const end = duelReplayAt(replay, replay.steps.length, walkReplay(replay))

    expect(end.states[0]).toEqual(mapMatIds(replayMat(mine, myActions), (id) => opaque[id] ?? id))
    expect(end.states[1]).toEqual(replayMat(theirs, rivalActs.map((act) => act.action)))
    expect(end.lp).toEqual([7200, 8000])
    expect(duelReplayAt(replay, 9).lp).toEqual([8000, 8000])
    // Mi End Phase y el turno siguiente: el del rival.
    expect(duelReplayAt(replay, 6).turn).toBe(0)
    // El ataque del rival apunta a mi carta por su id opaco.
    expect(replay.steps[9]![1]).toEqual({ type: 'attack', id: 'c6', target: opaque[h0] })
    expect(replay.cards['55144522']).toBe('Carta 55144522')
  })

  it('vista pública: ninguna carta sin mostrar lleva su id real; con «mi mano», la mano y lo boca abajo sí, el deck no', () => {
    const json = replayFileText(replay)
    const shown = new Set(Object.values(replay.sides[0].reveal).concat(replay.steps.flatMap((step) => Object.values(step[2] ?? {}))))

    expect((json.match(/card-\d+-\d+/g) ?? []).filter((id) => !shown.has(id))).toEqual([])
    // La colocada boca abajo y la mano no se ven; lo activado, sí (y queda en el cementerio).
    expect(json).not.toContain(h1)
    expect(json).not.toContain(h3)
    expect(shown.has(h2)).toBe(true)

    const withMine = buildDuelReplay({ ...input, view: 'mine' })
    const hidden = new Set(Object.values(withMine.hidden ?? {}))
    expect(hidden.has(h1) && hidden.has(h3) && hidden.has(deck[10]!)).toBe(true)
    expect(hidden.has(deck[19]!)).toBe(false)
  })

  it('ida y vuelta por enlace y por archivo; el enlace se reconoce entero o por el hash', async () => {
    const payload = await encodeReplayPayload(replay)
    const link = buildReplayLink('https://ygoultralab.app', '/', payload)

    expect(replayPayloadOf(link)).toBe(payload)
    expect(replayPayloadOf('https://x.app/#combo=zAbC')).toBeNull()
    expect(await decodeReplayPayload(payload)).toEqual({ ok: true, replay })
    expect(await decodeReplayPayload(toPayload(envelope(replay)))).toEqual({ ok: true, replay })
    expect(parseReplayText(replayFileText(replay))).toEqual({ ok: true, replay })
    expect(replayFileName(replay, 'Ana vs Beto')).toBe('Ana-vs-Beto-2026-10-29.ygolab-duel.json')
  })

  it('un solo «Abrir archivo»: elige por el tipo (duelo o combo), del archivo o del enlace', async () => {
    const combo = createSavedCombo({ name: 'Línea', deckName: 'Deck', initial: mine, actions: myActions, nameOf: () => 'X' }, [])

    expect(await readShared(replayFileText(replay))).toEqual({ ok: true, kind: 'duel', replay })
    expect(await readShared(buildReplayLink('https://x.app', '/', await encodeReplayPayload(replay)))).toEqual({ ok: true, kind: 'duel', replay })
    expect(await readShared(await encodeReplayPayload(replay))).toEqual({ ok: true, kind: 'duel', replay })
    expect(await readShared(comboFileText(combo))).toMatchObject({ ok: true, kind: 'combo' })
    expect(await readShared(buildComboLink('https://x.app', '/', await encodeComboPayload(combo)))).toMatchObject({ ok: true, kind: 'combo' })
    expect(await readShared('hola')).toEqual({ ok: false, error: 'notReplay' })
  })

  it('las entradas hostiles no rompen ni lanzan: dicen qué pasó', async () => {
    const plain = JSON.parse(JSON.stringify(replay)) as DuelReplay
    const hostile: Array<[string, string]> = [
      ['{', 'notReplay'],
      ['null', 'notReplay'],
      [JSON.stringify({ app: 'otra', kind: 'duel', v: 1, replay }), 'notReplay'],
      [text(replay, { kind: 'combo' }), 'notReplay'],
      [text(replay, { v: 2 }), 'newer'],
      [text(replay, { v: 0 }), 'broken'],
      [text({ ...plain, steps: Array.from({ length: 6001 }, () => [0, { type: 'draw', count: 1 }]) }), 'broken'],
      [text({ ...plain, steps: [[2, { type: 'draw', count: 1 }]] }), 'broken'],
      [text({ ...plain, steps: [[0, { type: 'nuke' }]] }), 'broken'],
      [text({ ...plain, steps: [[0, { type: 'draw', count: 1 }, { c1: 'https://evil.example/x.png' }]] }), 'broken'],
      [text({ ...plain, steps: [[0, { type: 'draw', count: 1 }, {}, 'extra']] }), 'broken'],
      [text({ ...plain, life: [[0, 8000, 8000], [999, 1, 1]] }), 'broken'],
      [text({ ...plain, life: [[3, 8000, 8000]] }), 'broken'],
      [text({ ...plain, players: ['Ana'] }), 'broken'],
      [text({ ...plain, players: ['x'.repeat(500), 'Beto'] }), 'broken'],
      [text({ ...plain, players: ['Ana', 7] }), 'broken'],
      [text({ ...plain, starter: '0' }), 'broken'],
      [text({ ...plain, sides: [plain.sides[0], { ...plain.sides[1], initial: { ...plain.sides[1].initial, hand: ['__proto__'] } }] }), 'broken'],
      [text({ ...plain, cards: JSON.parse('{"__proto__":"x"}') as Record<string, string> }), 'broken'],
      [text({ ...plain, cards: { constructor: 'x' } }), 'broken'],
      [text({ ...plain, view: 'mine', hidden: { 'card-1-1': 'card-1-1' } }), 'broken'],
      [text({ ...plain, savedAt: 'ayer' }), 'broken'],
      ['{"app":"ygoultralab","kind":"duel","v":1,"replay":{"__proto__":{"polluted":true}}}', 'broken'],
    ]

    for (const [value, error] of hostile) expect(parseReplayText(value), value.slice(0, 80)).toEqual({ ok: false, error })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()

    // Una bomba de deflate (64 MB de ceros): se corta al pasar el tope, sin inflarla entera.
    expect(await decodeReplayPayload(`z${deflateRawSync(Buffer.alloc(64 * 1024 * 1024)).toString('base64url')}`)).toEqual({ ok: false, error: 'tooBig' })
    expect(await decodeReplayPayload('z' + 'A'.repeat(300_000))).toEqual({ ok: false, error: 'tooBig' })
    expect(await decodeReplayPayload('z!!!')).toEqual({ ok: false, error: 'broken' })
    expect(await readShared('https://x.app/#replay=zAAAA')).toEqual({ ok: false, error: 'broken' })
  })

  it('copia sólo los campos conocidos; sin «mi mano» no hay `hidden` aunque venga', () => {
    const withExtras = { ...replay, evil: 1, sides: [{ ...replay.sides[0], evil: 2 }, replay.sides[1]], hidden: { c1: 'card-1-1' } }
    const result = parseReplayText(text(withExtras))
    expect(result.ok && JSON.stringify(result.replay).includes('evil')).toBe(false)
    expect(result.ok && result.replay.hidden).toBeUndefined()
  })
})

describe('los replays guardados', () => {
  // Un `localStorage` en memoria (el entorno de node no tiene).
  const memory = new Map<string, string>()
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value) }

  beforeEach(() => {
    memory.clear()
    vi.stubGlobal('localStorage', storage)
  })

  it('se guardan comprimidos arriba de la lista; al pasar el tope se va el más viejo y se avisa', async () => {
    for (let i = 0; i < MAX_SAVED_REPLAYS; i += 1) expect((await saveReplay(replay)).dropped).toBe(false)
    const oldest = readSavedReplays().at(-1)!.id
    const last = await saveReplay(replay)

    expect(last.dropped).toBe(true)
    const list = readSavedReplays()
    expect(list).toHaveLength(MAX_SAVED_REPLAYS)
    expect(list[0]).toMatchObject({ id: last.saved!.id, players: ['Ana', 'Beto'], steps: 10, result: { winner: 1, reason: 'lp' } })
    expect(list.some((item) => item.id === oldest)).toBe(false)
    expect(await decodeReplayPayload(list[0]!.payload)).toEqual({ ok: true, replay })
  })

  it('lo guardado roto se descarta, y sin almacenamiento no se rompe nada', async () => {
    localStorage.setItem('ygo-lab:duel-replays', JSON.stringify([{ id: 'x', payload: 'nope' }, 'basura']))
    expect(readSavedReplays()).toEqual([])
    localStorage.setItem('ygo-lab:duel-replays', '{')
    expect(readSavedReplays()).toEqual([])

    vi.stubGlobal('localStorage', { ...storage, setItem: () => { throw new Error('QuotaExceededError') } })
    expect(await saveReplay(replay)).toEqual({ saved: null, dropped: false })
  })
})
