import { describe, expect, it } from 'vitest'

import { decodeComboPayload, encodeComboPayload } from '../app/combo-share'
import { parseSave, saveOf } from '../app/duel-save'
import { parseMessage } from '../app/duel-protocol'
import { createDuel, type DuelTransport } from '../app/duel-session'
import { createSpectator } from '../app/duel-spectator'
import { carryMaterials, controlReactions, XYZ_MATERIALS_CAP } from '../app/mat-control'
import { createMatState, isForeignId, matReducer, replayMat, type MatAction, type MatState } from '../app/practice-mat'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'

/** Un Xyz que cambia de manos con sus materiales (`mat-control.ts`): la mesa, las respuestas y dos jugadores de verdad, con y sin la capacidad. */

const deck = (base: number) => Array.from({ length: 12 }, (_, index) => `card-${base + index}-1`)
const hostTable = createMatState(deck(1000), ['card-1900-1'], 5)
const guestTable = createMatState(deck(5000), ['card-5900-1'], 5)
const play = (state: MatState, ...actions: MatAction[]) => actions.reduce(matReducer, state)

const X = 'card-1000-1'
const MATS = ['card-1001-1', 'card-1002-1', 'card-1003-1']
/** Ana con su Xyz en la primera zona y `n` materiales debajo. */
const xyz = (n: number, state = hostTable) => play(state, { type: 'place', id: X, zone: 'mz', index: 0, pos: 'atk' }, ...MATS.slice(0, n).map((id): MatAction => ({ type: 'attach', id, to: X })))

describe('la mesa: dar, tomar y recuperar con materiales', () => {
  it('dar con la lista se lleva los materiales (no van al cementerio); sin la lista, como siempre; los que no están en la lista, al cementerio', () => {
    const base = xyz(2)

    expect(matReducer(base, { type: 'give', id: X, materials: MATS.slice(0, 2) })).toMatchObject({ gy: [], mz: [null, null, null, null, null] })
    expect(matReducer(base, { type: 'give', id: X }).gy).toEqual(MATS.slice(0, 2))
    expect(matReducer(base, { type: 'give', id: X, materials: [MATS[0]!] }).gy).toEqual([MATS[1]])
  })

  it('tomar y recuperar dejan los materiales debajo (sin fichas, sin repetir, sin lo que ya está en la mesa); recuperar a una pila los manda al cementerio', () => {
    const away = play(guestTable, { type: 'give', id: 'card-5000-1' })
    const taken = matReducer(away, { type: 'take', id: 'f.c1', zone: 'mz', index: 2, pos: 'def', materials: ['f.c2', 'card-5000-1', 'token-1', 'f.c2', 'f.c1', 'card-5001-1'] })

    expect(taken.mz[2]).toEqual({ id: 'f.c1', pos: 'def', counters: 0, materials: ['f.c2', 'card-5000-1'] })
    // Al devolverlo, viajan los del dueño (`f.`): lo mío que tenía debajo va a mi cementerio.
    expect(matReducer(taken, { type: 'give', id: 'f.c1', materials: ['f.c2'] })).toMatchObject({ gy: ['card-5000-1'], mz: [null, null, null, null, null] })

    const gone = matReducer(xyz(2), { type: 'give', id: X, materials: MATS.slice(0, 2) })

    expect(matReducer(gone, { type: 'regain', id: X, to: 'mz', index: 3, pos: 'def', materials: MATS.slice(0, 2) }).mz[3]).toEqual({ id: X, pos: 'def', counters: 0, materials: MATS.slice(0, 2) })
    expect(matReducer(gone, { type: 'regain', id: X, to: 'gy', materials: [...MATS.slice(0, 2), 'f.c9'] }).gy).toEqual([...MATS.slice(0, 2), X])
  })
})

/** Ana (anfitriona) por la red: su Xyz es `c1` y sus materiales `c2`, `c3`, `c4`. */
const ownIds = { c1: X, c2: MATS[0]!, c3: MATS[1]!, c4: MATS[2]! }
/** El espejo que Beto tiene de Ana con su Xyz y `n` materiales. */
const hostMirror = (n: number) => play(createMatState([], [], 0), { type: 'regain', id: 'c1', to: 'mz', index: 0, pos: 'atk', materials: ['c2', 'c3', 'c4'].slice(0, n) })
const react = (mine: MatState, before: MatState, action: MatAction) => controlReactions({ mine, ownIds, before, after: matReducer(before, action), action })

describe('las respuestas: el otro lado completa el cambio con la misma lista', () => {
  it('Ana da su Xyz con 0, 1 y 3 materiales: Beto lo toma con ellos (con sus ids); sin la lista, pelado como siempre', () => {
    expect(react(guestTable, hostMirror(0), { type: 'give', id: 'c1' })).toEqual([{ type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk', auto: true }])
    expect(react(guestTable, hostMirror(1), { type: 'give', id: 'c1', materials: ['c2'] })).toEqual([{ type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk', materials: ['f.c2'], auto: true }])
    expect(react(guestTable, hostMirror(3), { type: 'give', id: 'c1', materials: ['c2', 'c3', 'c4'] })).toEqual([{ type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk', materials: ['f.c2', 'f.c3', 'f.c4'], auto: true }])
    expect(react(guestTable, hostMirror(2), { type: 'give', id: 'c1' })).toEqual([{ type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk', auto: true }])
  })

  it('sin lugar, Beto se lo devuelve con la lista, y Ana lo recupera con sus materiales', () => {
    const full = play(guestTable, ...[0, 1, 2, 3, 4].map((index): MatAction => ({ type: 'token', zone: 'mz', index })))
    const [bounce] = react(full, hostMirror(2), { type: 'give', id: 'c1', materials: ['c2', 'c3'] })

    expect(bounce).toEqual({ type: 'give', id: 'f.c1', materials: ['f.c2', 'f.c3'] })

    const anaAfter = matReducer(xyz(2), { type: 'give', id: X, materials: MATS.slice(0, 2) })
    const guestMirror = createMatState([], [], 0)

    expect(react(anaAfter, guestMirror, bounce!)).toEqual([{ type: 'regain', id: X, to: 'mz', index: 0, pos: 'atk', materials: MATS.slice(0, 2), auto: true }])
  })

  it('Beto devuelve el Xyz de Ana: vuelve con sus materiales, que no vuelven sueltos; si Beto lo manda al cementerio, todo va al cementerio de Ana', () => {
    const anaAfter = matReducer(xyz(2), { type: 'give', id: X, materials: MATS.slice(0, 2) })
    const held = play(createMatState([], [], 0), { type: 'take', id: 'f.c1', zone: 'mz', index: 1, pos: 'def', materials: ['f.c2', 'f.c3'] })

    expect(react(anaAfter, held, { type: 'give', id: 'f.c1', materials: ['f.c2', 'f.c3'] })).toEqual([{ type: 'regain', id: X, to: 'mz', index: 0, pos: 'def', materials: MATS.slice(0, 2), auto: true }])
    expect(react(anaAfter, held, { type: 'move', id: 'f.c1', to: 'gy' })).toEqual([
      { type: 'regain', id: X, to: 'gy', auto: true },
      { type: 'regain', id: MATS[0], to: 'gy', auto: true },
      { type: 'regain', id: MATS[1], to: 'gy', auto: true },
    ])
    // Devuelto sin la lista: el Xyz a su zona y sus materiales al cementerio (no a otras zonas de monstruo).
    expect(react(anaAfter, held, { type: 'give', id: 'f.c1' })).toEqual([
      { type: 'regain', id: X, to: 'mz', index: 0, pos: 'def', auto: true },
      { type: 'regain', id: MATS[0], to: 'gy', auto: true },
      { type: 'regain', id: MATS[1], to: 'gy', auto: true },
    ])
  })

  it('Beto toma el Xyz de Ana (o Ana lo recupera): el otro lo suelta con la misma lista', () => {
    expect(react(xyz(2), createMatState([], [], 0), { type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk', materials: ['f.c2', 'f.c3'] })).toEqual([{ type: 'give', id: X, materials: MATS.slice(0, 2), auto: true }])
    expect(react(xyz(2), createMatState([], [], 0), { type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk' })).toEqual([{ type: 'give', id: X, auto: true }])

    const betoHolds = play(guestTable, { type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk', materials: ['f.c2', 'f.c3'] })

    expect(controlReactions({ mine: betoHolds, ownIds: {}, before: createMatState([], [], 0), after: createMatState([], [], 0), action: { type: 'regain', id: 'c1', to: 'mz', index: 0, pos: 'atk', materials: ['c2', 'c3'] } })).toEqual([
      { type: 'give', id: 'f.c1', materials: ['f.c2', 'f.c3'], auto: true },
    ])
  })
})

describe('quien empieza el cambio arma la lista (`carryMaterials`)', () => {
  it('al dar, los de la carta; al tomar o recuperar, los del espejo con mis ids; sin materiales, la jugada no cambia', () => {
    const give: MatAction = { type: 'give', id: X }

    expect(carryMaterials(give, { mine: xyz(2), theirs: null, ownIds })).toEqual({ ...give, materials: MATS.slice(0, 2) })
    expect(carryMaterials(give, { mine: xyz(0), theirs: null, ownIds })).toBe(give)
    expect(carryMaterials({ type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk' }, { mine: guestTable, theirs: hostMirror(2), ownIds: {} })).toMatchObject({ materials: ['f.c2', 'f.c3'] })

    // Ana recupera su Xyz del campo de Beto: sólo vuelven sus materiales (lo de Beto que tenía debajo se queda con Beto).
    const betoMirror = play(createMatState(['c9'], [], 0), { type: 'move', id: 'c9', to: 'gy' }, { type: 'take', id: 'f.c1', zone: 'mz', index: 0, pos: 'atk', materials: ['f.c2', 'f.c3'] }, { type: 'attach', id: 'c9', to: 'f.c1' })

    expect(carryMaterials({ type: 'regain', id: X, to: 'mz', index: 0, pos: 'atk' }, { mine: hostTable, theirs: betoMirror, ownIds })).toMatchObject({ materials: MATS.slice(0, 2) })
  })
})

// ── Dos jugadores de verdad ──

/** Un cliente de antes: no anuncia la capacidad ni la lee del rival (el resto del protocolo es el mismo). */
const withoutCaps = (text: string) => {
  const message = JSON.parse(text) as Record<string, unknown>
  if (message.t !== 'hello') return text
  delete message.caps
  return JSON.stringify(message)
}
const old = (end: ReturnType<MemoryRoom['join']>): DuelTransport => ({
  send: (text) => end.send(withoutCaps(text)),
  onMessage: (listener) => end.onMessage((text) => listener(withoutCaps(text))),
  onPeer: (listener) => end.onPeer(listener),
  onWatchers: (listener) => end.onWatchers(listener),
  close: () => end.close(),
})

function started(hostOld = false, guestOld = false) {
  const room = createMemoryRoom()
  const hostEnd = room.join()
  const guestEnd = room.join()
  const host = createDuel(hostOld ? old(hostEnd) : hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings: { lp: 8000, hand: 5, limitMin: 50, format: 'unlimited', match: false, siding: false } })
  const guest = createDuel(guestOld ? old(guestEnd) : guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })

  room.flush()
  host.start(hostTable)
  guest.start(guestTable)
  room.flush()
  host.play({ type: 'place', id: X, zone: 'mz', index: 0, pos: 'atk' })
  host.play({ type: 'attach', id: MATS[0]!, to: X })
  host.play({ type: 'attach', id: MATS[1]!, to: X })
  room.flush()

  return { room, host, guest, guestEnd }
}

const foreignSpot = (state: MatState) => state.mz.find((placed) => placed && isForeignId(placed.id)) ?? null
const acts = (room: MemoryRoom) => room.sent.map((text) => parseMessage(text)).flatMap((message) => (message?.t === 'act' ? [message.wire] : []))

describe('dos jugadores: el Xyz viaja con sus materiales sólo si los dos lo saben hacer', () => {
  it.each([
    ['los dos de antes', true, true],
    ['Ana nueva y Beto de antes', false, true],
    ['Ana de antes y Beto nuevo', true, false],
  ])('%s: como siempre (los materiales al cementerio de Ana) y ninguna jugada lleva la lista', (_, hostOld, guestOld) => {
    const { room, host, guest } = started(hostOld, guestOld)

    host.play({ type: 'give', id: X })
    room.flush()

    expect(host.getSnapshot().mine!.gy).toEqual(MATS.slice(0, 2))
    expect(foreignSpot(guest.getSnapshot().mine!)?.materials).toEqual([])
    expect(acts(room).some((wire) => 'materials' in wire.action)).toBe(false)
    // Y las dos mesas coinciden con lo que ve el otro.
    expect(host.getSnapshot().theirs!.state.mz).toEqual(guest.getSnapshot().mine!.mz)
  })

  it('los dos nuevos: Beto lo recibe con los dos materiales, Ana no los pierde al cementerio, nadie puede deshacerlo y lo que viaja son ids opacos', () => {
    const { room, host, guest } = started()
    const before = room.sent.length

    host.play({ type: 'give', id: X })
    room.flush()

    const held = foreignSpot(guest.getSnapshot().mine!)!

    expect(host.getSnapshot().mine!.gy).toEqual([])
    expect(held.materials).toHaveLength(2)
    expect(held.materials.every((id) => /^f\.c[0-9]+$/.test(id))).toBe(true)
    // Beto los ve con la carta real de Ana (ya la conocía: estaban a la vista debajo del Xyz).
    expect(held.materials.map((id) => guest.getSnapshot().theirs!.known[id.slice(2)])).toEqual(MATS.slice(0, 2))
    expect(host.getSnapshot().theirs!.state.mz).toEqual(guest.getSnapshot().mine!.mz)
    expect(host.getSnapshot().undo.blocked).toBe(true)
    expect(guest.getSnapshot().undo.blocked).toBe(true)
    // Por la red no va ninguna carta: ni en la jugada ni revelada de más.
    const sent = room.sent.slice(before).join('\n')
    expect(sent).not.toMatch(/card-/)
  })

  it('los dos nuevos: Beto se lo devuelve y vuelve con sus materiales; si lo manda al cementerio, todo vuelve al cementerio de Ana', () => {
    const back = started()

    back.host.play({ type: 'give', id: X })
    back.room.flush()
    back.guest.play({ type: 'give', id: foreignSpot(back.guest.getSnapshot().mine!)!.id })
    back.room.flush()

    expect(back.host.getSnapshot().mine!.mz[0]).toEqual({ id: X, pos: 'atk', counters: 0, materials: MATS.slice(0, 2) })
    expect(back.host.getSnapshot().mine!.gy).toEqual([])
    expect(back.guest.getSnapshot().mine!.mz.filter(Boolean)).toEqual([])

    const grave = started()

    grave.host.play({ type: 'give', id: X })
    grave.room.flush()
    grave.guest.play({ type: 'move', id: foreignSpot(grave.guest.getSnapshot().mine!)!.id, to: 'gy' })
    grave.room.flush()

    expect([...grave.host.getSnapshot().mine!.gy].sort()).toEqual([X, ...MATS.slice(0, 2)].sort())
    expect(grave.guest.getSnapshot().mine!.gy.filter(isForeignId)).toEqual([])
  })

  it('los dos nuevos: Beto toma el Xyz de Ana con sus materiales y Ana lo recupera con ellos', () => {
    const { room, host, guest } = started()
    const rival = guest.getSnapshot().theirs!.state.mz[0]!

    guest.play({ type: 'take', id: `f.${rival.id}`, zone: 'mz', index: 2, pos: rival.pos })
    room.flush()

    expect(guest.getSnapshot().mine!.mz[2]?.materials).toEqual(rival.materials.map((id) => `f.${id}`))
    expect(host.getSnapshot().mine!).toMatchObject({ gy: [], mz: [null, null, null, null, null] })

    host.play({ type: 'regain', id: X, to: 'mz', index: 4, pos: 'atk' })
    room.flush()

    expect(host.getSnapshot().mine!.mz[4]).toEqual({ id: X, pos: 'atk', counters: 0, materials: MATS.slice(0, 2) })
    expect(guest.getSnapshot().mine!.mz.filter(Boolean)).toEqual([])
    expect(host.getSnapshot().theirs!.state.mz).toEqual(guest.getSnapshot().mine!.mz)
  })

  it('los dos nuevos, si Beto no tiene lugar: el Xyz vuelve a Ana con sus materiales', () => {
    const { room, host, guest } = started()

    for (let index = 0; index < 5; index += 1) guest.play({ type: 'token', zone: 'mz', index })
    room.flush()
    host.play({ type: 'give', id: X })
    room.flush()

    expect(host.getSnapshot().mine!.mz[0]).toEqual({ id: X, pos: 'atk', counters: 0, materials: MATS.slice(0, 2) })
    expect(host.getSnapshot().mine!.gy).toEqual([])
  })

  it('el espectador ve las dos mesas igual que los jugadores', () => {
    const { room, host, guest } = started()
    const spectator = createSpectator(room.spectate())

    room.flush()
    host.play({ type: 'give', id: X })
    room.flush()

    const [ana, beto] = spectator.getSnapshot().sides

    expect(ana.mirror?.state).toEqual(guest.getSnapshot().theirs!.state)
    expect(beto.mirror?.state).toEqual(host.getSnapshot().theirs!.state)
    expect(foreignSpot(beto.mirror!.state)?.materials).toHaveLength(2)
  })

  it('al recargar, la mesa guardada se repone con el Xyz y sus materiales, y el rival vuelve a anunciar la capacidad', () => {
    const { room, host, guest, guestEnd } = started()

    host.play({ type: 'give', id: X })
    room.flush()

    const before = guest.getSnapshot()
    const save = parseSave(JSON.stringify(saveOf(before, Date.now())), 'guest', Date.now())!

    guestEnd.close()
    const reloaded = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2', restore: save })
    room.flush()

    expect(reloaded.getSnapshot().mine).toEqual(before.mine)
    expect(room.sent.map((text) => parseMessage(text)).find((message) => message?.t === 'hello' && message.sid === 'guest-2')).toMatchObject({ caps: [XYZ_MATERIALS_CAP] })

    // Y sigue: Beto se lo devuelve y llega con sus materiales.
    reloaded.play({ type: 'give', id: foreignSpot(reloaded.getSnapshot().mine!)!.id })
    room.flush()
    expect(host.getSnapshot().mine!.mz[0]?.materials).toEqual(MATS.slice(0, 2))
  })
})

describe('los combos y replays guardan la lista', () => {
  it('va y vuelve por el enlace y se reproduce igual', async () => {
    const actions: MatAction[] = [
      { type: 'place', id: X, zone: 'mz', index: 0, pos: 'atk' },
      { type: 'attach', id: MATS[0]!, to: X },
      { type: 'give', id: X, materials: [MATS[0]!] },
      { type: 'take', id: 'f.c1', zone: 'mz', index: 1, pos: 'atk', materials: ['f.c2'], auto: true },
      { type: 'regain', id: X, to: 'mz', index: 2, pos: 'def', faceUp: true, materials: [MATS[0]!], auto: true },
    ]
    const combo = { id: 'combo-1', name: 'Xyz', deckName: 'Deck', savedAt: new Date(0).toISOString(), initial: hostTable, names: {}, actions }
    const result = await decodeComboPayload(await encodeComboPayload(combo))

    expect(result.ok && result.combo.actions).toEqual(actions)
    expect(result.ok && replayMat(result.combo.initial, result.combo.actions)).toEqual(replayMat(hostTable, actions))
  })
})
