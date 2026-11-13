import { deflateRawSync } from 'node:zlib'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { replayChain } from '../app/auto/auto-replay'
import { encodeComboPayload, buildComboLink, packPayload, unpackPayload } from '../app/combo-share'
import { buildDuelReplay, duelReplayAt, walkReplay, type DuelReplay, type ReplayChainStep, type ReplayInput } from '../app/duel-replay'
import {
  buildReplayLink,
  compactReplayEnvelope,
  decodeReplayPayload,
  encodeReplayLinkPayload,
  encodeReplayPayload,
  MAX_SAVED_REPLAYS,
  parseReplayText,
  readSavedReplays,
  readShared,
  replayCodes,
  replayEnvelope,
  replayPayloadOf,
  resolveReplayNames,
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
    const json = JSON.stringify(replayEnvelope(replay))
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

  it('ida y vuelta por enlace; el enlace se reconoce entero o por el hash', async () => {
    const payload = await encodeReplayPayload(replay)
    const link = buildReplayLink('https://ygoultralab.app', '/', payload)

    expect(replayPayloadOf(link)).toBe(payload)
    expect(replayPayloadOf('https://x.app/#combo=zAbC')).toBeNull()
    expect(await decodeReplayPayload(payload)).toEqual({ ok: true, replay })
    expect(await decodeReplayPayload(toPayload(envelope(replay)))).toEqual({ ok: true, replay })
    expect(parseReplayText(JSON.stringify(replayEnvelope(replay)))).toEqual({ ok: true, replay })
  })

  it('un solo «Pegar enlace»: elige por el tipo (duelo o combo); el JSON pegado ya no se lee (el archivo del duelo es un video)', async () => {
    const combo = createSavedCombo({ name: 'Línea', deckName: 'Deck', initial: mine, actions: myActions, nameOf: () => 'X' }, [])

    expect(await readShared(JSON.stringify(replayEnvelope(replay)))).toEqual({ ok: false, error: 'notReplay' })
    expect(await readShared(buildReplayLink('https://x.app', '/', await encodeReplayPayload(replay)))).toEqual({ ok: true, kind: 'duel', replay })
    expect(await readShared(await encodeReplayPayload(replay))).toEqual({ ok: true, kind: 'duel', replay })
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
      [text(replay, { v: 4 }), 'newer'],
      // Un v2 trae `d`, no `replay`.
      [text(replay, { v: 2 }), 'broken'],
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

/** Un enlace v1 de verdad: el duelo de arriba, escrito con el código de antes de v2. Tiene que abrir siempre igual. */
const V1_LINK =
  'https://ygoultralab.app/#replay=z3VVNj9owEP0r1Tubyk4JC75t-xfaS1EOs4l3sTB2FDtQFuW_V-MAC5TuSj328qTxfLzxm3FyALUtNPYvoXepI0dPEFhb30Cj6Y2DwBZaCXSmdbSHPiDS1jSPCRqFLGYTJSfF4rsqtJRays9Syp8Q2ITGQCMGFybUp8B1rNlBo-2fnK0hwPVMF6GXePQEga8mBVQCMVGXTActBaJtDIccYL1Nlhx30Jh6zWm1gkBdMHxhmDKUDDOGB4Y5w4JByYw5R-UklbNUTlMlU5tfqaOx9IztFbESbOZiKldTuVyRyxWKw1720MtK4Im8jSvTjNbmFXrpe-fEHWCy64B88_cznq1xDXQ-Qgpr42NWqV1RZLmbjnYQSH3n89CeqTZN2Pmxn3y5H-1oJOpeTBpbHXi8W5PFHQZxX-t_klRkIcVf9LsQ_Erru1P932TOfZiWl3spxQFp33LtkeONa0PWKwyVuApyVHOQ5Wc6avsafA5_5WPfmF9jxyFCg9IaAqvAz8-HbkMOPGVO1KipayZqWpZzVTxMPqKav1HFdIcqmnRbgepkt5QuiiyO9IsL-pm8S78J26tEngc0b8J7gbNTXN6pTDa75FLMVfxx1RvpDedWYqneQo6Tr0PvE7S68V5rNbs_leKjqZw7LUs1nZZFcVTlgohSonp9fd28aMd1GKpKwNlnMy7XXMoRuIoUD8XJrERmivzQTysAjW_UJfp0PhA4zefSNx6MPnXrU6PvdIOz73yQ30LsXWLqnfWev_f5N0MxeGi4FsMw_AY'

/** El mismo duelo con todo lo que el de arriba no usa: «mi mano» (`hidden`), lo que ya se veía del rival, otro modo y un apodo con comillas. */
const rich = buildDuelReplay({ ...input, view: 'mine', mode: 'link', players: ['Ana', 'Beto «el rival»'], theirs: { ...input.theirs, reveal: { c20: 'card-77-1' } } })

/**
 * Un enlace v2 de verdad: `rich`, escrito con el código del primer v2. El orden de `d` (y `ENUMS` y `FIELDS` del combo) es el formato: cambiarlo en vez de agregar al final
 * rompe esta prueba antes que los enlaces ya compartidos. **No se regenera para que pase**: con un formato nuevo (v3) se suma otra constante y ésta se queda como está.
 */
const V2_LINK =
  'https://ygoultralab.app/#replay=zfVJBjtswDPxKwPMcNJRk2bm1fYagg7sJimBVbxAkCxRFX9Qn9LYvK0jHQNJDfRiPac6QEvlT5vNZ9vLj29utXy9zn78K5PW0HGQvh9uxC-Rd9go5yL6yTFFL1mAPpJ-WV4F8Py1HQZVPyyyQz8fr2-7j97HvLqf3uX_8kYaAWksBU84j1ckQjFRjNKYNOTOlrOp505an1NJQ5YUCeVGDaJAMssFgUAxGg8mAwdE1dBFdRZfRdXQhXUmX0rXqWqW0hlrriAkMIEEFI5jADA5gAUdwggYoodpQNRokaIYOsHONDcutd7P6rxga8SBsqA1Pte8-ZmQ1CoLzYFaaG2pAMoeIgADGLZKREex-qxvp4CxaGYY7Z8S0JqwdV5qFv5P9jNDNk9699erlaSUt0w2tSra_yZtnRL43OdrGGJhFQNHt02b7Zb5c512xSax025THgG_MU4CPgW17njymfyW2TeKnkH6WdVa0Oxq8fZtYhI4o6yHar78'

/** El mismo `rich` en un enlace v2 sin nombres (la lista vacía), el que se comparte desde que el enlace no los lleva. **No se regenera para que pase**, como `V2_LINK`. */
const V2_LINK_SIN_NOMBRES =
  'https://ygoultralab.app/#replay=zfVJLTsMwFLwKeutZeJ7tOOkOrmF5EdoKVTWhQhQJIU7EEdhxMvReWgk2ZDEZx28-tvIu8-kkG3l7eDr3l-e5z_cCOR6WnWxkd953gbzKRiE72VSWKWrJGuyB9MNyFMjjYdkLqtwus0Du9i9PN9-f-37zfHid-_eXNATUWgqYch6pToZgpBqjMW3ImSllVZ-brnNKLQ1VthTIVg2iQTLIBoNBMRgNJgMGR9fQRXQVXUbX0YV0JV1K16prldIaaq0jJjCABBWMYAIzOIAFHMEJGqCEakPVaJCgGTrAzjU2LOfezepfMTTil7ChNvzJvviYkWUUBOfBrDQ31IBkDhEBAYzXLxkZwe63upEOzqLFMFw4I6Z1YG1caRb-TrYZoVdPenvr6vG0SJt0Q0vJtpu8PCPypeRof4yBWQQUvS7XgxLST7LeHa3z4HZ2gxE6oqym7eMH'

describe('el enlace v2 (la forma compacta del combo)', () => {
  it('los enlaces ya compartidos abren siempre igual: v1 y v2 con sus nombres, v2 sin nombres sin ellos', async () => {
    expect(await readShared(V1_LINK)).toEqual({ ok: true, kind: 'duel', replay })
    expect(await readShared(V2_LINK)).toEqual({ ok: true, kind: 'duel', replay: rich })
    expect(await readShared(V2_LINK_SIN_NOMBRES)).toEqual({ ok: true, kind: 'duel', replay: { ...rich, cards: {} } })
  })

  it('el enlace va sin nombres (v2, la lista vacía) y más corto; lo guardado los conserva', async () => {
    for (const item of [replay, rich]) {
      const link = await encodeReplayLinkPayload(item)
      const json = (await unpackPayload(link, 1e6) as { text: string }).text
      const envelope = JSON.parse(json) as { v: number; d: unknown[] }

      expect(envelope.v).toBe(2)
      expect(envelope.d[11]).toEqual([])
      expect(json).not.toMatch(/Carta \d/)
      expect(link.length).toBeLessThan((await encodeReplayPayload(item)).length)
      expect(await decodeReplayPayload(link)).toEqual({ ok: true, replay: { ...item, cards: {} } })
      // La tabla es la misma: sacar los nombres no cambia qué cartas se ven.
      expect(replayCodes(item)).toEqual((compactReplayEnvelope(item, { names: false }).d[5] as [Array<number | [number, number]>])[0].map((entry) => (Array.isArray(entry) ? entry[0] : entry)))
    }
    expect(JSON.stringify(compactReplayEnvelope(replay, { names: false }))).toEqual(JSON.stringify(compactReplayEnvelope({ ...replay, cards: {} })))
  })

  it('al abrir, los nombres que faltan se piden por passcode, en una sola consulta; sin red o sin respuesta, el mismo replay', async () => {
    const opened = { ...rich, cards: {} }
    const fetchNames = vi.fn(async (codes: number[]) => new Map(codes.map((code) => [code, `Carta ${code}`])))

    expect(await resolveReplayNames(opened, fetchNames)).toEqual(rich)
    expect(fetchNames).toHaveBeenCalledTimes(1)
    expect([...fetchNames.mock.calls[0]![0]].sort()).toEqual(Object.keys(rich.cards).map(Number).sort())
    // Con todos los nombres no se pide nada.
    expect(await resolveReplayNames(rich, fetchNames)).toBe(rich)
    expect(fetchNames).toHaveBeenCalledTimes(1)
    // Sin red, o si la API no conoce ninguna: el mismo replay («Carta» donde falte).
    expect(await resolveReplayNames(opened, async () => Promise.reject(new Error('offline')))).toBe(opened)
    expect(await resolveReplayNames(opened, async () => new Map())).toBe(opened)
    // Lo que no es un nombre no entra; lo que sí, sí.
    const [first, second, third] = replayCodes(opened)
    const odd = new Map<number, unknown>([[first!, 7], [second!, 'x'.repeat(500)], [third!, 'Ash Blossom']]) as Map<number, string>
    expect((await resolveReplayNames(opened, async () => odd)).cards).toEqual({ [String(third)]: 'Ash Blossom' })
  })

  it('el enlace nuevo es v2, más corto que v1, y va y vuelve igual', async () => {
    for (const item of [replay, rich]) {
      const payload = await encodeReplayPayload(item)
      expect(JSON.parse((await unpackPayload(payload, 1e6) as { text: string }).text)).toMatchObject({ app: 'ygoultralab', kind: 'duel', v: 2 })
      expect(payload.length).toBeLessThan((await packPayload(replayEnvelope(item))).length)
      expect(await decodeReplayPayload(payload)).toEqual({ ok: true, replay: item })
    }
  })

  it('no lleva más que v1: en la vista pública, ni el passcode de lo que no se mostró; «mi mano» sólo con la casilla', () => {
    const shown = new Set([replay.sides, rich.sides].flat().flatMap((side) => Object.values(side.reveal)).concat(replay.steps.flatMap((step) => Object.values(step[2] ?? {}))))
    const codes = (item: DuelReplay) => (compactReplayEnvelope(item).d[5] as [Array<number | [number, number]>, string[]])[0].map((entry) => (Array.isArray(entry) ? entry[0] : entry))
    const passcode = (id: string) => Number(id.split('-')[1])

    expect(codes(replay).every((code) => [...shown].some((id) => passcode(id) === code))).toBe(true)
    expect(codes(replay)).not.toContain(passcode(h1))
    // Con la casilla, lo propio oculto viaja (y sólo así).
    expect(codes(rich)).toContain(passcode(h1))
    expect(compactReplayEnvelope(replay).d).toHaveLength(13)
    // Un `hidden` pegado a un replay público no se lee.
    const forged = compactReplayEnvelope({ ...rich, view: 'public' })
    expect(parseReplayText(JSON.stringify(forged))).toMatchObject({ ok: true, replay: { view: 'public' } })
    expect((parseReplayText(JSON.stringify(forged)) as { replay: DuelReplay }).replay.hidden).toBeUndefined()
  })

  it('las entradas hostiles en v2 no rompen ni lanzan', () => {
    const good = compactReplayEnvelope(rich)
    const withD = (change: (d: unknown[]) => unknown[]) => JSON.stringify({ ...good, d: change([...good.d]) })
    const table = good.d[5] as [unknown[], string[]]
    const hostile = [
      JSON.stringify({ ...good, d: undefined }),
      withD((d) => [...d, 'extra']),
      withD((d) => d.slice(0, 5)),
      withD((d) => d.with(5, [table[0], ['__proto__']])),
      withD((d) => d.with(5, [Array.from({ length: 20 }, () => [1, 99])])),
      withD((d) => d.with(7, [[0], []])),
      withD((d) => d.with(7, [[0, 9999], []])),
      withD((d) => d.with(8, [[2, 0, 1]])),
      withD((d) => d.with(8, [[0, 99]])),
      withD((d) => d.with(9, [[999, 0, 1]])),
      withD((d) => d.with(9, [[0, 0, 1], [0, 0, 1]])),
      withD((d) => d.with(11, [7])),
      withD((d) => d.with(12, [1, 'nuke'])),
      withD((d) => d.with(0, -1)),
    ]

    for (const value of hostile) expect(parseReplayText(value), value.slice(0, 120)).toEqual({ ok: false, error: 'broken' })
  })
})

// La cadena de la jugada 4 (activé h2): CL1 mío desde la Zona de Mágicas, CL2 del rival desde la mano, que la niega; y una que llegó después de la última jugada que entró.
const CHAIN: ReplayChainStep[] = [
  { at: 4, kind: 'chain', index: 0, link: { code: 14560127, side: 0, place: [0, 8, 1] } },
  { at: 4, kind: 'chain', index: 1, link: { code: 14558127, side: 1, place: [1, 2, 0] } },
  { at: 4, kind: 'solving', index: 1 },
  { at: 4, kind: 'solved', index: 1, outcome: { kind: 'draw', count: 1 } },
  { at: 4, kind: 'solving', index: 0 },
  { at: 4, kind: 'negated', index: 0, by: 2 },
  { at: 5, kind: 'solved', index: 0 },
  { at: 5, kind: 'end', index: -1 },
  { at: 11, kind: 'chain', index: 0, link: { code: 0, side: 1 } },
]
const chained = buildDuelReplay({ ...input, chain: CHAIN })

describe('la cadena del duelo automático (v3)', () => {
  it('va hasta la última jugada que entró y nombra sus cartas; sin cadena, el replay no la lleva', () => {
    expect(chained.chain).toEqual(CHAIN.slice(0, -1))
    expect(chained.cards['14558127']).toBe('Carta 14558127')
    expect(replay.chain).toBeUndefined()
  })

  it('del snapshot: cada mensaje en su lugar de `order` (`seq`) y los lados desde quien graba, sin id ni `desc`', () => {
    const link = { card: { side: 'mine' as const, id: 'card-1-1' }, code: 1, mine: true, description: '16', from: 8, place: { side: 'theirs' as const, location: 4, sequence: 2 } }

    expect(replayChain([{ kind: 'chain', at: 2, seq: 4, index: 0, link }, { kind: 'negated', at: 2, seq: 4, index: 0, by: 2 }, { kind: 'end', at: 2, index: -1 }])).toEqual([
      { at: 4, kind: 'chain', index: 0, link: { code: 1, side: 0, place: [1, 4, 2] } },
      { at: 4, kind: 'negated', index: 0, by: 2 },
    ])
  })

  it('ida y vuelta: guardado (v3), en el enlace sin nombres y en la forma v1; uno sin cadena se sigue escribiendo v2', async () => {
    const payload = await encodeReplayPayload(chained)
    const link = await encodeReplayLinkPayload(chained)

    expect(JSON.parse((await unpackPayload(payload, 1e6) as { text: string }).text)).toMatchObject({ v: 3 })
    expect(await decodeReplayPayload(payload)).toEqual({ ok: true, replay: chained })
    expect(await decodeReplayPayload(link)).toEqual({ ok: true, replay: { ...chained, cards: {} } })
    expect(replayCodes(chained)).toContain(14558127)
    expect(parseReplayText(JSON.stringify(replayEnvelope(chained)))).toEqual({ ok: true, replay: chained })
    expect(compactReplayEnvelope(replay)).toMatchObject({ v: 2 })
    // Con «mi mano» también (el lugar de `hidden` va antes que la cadena).
    const both = buildDuelReplay({ ...input, view: 'mine', chain: CHAIN })
    expect(await decodeReplayPayload(await encodeReplayPayload(both))).toEqual({ ok: true, replay: both })
  })

  it('la cadena hostil no rompe ni lanza', () => {
    const good = compactReplayEnvelope(chained)
    const chainAt = (change: (chain: unknown[][]) => unknown) => JSON.stringify({ ...good, d: [...good.d.slice(0, 14), change(good.d[14] as unknown[][])] })
    const plain = JSON.parse(JSON.stringify(chained)) as DuelReplay
    const hostile = [
      chainAt(() => 'x'),
      chainAt((chain) => chain.with(0, [99, 0, 0, null, 0])),
      chainAt((chain) => chain.with(0, [4, 9, 0])),
      chainAt((chain) => chain.with(0, [4, 0, 0, 9999, 0])),
      chainAt((chain) => chain.with(0, [4, 0, 0, null, 2])),
      chainAt((chain) => chain.with(0, [4, 0, 0, null, 0, 0, 8])),
      chainAt((chain) => chain.with(1, [4, 1, 0, 'x'])),
      chainAt((chain) => [...chain, [0, 5, -1]]),
      text({ ...plain, chain: [{ at: 0, kind: 'nuke', index: 0 }] }),
      text({ ...plain, chain: [{ at: 0, kind: 'solved', index: 0, outcome: { kind: 'add', count: 0 } }] }),
    ]

    for (const value of hostile) expect(parseReplayText(value), value.slice(-120)).toEqual({ ok: false, error: 'broken' })
  })

  it('un enlace de un duelo con cadena crece poco', async () => {
    const before = (await encodeReplayLinkPayload(replay)).length
    const after = (await encodeReplayLinkPayload(chained)).length

    expect(after - before).toBeLessThan(80)
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
    // Guardado con los nombres; anota el largo de su enlace, que va sin ellos.
    expect(list[0]!.linkChars).toBe((await encodeReplayLinkPayload(replay)).length)
    expect(list[0]!.linkChars).toBeLessThan(list[0]!.payload.length)
  })

  it('lo guardado roto se descarta, y sin almacenamiento no se rompe nada', async () => {
    localStorage.setItem('ygo-lab:duel-replays', JSON.stringify([{ id: 'x', payload: 'nope' }, 'basura']))
    expect(readSavedReplays()).toEqual([])
    localStorage.setItem('ygo-lab:duel-replays', '{')
    expect(readSavedReplays()).toEqual([])
    const good = { id: 'r', savedAt: '2026-10-29T12:00:00.000Z', players: ['Ana', 'Beto'], steps: 1, payload: 'zAAAA' }
    localStorage.setItem('ygo-lab:duel-replays', JSON.stringify([{ ...good, linkChars: 'mucho' }, good]))
    expect(readSavedReplays()).toEqual([good])

    vi.stubGlobal('localStorage', { ...storage, setItem: () => { throw new Error('QuotaExceededError') } })
    expect(await saveReplay(replay)).toEqual({ saved: null, dropped: false })
  })
})
