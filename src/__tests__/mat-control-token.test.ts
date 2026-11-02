import { describe, expect, it } from 'vitest'

import { comboEnvelope, decodeComboPayload, encodeComboPayload, parseComboText } from '../app/combo-share'
import { parseSave, saveOf } from '../app/duel-save'
import { parseMessage } from '../app/duel-protocol'
import { createDuel, type DuelTransport } from '../app/duel-session'
import { createSpectator } from '../app/duel-spectator'
import { controlReactions, isControlAction, TOKEN_CONTROL_CAP, XYZ_MATERIALS_CAP } from '../app/mat-control'
import { createMatState, describeMatAction, listCardActions, matReducer, replayMat, TOKEN_KIND, type ControlOffer, type MatAction, type MatState } from '../app/practice-mat'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'

/** El control de una ficha (`mat-control.ts`): la mesa, la respuesta, el menú y dos jugadores de verdad, con y sin la capacidad. */

const deck = (base: number) => Array.from({ length: 12 }, (_, index) => `card-${base + index}-1`)
const hostTable = createMatState(deck(1000), [], 5)
const guestTable = createMatState(deck(5000), [], 5)
const play = (state: MatState, ...actions: MatAction[]) => actions.reduce(matReducer, state)
const EMPTY = [null, null, null, null, null]
/** Una mesa con una ficha en la zona 1, en defensa y con 2 contadores. */
const withToken = (state: MatState) => play(state, { type: 'token', zone: 'mz', index: 1, pos: 'def' }, { type: 'counter', id: 'token-1', delta: 2 })
const react = (mine: MatState, before: MatState, action: MatAction) => controlReactions({ mine, ownIds: {}, before, after: matReducer(before, action), action })

describe('la mesa y la respuesta', () => {
  it('dar una ficha la saca del campo (con sus contadores); el contador de fichas no baja; recuperar una ficha sigue sin hacer nada', () => {
    const base = withToken(hostTable)
    const given = matReducer(base, { type: 'give', id: 'token-1' })

    expect(given).toMatchObject({ mz: EMPTY, tokens: 1, gy: [] })
    expect(matReducer(given, { type: 'give', id: 'token-1' })).toBe(given)
    expect(matReducer(given, { type: 'regain', id: 'token-1', to: 'mz', index: 0 })).toBe(given)
    expect(describeMatAction(base, { type: 'give', id: 'token-1' }, () => '?')).toBe('Das el control de la ficha')
    expect(describeMatAction(guestTable, { type: 'token', zone: 'mz', index: 0, auto: true }, () => '?')).toBe('Recibís el control de la ficha')
  })

  it('el rival me da una ficha (la suya o la que le di, da igual): pongo una mía en mi primera zona libre, en su posición; sin lugar, nada', () => {
    const rival = withToken(createMatState([], [], 0))
    const give: MatAction = { type: 'give', id: 'token-1' }
    const busy = play(guestTable, { type: 'token', zone: 'mz', index: 0 })

    expect(react(guestTable, rival, give)).toEqual([{ type: 'token', zone: 'mz', index: 0, pos: 'def', auto: true }])
    expect(react(busy, rival, give)).toEqual([{ type: 'token', zone: 'mz', index: 1, pos: 'def', auto: true }])

    const full = play(guestTable, ...[0, 1, 2, 3, 4].map((index): MatAction => ({ type: 'token', zone: 'mz', index })))
    expect(react(full, rival, give)).toEqual([])
    // Mi respuesta no provoca otra, y una ficha que no estaba en su campo tampoco.
    expect(react(hostTable, guestTable, { type: 'token', zone: 'mz', index: 0, auto: true })).toEqual([])
    expect(react(guestTable, createMatState([], [], 0), give)).toEqual([])
  })

  it('la ficha recibida y el `give` no se deshacen; una ficha creada a mano, sí', () => {
    expect(isControlAction({ type: 'token', zone: 'mz', index: 0, auto: true })).toBe(true)
    expect(isControlAction({ type: 'give', id: 'token-1' })).toBe(true)
    expect(isControlAction({ type: 'token', zone: 'mz', index: 0 })).toBe(false)
  })
})

describe('el menú de la ficha', () => {
  const state = withToken(hostTable)
  const giveOf = (control?: ControlOffer) => listCardActions(state, 'token-1', () => TOKEN_KIND, () => 'Ficha', [], undefined, control).find((item) => item.action.type === 'give')

  it('ofrece «Dar el control» sólo si el rival sabe recibirla; sin lugar, apagado y dice por qué', () => {
    expect(giveOf({ rival: 'Beto', rivalHasRoom: true, tokens: true })).toEqual({ label: 'Dar el control a Beto', action: { type: 'give', id: 'token-1' } })
    expect(giveOf({ rival: 'Beto', rivalHasRoom: false, tokens: true })?.disabled).toBe('Beto no tiene una zona de monstruo libre')
    expect(giveOf({ rival: 'Beto', rivalHasRoom: true })).toBeUndefined()
    expect(giveOf()).toBeUndefined()
  })
})

// ── Dos jugadores de verdad ──

/** Un cliente de antes: no anuncia las capacidades ni las lee del rival. */
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

/** Ana (anfitriona) con una ficha en defensa en su zona 1; Beto, con el campo vacío. */
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
  host.play({ type: 'token', zone: 'mz', index: 1, pos: 'def' })
  host.play({ type: 'counter', id: 'token-1', delta: 2 })
  room.flush()

  return { room, host, guest, guestEnd }
}

const gives = (room: MemoryRoom) => room.sent.map((text) => parseMessage(text)).filter((message) => message?.t === 'act' && message.wire.action.type === 'give')

describe('dos jugadores: la ficha cambia de manos sólo si el que la recibe lo sabe hacer', () => {
  it.each([
    ['Ana nueva y Beto de antes', false, true],
    ['Ana de antes y Beto nuevo', true, false],
  ])('%s: la ficha no se puede dar (no sale nada por la red) y queda donde estaba', (_, hostOld, guestOld) => {
    const { room, host, guest } = started(hostOld, guestOld)

    expect(host.getSnapshot().peerCaps).toEqual([])
    host.play({ type: 'give', id: 'token-1' })
    room.flush()

    expect(host.getSnapshot().mine!.mz[1]?.id).toBe('token-1')
    expect(guest.getSnapshot().mine!.mz).toEqual(EMPTY)
    expect(gives(room)).toEqual([])
  })

  it('los dos nuevos: Beto la recibe en su primera zona, en defensa y sin contadores; las mesas coinciden y nadie puede deshacerlo; y vuelve igual', () => {
    const { room, host, guest } = started()

    expect(host.getSnapshot().peerCaps).toEqual([XYZ_MATERIALS_CAP, TOKEN_CONTROL_CAP])
    host.play({ type: 'give', id: 'token-1' })
    room.flush()

    expect(host.getSnapshot().mine!.mz).toEqual(EMPTY)
    expect(guest.getSnapshot().mine!.mz[0]).toEqual({ id: 'token-1', pos: 'def', counters: 0, materials: [] })
    expect(guest.getSnapshot().actions.at(-1)).toEqual({ type: 'token', zone: 'mz', index: 0, pos: 'def', auto: true })
    expect(host.getSnapshot().theirs!.state.mz).toEqual(guest.getSnapshot().mine!.mz)
    expect(guest.getSnapshot().theirs!.state.mz).toEqual(host.getSnapshot().mine!.mz)
    expect(host.getSnapshot().undo.blocked).toBe(true)
    expect(guest.getSnapshot().undo.blocked).toBe(true)

    guest.play({ type: 'give', id: 'token-1' })
    room.flush()

    expect(guest.getSnapshot().mine!.mz).toEqual(EMPTY)
    expect(host.getSnapshot().mine!.mz[0]).toEqual({ id: 'token-2', pos: 'def', counters: 0, materials: [] })
    expect(guest.getSnapshot().theirs!.state.mz).toEqual(host.getSnapshot().mine!.mz)
  })

  it('el espectador ve las dos mesas igual que los jugadores', () => {
    const { room, host, guest } = started()
    const spectator = createSpectator(room.spectate())

    room.flush()
    host.play({ type: 'give', id: 'token-1' })
    room.flush()

    const [ana, beto] = spectator.getSnapshot().sides

    expect(ana.mirror?.state).toEqual(guest.getSnapshot().theirs!.state)
    expect(beto.mirror?.state).toEqual(host.getSnapshot().theirs!.state)
    expect(beto.mirror?.state.mz[0]?.id).toBe('token-1')
  })

  it('al recargar a mitad del duelo, la mesa se repone, Beto vuelve a anunciar la capacidad y se sigue pasando la ficha', () => {
    const { room, host, guest, guestEnd } = started()

    host.play({ type: 'give', id: 'token-1' })
    room.flush()

    const before = guest.getSnapshot()
    const save = parseSave(JSON.stringify(saveOf(before, Date.now())), 'guest', Date.now())!

    guestEnd.close()
    const reloaded = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2', restore: save })
    room.flush()

    expect(reloaded.getSnapshot().mine).toEqual(before.mine)
    expect(room.sent.map((text) => parseMessage(text)).find((message) => message?.t === 'hello' && message.sid === 'guest-2')).toMatchObject({ caps: [XYZ_MATERIALS_CAP, TOKEN_CONTROL_CAP] })
    expect(host.getSnapshot().peerCaps).toContain(TOKEN_CONTROL_CAP)

    reloaded.play({ type: 'give', id: 'token-1' })
    room.flush()
    expect(host.getSnapshot().mine!.mz[0]?.id).toBe('token-2')
    expect(reloaded.getSnapshot().mine!.mz).toEqual(EMPTY)
  })
})

describe('los combos y replays guardan la ficha dada y la recibida', () => {
  const actions: MatAction[] = [
    { type: 'token', zone: 'mz', index: 1, pos: 'def' },
    { type: 'counter', id: 'token-1', delta: 2 },
    { type: 'give', id: 'token-1' },
    { type: 'token', zone: 'mz', index: 0, pos: 'def', auto: true },
  ]
  const combo = { id: 'combo-1', name: 'Ficha', deckName: 'Deck', savedAt: new Date(0).toISOString(), initial: hostTable, names: {}, actions }

  it('va y vuelve por el enlace (v2) y por el texto (v1) y se reproduce igual', async () => {
    const v2 = await decodeComboPayload(await encodeComboPayload(combo))
    const v1 = parseComboText(JSON.stringify(comboEnvelope(combo)))

    expect(v2.ok && v2.combo.actions).toEqual(actions)
    expect(v1.ok && v1.combo.actions).toEqual(actions)
    expect(v2.ok && replayMat(v2.combo.initial, v2.combo.actions).mz[0]).toEqual({ id: 'token-2', pos: 'def', counters: 0, materials: [] })
  })
})
