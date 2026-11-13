import { describe, expect, it } from 'vitest'

import { comboExtrasFromAuto } from '../app/auto/auto-replay'
import type { ChainStep } from '../app/auto/chain-feed'
import { compactEnvelope, decodeComboPayload, encodeComboPayload, parseComboText } from '../app/combo-share'
import type { WireAct } from '../app/mat-public'
import { createMatState, type MatAction } from '../app/practice-mat'
import { comboChainSteps, comboTheirsAt, createSavedCombo, migrateSavedCombo, type SavedCombo } from '../app/saved-combos'
import { comboScenes } from '../components/replays/video/video-combo'
import { placeRect, replayScenes } from '../components/replays/video/video-scene'
import { buildDuelReplay } from '../app/duel-replay'
import { chainMs, chainTimeline, frameDurations, subjectChain } from '../components/replays/video/video-timeline'

// Un combo de «Jugar solo automático» contra el bot pasivo: la mano de apertura (plegada), paso a la Main, invoco h0, le doy h1 (un Kaiju: el rival lo toma en su zona 3) y activo h2,
// que hace una cadena de un eslabón. Después el rival empieza su turno (eso ya no es del combo).
const deck = Array.from({ length: 20 }, (_, i) => `card-${[14558127, 23434538, 55144522, 83764718, 73642296][i % 5]}-${Math.floor(i / 5) + 1}`)
const opening = createMatState(deck, [], 0)
const hand = deck.slice(0, 5)
const [h0, h1, h2] = hand as [string, string, string]
const mineActions: MatAction[] = [
  { type: 'draw', count: 5 },
  { type: 'phase', phase: 'main1' },
  { type: 'place', id: h0, zone: 'mz', index: 0, pos: 'atk', how: 'normal' },
  { type: 'give', id: h1, auto: true },
  { type: 'activate', id: h2 },
  { type: 'move', id: h2, to: 'gy' },
]
const theirsInitial = createMatState(Array.from({ length: 40 }, (_, i) => `c${i + 1}`), [], 0)
const theirsActs: WireAct[] = [
  { action: { type: 'draw', count: 5 }, reveal: {} },
  { action: { type: 'take', id: `f.${h1}`, zone: 'mz', index: 2, pos: 'atk' }, reveal: {} },
  { action: { type: 'phase', phase: 'draw' }, reveal: {} },
  { action: { type: 'draw', count: 1 }, reveal: {} },
]
const order = ['theirs', 'mine', 'mine', 'mine', 'mine', 'theirs', 'mine', 'mine', 'theirs', 'theirs'] as const
// La cadena llega con la activación de h2 (4 jugadas tuyas hechas: la 3 del combo, contando sin la mano de apertura).
const chainSteps: ChainStep[] = [
  { kind: 'chain', at: 5, seq: 7, index: 0, link: { card: { side: 'mine', id: h2 }, code: 55144522, mine: true, place: { side: 'mine', location: 8, sequence: 1 } } },
  { kind: 'solving', at: 5, seq: 7, index: 0 },
  { kind: 'solved', at: 5, seq: 7, index: 0, outcome: { kind: 'draw', count: 2 } },
  { kind: 'end', at: 6, seq: 8, index: -1 },
  // Del turno del rival: no entra.
  { kind: 'chain', at: 6, seq: 9, index: 0, link: { card: null, code: 14558127, mine: false } },
]
const snap = { initial: { mine: opening, theirs: theirsInitial }, theirsActs, order: [...order], chainSteps, names: { 55144522: 'Pot of Greed', 14558127: 'Ash Blossom & Joyous Spring' } }
const nameOf = (id: string) => `Carta ${id}`

function recorded(count = 5): SavedCombo {
  const extras = comboExtrasFromAuto(snap, 1, count)
  return createSavedCombo({ name: 'Kaiju y cadena', deckName: 'Prueba', initial: { ...opening, hand: [...hand] }, actions: mineActions.slice(1, 1 + count), nameOf, auto: true, extras }, [], new Date('2026-11-13T12:00:00Z'))
}

describe('el combo de «Jugar solo automático» guarda el campo del rival y la cadena', () => {
  it('el rival: su mesa al empezar (con su mano robada) y la carta que le di, en la jugada en que pasa, con su casilla y su posición; nada de su turno', () => {
    const combo = recorded()

    expect(combo.theirs?.initial.hand).toHaveLength(5)
    expect(combo.theirs?.steps).toEqual([[3, { type: 'take', id: `f.${h1}`, zone: 'mz', index: 2, pos: 'atk' }]])
    expect(comboTheirsAt(combo.theirs, 2)?.state.mz[2]).toBeNull()
    expect(comboTheirsAt(combo.theirs, 3)?.state.mz[2]).toMatchObject({ id: `f.${h1}`, pos: 'atk' })
    expect(comboTheirsAt(combo.theirs, 5)?.state.deck).toHaveLength(35)
  })

  it('la cadena: sus mensajes con `at` en jugadas del combo (la 4: la activación de h2 es la jugada 4 con la mano plegada), sin la del turno del rival; con los nombres de sus cartas', () => {
    const combo = recorded()

    expect(combo.chain?.map((item) => [item.at, item.kind])).toEqual([[4, 'chain'], [4, 'solving'], [4, 'solved'], [5, 'end']])
    expect(combo.chain?.[0]?.link).toEqual({ code: 55144522, side: 0, place: [0, 8, 1] })
    expect(comboChainSteps(combo)[0]).toMatchObject({ kind: 'chain', at: 4, link: { code: 55144522, mine: true, place: { side: 'mine', location: 8, sequence: 1 } } })
    expect(combo.names['card-55144522-1']).toBe('Pot of Greed')
  })

  it('sólo si hace falta: sin carta en el campo del rival no va su lado, y sin cadena no va la cadena', () => {
    const before = recorded(2)

    expect(before.theirs).toBeUndefined()
    expect(before.chain).toBeUndefined()
    expect(Object.keys(before)).not.toContain('theirs')
  })

  it('un combo viejo (sin rival ni cadena) migra igual que hoy; uno nuevo conserva los dos; uno con el rival roto se abre sin él', () => {
    const old = createSavedCombo({ name: 'Viejo', deckName: 'Prueba', initial: opening, actions: mineActions.slice(1, 3), nameOf }, [])
    const fresh = recorded()

    expect(migrateSavedCombo(old)).toEqual(old)
    expect(migrateSavedCombo(fresh)).toEqual(fresh)
    const { theirs: _theirs, chain: _chain, ...rest } = fresh
    expect(migrateSavedCombo({ ...fresh, theirs: { initial: fresh.initial, reveal: {} } as never, chain: 'x' as never })).toEqual(rest)
  })

  it('ida y vuelta por enlace: un combo con rival y cadena va en v4 y vuelve igual (sin los nombres, como siempre); uno sin nada de eso sigue en v2', async () => {
    const combo = recorded()
    const { id: _id, names: _names, ...shared } = combo
    const read = await decodeComboPayload(await encodeComboPayload(combo))

    expect(compactEnvelope(combo).v).toBe(4)
    expect(read).toEqual({ ok: true, combo: { ...shared, names: {} } })
    expect(compactEnvelope(recorded(2)).v).toBe(2)
  })

  it('el enlace crece poco: el rival con la carta entregada y la cadena suman menos de 120 caracteres', async () => {
    const combo = recorded()
    const { theirs: _theirs, chain: _chain, ...plain } = combo
    const [withAll, without] = [await encodeComboPayload(combo), await encodeComboPayload(plain)]

    // Medido: 265 → 351 (el rival, +59, con lo que nadie vio de su Deck y su mano como un solo id repetido; la cadena de 4 mensajes, +31).
    expect(withAll.length - without.length).toBeLessThan(120)
  })

  it('el video: la mesa entera como la de un duelo, con la carta que le di en su zona (arriba, de cabeza, boca arriba y con su nombre) desde la jugada en que la toma', () => {
    const combo = recorded()
    const scenes = [...comboScenes(combo, combo.names, 720)]
    const card = (n: number) => scenes[n]!.sides[1].slots.find((slot) => slot.card?.id === `f.${h1}`)

    // Las 5 filas del duelo (32 casillas, como `sceneAt`), no las 3 de tu mitad.
    expect(scenes[3]!.cells).toHaveLength(32)
    expect(card(2)).toBeUndefined()
    expect(card(3)?.card).toMatchObject({ faceDown: false, upsideDown: true, name: `Carta ${h1}` })
    // Su zona 3, espejada (en su fila de monstruos), donde va también su medallón de la cadena.
    expect(card(3)?.rect).toEqual(placeRect(scenes[3]!.layout, 1, 'mz:2'))
    // Su mano robada, de dorso.
    expect(scenes[3]!.sides[1].hand.map((slot) => slot.card?.faceDown)).toEqual([true, true, true, true, true])
  })

  it('el video: la jugada de darle la carta la marca con el aro ámbar en el campo del rival (en el combo y en el duelo)', () => {
    const combo = recorded()
    const scenes = [...comboScenes(combo, combo.names, 720)]
    const given = placeRect(scenes[3]!.layout, 1, 'mz:2')

    expect(scenes[3]!.focus).toContainEqual(given)
    // El duelo: le doy h1 y el rival la toma en su zona 3 en su propio paso, el siguiente (en el de darla todavía no está allá); ése la marca.
    const replay = buildDuelReplay({
      mode: 'solo-auto',
      view: 'public',
      players: ['Ana', 'Beto'],
      starter: 0,
      mine: { initial: { ...opening, hand: [...hand], deck: opening.deck.filter((id) => !hand.includes(id)) }, actions: [{ type: 'give', id: h1, auto: true }] },
      theirs: { initial: theirsInitial, acts: [{ action: { type: 'take', id: `f.${h1}`, zone: 'mz', index: 2, pos: 'atk' }, reveal: {} }] },
      order: ['mine', 'theirs'],
      life: [{ at: 0, lp: [8000, 8000] }],
      nameOf: (code) => `Carta ${code}`,
    })
    const duel = [...replayScenes(replay, 720)]

    expect(duel.map((scene) => scene.focus.some((rect) => rect.x === given.x && rect.y === given.y))).toEqual([false, false, true])
  })

  it('la línea de tiempo del video: la jugada con la cadena dura lo que tarda en contarse (`chainMs`) y sus momentos salen en `chainTimeline`, como en el video de un duelo', () => {
    const combo = recorded()
    const subject = { kind: 'combo' as const, combo }
    const { chain: _chain, ...plain } = combo
    const durations = frameDurations(subject)
    const steps = subjectChain(subject)
    const starts = durations.reduce<number[]>((list, ms) => [...list, list.at(-1)! + ms], [0])

    expect(steps).toEqual(comboChainSteps(combo))
    expect(durations[4]! - frameDurations({ kind: 'combo', combo: plain })[4]!).toBe(chainMs(steps, 4))
    expect(chainMs(steps, 4)).toBeGreaterThan(0)
    // Los momentos de la cadena caen en el tramo de la jugada 4 (y el `end`, en el de la 5).
    const beats = chainTimeline(steps, starts)
    expect(beats.length).toBeGreaterThan(0)
    expect(beats.filter((beat) => beat.t >= starts[4]! && beat.t < starts[5]!).length).toBeGreaterThan(0)
    expect(beats.find((beat) => beat.seen > 0)?.t).toBe(starts[4])
  })

  it('lo raro de afuera no entra: un paso del rival fuera de orden, una cadena con `at` de más o un id con forma rara', () => {
    const envelope = (patch: (c: unknown[]) => void) => {
      const value = compactEnvelope(recorded())
      patch(value.c as unknown[])
      return parseComboText(JSON.stringify(value))
    }

    expect(envelope(() => {}).ok).toBe(true)
    expect(envelope((c) => ((c[8] as unknown[][])[2] = [[9, 0], [1, 0]])).ok).toBe(false)
    expect(envelope((c) => ((c[9] as unknown[][])[0]![0] = 99)).ok).toBe(false)
    expect(envelope((c) => ((c[3] as unknown[][])[1] = ['__proto__'])).ok).toBe(false)
  })
})
