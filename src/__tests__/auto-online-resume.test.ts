import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyIds } from '../app/auto/adapter'
import { cardData, type CardRow, type DataLoader, type DataSource } from '../app/auto/auto-data'
import { autoSaveStore } from '../app/auto/auto-save'
import type { AutoSession } from '../app/auto/auto-session'
import type { DeckList } from '../app/auto/deck-map'
import { createGuestLink, createHostLink } from '../app/auto/online'
import { encodeAutoMessage, isAutoText, parseAutoMessage, type AutoMessage } from '../app/auto/online-protocol'
import { codeOfId, createResumeLink, RESUME_WAIT_MS, type ResumeLink } from '../app/auto/online-resume'
import { LOCATION as L, type Seat } from '../app/auto/protocol'
import { placedCards } from '../app/auto/resume'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel, type Duel } from '../app/duel-session'
import { createMatState, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { fakeHost, IDLE } from './support/auto-core-fake'
import { createMemoryRoom, type MemoryEnd, type MemoryRoom } from './support/memory-room'

/**
 * Pasar de manual a automático en el duelo por enlace, sin el núcleo (`fakeHost`): el pedido mientras la sala va a mano (`online-resume.ts`: el saludo entre versiones que lo
 * saben hacer, quién puede pedir y cuándo, la mesa del invitado comparada con el espejo, rechazar, retirar, vencer, el otro que se va, dos pedidos a la vez) y el duelo que
 * sigue desde la mesa rearmada en el enlace del núcleo (`createHostLink` con `resume`: el `autoInit` con el `setup` filtrado, las dos mesas iguales, lo guardado con el `setup`,
 * el anfitrión que recarga y el invitado que vuelve). Con el núcleo real: `auto-online-resume.slow.test.ts`.
 */

const HOST_DECK: DeckList = { main: [[1, 5], [3, 2]], extra: [[90, 1]] }
const GUEST_DECK: DeckList = { main: [[2, 5], [4, 2]], extra: [[91, 1]] }
const KEY = Array.from({ length: 8 }, (_, i) => (Math.imul(i + 1, 0x9e3779b1) >>> 0).toString(16).padStart(8, '0')).join('')
const row = (id: number): CardRow => ({ id, alias: 0, setcode: '0', type: 0x21, atk: 0, def: 0, level: 4, race: '1', attribute: 1, name: `Carta ${id}`, strs: [] })
const expand = (rows: DeckList['main'] = []) => rows.flatMap(([code, copies]) => Array<number>(copies).fill(code))
const loader: DataLoader = {
  manifest: async () => ({ version: 't', tokens: [], filler: [] }),
  async load(lists) {
    const decks = lists.map((list) => ({ main: expand(list.main), extra: expand(list.extra), missing: [], noRules: [] }))
    const codes = [...new Set(decks.flatMap((deck) => [...deck.main, ...deck.extra]))]

    return { decks, cards: codes.map((code) => cardData(row(code))), scripts: {}, names: Object.fromEntries(codes.map((code) => [code, `Carta ${code}`])), version: 't' }
  },
}
const source: DataSource = { manifest: async () => ({ version: 't', tokens: [], filler: [] }), cards: async (codes) => codes.map(row), script: async () => null }

const tick = () => new Promise((resolve) => setImmediate(resolve))
async function settle(room: MemoryRoom) {
  for (let i = 0; i < 30; i += 1) {
    room.flush()
    await tick()
  }
}

/** Las mesas manuales a mitad de duelo: Ana (anfitriona, empezó) en la Main Phase 1 de su segundo turno con dos en el campo (uno con un material), una colocada y una en el cementerio; Beto terminó el suyo. */
function tables(): { host: MatState; guest: MatState } {
  const play = (state: MatState, actions: MatAction[]) => actions.reduce(matReducer, state)
  const host = play(createMatState(copyIds(expand(HOST_DECK.main)), copyIds(expand(HOST_DECK.extra)), 5), [
    { type: 'place', id: 'card-1-1', zone: 'mz', index: 2, pos: 'atk' },
    { type: 'place', id: 'card-90-1', zone: 'mz', index: 4, pos: 'def' },
    { type: 'attach', id: 'card-1-2', to: 'card-90-1' },
    { type: 'place', id: 'card-1-3', zone: 'st', index: 1, pos: 'set' },
    { type: 'move', id: 'card-1-4', to: 'gy' },
    { type: 'phase', phase: 'main1' },
  ])
  const guest = play(createMatState(copyIds(expand(GUEST_DECK.main)), copyIds(expand(GUEST_DECK.extra)), 5), [
    { type: 'place', id: 'card-2-1', zone: 'st', index: 0, pos: 'set' },
    { type: 'move', id: 'card-2-2', to: 'banished', faceDown: true },
    { type: 'phase', phase: 'main1' },
    { type: 'phase', phase: 'end' },
    { type: 'phase', phase: 'draw', skipDraw: true },
  ])

  return { host: { ...host, turn: 2 }, guest }
}

interface Game {
  room: MemoryRoom
  hostEnd: MemoryEnd
  guestEnd: MemoryEnd
  host: Duel
  guest: Duel
  hostResume: ResumeLink
  guestResume: ResumeLink
  /** Lo `autoResume` que recibió cada lado, en orden. */
  box: { host: AutoMessage[]; guest: AutoMessage[] }
}

/** La sala a mano (una sala automática que ya pasó a manual, con las mesas de `tables`) y el enlace de pasar a automático de cada lado. */
async function manualRoom({ noHello = false, hostNow, guestNow }: { noHello?: boolean; hostNow?: () => number; guestNow?: () => number } = {}): Promise<Game> {
  const room = createMemoryRoom()
  const hostEnd = room.join()
  const guestEnd = room.join()
  const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings: { ...DEFAULT_SETTINGS, auto: true } })
  const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
  const box = { host: [] as AutoMessage[], guest: [] as AutoMessage[] }

  hostEnd.onMessage((text) => {
    const message = isAutoText(text) ? parseAutoMessage(text) : null

    if (message?.t === 'autoResume') box.host.push(message)
  })
  guestEnd.onMessage((text) => {
    const message = isAutoText(text) ? parseAutoMessage(text) : null

    if (message?.t === 'autoResume') box.guest.push(message)
  })
  await settle(room)
  host.setReady(true)
  guest.setReady(true)
  await settle(room)
  host.chooseMethod('rps')
  await settle(room)
  host.pickRps('rock')
  guest.pickRps('scissors')
  await settle(room)
  host.chooseFirst(0)
  await settle(room)
  const { host: hostTable, guest: guestTable } = tables()

  guest.start(guestTable)
  host.start(hostTable)
  await settle(room)
  // Un invitado que no sabe pasar a automático (una versión de antes) no saluda: se le dice a su enlace que no mande nada.
  const hostResume = createResumeLink({ host: true, transport: hostEnd, ...(hostNow ? { now: hostNow } : {}) })
  const guestResume = createResumeLink({ host: false, transport: noHello ? { send: () => {}, onMessage: guestEnd.onMessage.bind(guestEnd) } : guestEnd, ...(guestNow ? { now: guestNow } : {}) })

  host.subscribe(() => hostResume.observe(host.getSnapshot()))
  guest.subscribe(() => guestResume.observe(guest.getSnapshot()))
  hostResume.observe(host.getSnapshot())
  guestResume.observe(guest.getSnapshot())
  await settle(room)

  return { room, hostEnd, guestEnd, host, guest, hostResume, guestResume, box }
}

const stateOf = (link: ResumeLink) => link.getSnapshot().state
const codesAt = (state: MatState, seat: Seat) => placedCards(state, seat, codeOfId).map((card) => [card.location, card.sequence, card.position, card.code, ...(card.materials ?? [])])

/** La mesa del invitado es la que el anfitrión calcula para su asiento. */
function sameView(hostSession: AutoSession, guestSession: AutoSession, guestSeat: Seat) {
  const view = hostSession.viewOf!(guestSeat)!
  const mine = guestSession.getSnapshot()

  expect({ mine: mine.mine, theirs: mine.theirs, overlay: mine.overlay }).toEqual(view)
}

describe('pasar de manual a automático: el pedido mientras la sala va a mano', () => {
  afterEach(() => vi.useRealTimers())

  it('se saludan las versiones que lo saben hacer; puede pedir quien tiene el turno en su Main Phase, y el otro ve por qué no', async () => {
    const game = await manualRoom()

    // Los dos se saludaron (dos `hello` por lado: el del otro y su contestación al propio, que no se contesta de nuevo) y nada más.
    expect(game.box.host.map((message) => message.t === 'autoResume' && [message.step, message.back ?? false])).toEqual([['hello', false], ['hello', true]])
    expect(game.box.guest.map((message) => message.t === 'autoResume' && message.step)).toEqual(['hello', 'hello'])
    // Es el turno de Ana (su Main Phase 1): ella puede pedir; Beto, no.
    expect(game.hostResume.getSnapshot()).toMatchObject({ state: 'idle', blocked: null, start: null })
    expect(game.guestResume.getSnapshot()).toMatchObject({ state: 'idle', blocked: 'turn' })
    // En la Battle Phase, con una ficha o con una carta bajo el control del otro, tampoco Ana.
    game.host.play({ type: 'phase', phase: 'battle' })
    await settle(game.room)
    expect(game.hostResume.getSnapshot().blocked).toBe('phase')
    game.host.play({ type: 'phase', phase: 'main2' })
    await settle(game.room)
    expect(game.hostResume.getSnapshot().blocked).toBeNull()
    game.host.play({ type: 'token', zone: 'mz', index: 0, pos: 'atk' })
    await settle(game.room)
    expect(game.hostResume.getSnapshot().blocked).toBe('tokens')
    expect(game.guestResume.getSnapshot().blocked).toBe('turn')
    // Pedir con algo que lo impide no manda nada.
    game.hostResume.want(true)
    expect(stateOf(game.hostResume)).toBe('idle')

    // Un invitado de antes nunca saluda: no se le ofrece.
    const old = await manualRoom({ noHello: true })

    expect(old.hostResume.getSnapshot().blocked).toBe('peer')
    expect(old.box.guest.map((message) => message.t === 'autoResume' && message.step)).toEqual(['hello'])
  })

  it('pide Ana y acepta Beto (con su mesa): el acuerdo lleva las dos mesas por asiento (Ana en el 0, con el turno), las vidas, la fase y los turnos; Beto pasa con el sí del enlace del núcleo', async () => {
    const game = await manualRoom()
    const { host: hostTable, guest: guestTable } = tables()

    game.host.changeLife(-1600)
    game.guest.changeLife(-800)
    await settle(game.room)
    game.hostResume.want(true)
    expect(stateOf(game.hostResume)).toBe('asking')
    await settle(game.room)
    expect(stateOf(game.guestResume)).toBe('asked')
    expect(game.box.guest.at(-1)).toEqual({ t: 'autoResume', step: 'ask' })
    game.guestResume.want(true)
    expect(stateOf(game.guestResume)).toBe('switching')
    await settle(game.room)
    // Beto mandó su mesa entera con código; Ana la comparó con lo que ve de él y acordó.
    expect(game.box.host.at(-1)).toMatchObject({ t: 'autoResume', step: 'yes' })
    expect((game.box.host.at(-1) as Extract<AutoMessage, { t: 'autoResume' }>).table).toEqual(placedCards(guestTable, 1, codeOfId))
    const { start } = game.hostResume.getSnapshot()

    expect(stateOf(game.hostResume)).toBe('agreed')
    expect(start).toMatchObject({ seat: 0, setup: { lp: [6400, 7200], phase: 'main1', turns: [2, 2] } })
    expect(start!.setup.cards).toEqual([...placedCards(hostTable, 0, codeOfId), ...placedCards(guestTable, 1, codeOfId)])
    // El sí lo manda el enlace del núcleo de Ana al arrancar (ya escuchando): hasta entonces Beto espera; con él, pasa.
    expect(stateOf(game.guestResume)).toBe('switching')
    const core = fakeHost()
    const hostLink = createHostLink({ transport: game.hostEnd, loader, deck: HOST_DECK, handSize: 5, makeTransport: core.factory, enabled: async () => true, newKey: () => KEY, resume: start! })

    game.host.subscribe(() => hostLink.observe(game.host.getSnapshot()))
    hostLink.observe(game.host.getSnapshot())
    await settle(game.room)
    expect(game.box.guest.at(-1)).toEqual({ t: 'autoResume', step: 'yes' })
    expect(stateOf(game.guestResume)).toBe('agreed')
    hostLink.destroy()
  })

  it('pide Beto (con su mesa) y acepta Ana: Beto queda en el asiento 0; rechazar, retirar, vencer y el otro que se va dejan todo como estaba', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let clock = 0
    const now = () => clock
    const game = await manualRoom({ hostNow: now, guestNow: now })

    // El turno pasa a Beto, que llega a su Main Phase 1.
    game.host.play({ type: 'phase', phase: 'end' })
    game.host.play({ type: 'phase', phase: 'draw', skipDraw: true })
    game.guest.play({ type: 'phase', phase: 'main1' })
    await settle(game.room)
    expect(game.guestResume.getSnapshot().blocked).toBeNull()
    expect(game.hostResume.getSnapshot().blocked).toBe('turn')

    // Rechazar.
    game.guestResume.want(true)
    await settle(game.room)
    expect(stateOf(game.hostResume)).toBe('asked')
    expect((game.box.host.at(-1) as Extract<AutoMessage, { t: 'autoResume' }>).table?.every((card) => card.controller === 0)).toBe(true)
    game.hostResume.want(false)
    await settle(game.room)
    expect([stateOf(game.hostResume), stateOf(game.guestResume)]).toEqual(['idle', 'declined'])
    // Retirar.
    game.guestResume.want(true)
    await settle(game.room)
    game.guestResume.want(false)
    await settle(game.room)
    expect([stateOf(game.hostResume), stateOf(game.guestResume)]).toEqual(['idle', 'idle'])
    // Vencer a los 30 s.
    game.guestResume.want(true)
    await settle(game.room)
    expect(stateOf(game.hostResume)).toBe('asked')
    clock += RESUME_WAIT_MS
    vi.advanceTimersByTime(RESUME_WAIT_MS)
    await settle(game.room)
    expect([stateOf(game.hostResume), stateOf(game.guestResume)]).toEqual(['idle', 'expired'])
    // Un sí a un pedido que ya no está: que el otro no se quede esperando.
    game.room.inject(game.hostEnd, encodeAutoMessage({ t: 'autoResume', step: 'yes', table: placedCards(game.guest.getSnapshot().mine!, 1, codeOfId) }))
    await settle(game.room)
    expect(game.box.guest.at(-1)).toEqual({ t: 'autoResume', step: 'cancel' })
    // El otro se va con un pedido en pie: se cae.
    clock += 5000
    game.guestResume.want(true)
    await settle(game.room)
    expect(stateOf(game.hostResume)).toBe('asked')
    game.guestEnd.disconnect()
    await settle(game.room)
    expect(stateOf(game.hostResume)).toBe('idle')
    game.guestEnd.reconnect()
    await settle(game.room)
    // De vuelta se saludan otra vez y acepta Ana: Beto queda en el asiento 0 (tiene el turno) y Ana en el 1.
    clock += 5000
    expect(game.hostResume.getSnapshot().blocked).toBe('turn')
    game.guestResume.want(true)
    await settle(game.room)
    game.hostResume.want(true)
    const { start } = game.hostResume.getSnapshot()

    expect(start).toMatchObject({ seat: 1, setup: { lp: [8000, 8000], phase: 'main1', turns: [2, 3] } })
    expect(start!.setup.cards.filter((card) => card.controller === 0)).toEqual(placedCards(game.guest.getSnapshot().mine!, 0, codeOfId))
    expect(start!.setup.cards.filter((card) => card.controller === 1)).toEqual(placedCards(game.host.getSnapshot().mine!, 1, codeOfId))
  })

  it('una mesa del invitado que no es la que el anfitrión ve de él se rechaza (`table`); y si los dos piden a la vez, vale el del anfitrión', async () => {
    const game = await manualRoom()
    const mine = game.guest.getSnapshot().mine!
    const table = placedCards(mine, 0, codeOfId)

    // Beto no tiene el turno: su pedido vuelve con `turn`.
    game.room.inject(game.hostEnd, encodeAutoMessage({ t: 'autoResume', step: 'ask', table }))
    await settle(game.room)
    expect(game.box.guest.at(-1)).toEqual({ t: 'autoResume', step: 'no', why: 'turn' })
    expect(stateOf(game.hostResume)).toBe('idle')
    // Ana pide; un sí de Beto con otra mesa (una carta más en la mano, o una que Ana ya vio con otro código) no se acepta.
    game.hostResume.want(true)
    await settle(game.room)
    const yes = (cards: typeof table) => encodeAutoMessage({ t: 'autoResume', step: 'yes', table: cards })

    game.room.inject(game.hostEnd, yes([...placedCards(mine, 1, codeOfId), { code: 2, controller: 1, location: L.HAND, sequence: 5, position: 10 }]))
    await settle(game.room)
    expect(game.box.guest.at(-1)).toEqual({ t: 'autoResume', step: 'no', why: 'table' })
    expect(game.hostResume.getSnapshot()).toMatchObject({ state: 'refused', why: 'table', start: null })
    expect(game.guestResume.getSnapshot()).toMatchObject({ state: 'refused', why: 'table' })

    // Los dos a la vez: Ana sigue con el suyo y Beto deja el suyo por el de Ana (lo ve como pedido).
    const both = await manualRoom()

    both.hostResume.want(true)
    both.room.inject(both.hostEnd, encodeAutoMessage({ t: 'autoResume', step: 'ask', table: placedCards(both.guest.getSnapshot().mine!, 0, codeOfId) }))
    await settle(both.room)
    expect(stateOf(both.hostResume)).toBe('asking')
    expect(stateOf(both.guestResume)).toBe('asked')
  })
})

describe('pasar de manual a automático: el duelo que sigue desde la mesa rearmada', () => {
  /** El acuerdo (pide Ana, acepta Beto) y los enlaces del núcleo de los dos: el invitado manda su deck al entrar, como siempre. */
  async function resumed({ save }: { save?: ReturnType<typeof autoSaveStore> } = {}) {
    const game = await manualRoom()

    game.host.changeLife(-1600)
    await settle(game.room)
    game.hostResume.want(true)
    await settle(game.room)
    game.guestResume.want(true)
    await settle(game.room)
    const { start } = game.hostResume.getSnapshot()
    const core = fakeHost((k) => (k % 2 === 1 ? 1 : 0), undefined, 1, (_k, seat) => ({ ...IDLE, player: seat }))
    const toGuest: AutoMessage[] = []

    game.guestEnd.onMessage((text) => {
      const message = isAutoText(text) ? parseAutoMessage(text) : null

      if (message) toGuest.push(message)
    })
    const hostLink = createHostLink({ transport: game.hostEnd, loader, deck: HOST_DECK, handSize: 5, makeTransport: core.factory, enabled: async () => true, newKey: () => KEY, resume: start!, ...(save ? { save } : {}) })
    const guestLink = createGuestLink({ transport: game.guestEnd, source, deck: GUEST_DECK })

    game.host.subscribe(() => hostLink.observe(game.host.getSnapshot()))
    game.guest.subscribe(() => guestLink.observe(game.guest.getSnapshot()))
    hostLink.observe(game.host.getSnapshot())
    guestLink.observe(game.guest.getSnapshot())
    await settle(game.room)

    return { ...game, start: start!, core, hostLink, guestLink, toGuest }
  }

  it('el autoInit lleva la mesa rearmada filtrada (lo boca abajo de Ana con código 0), los dos arrancan con las mismas mesas que tenían a mano, con las vidas de la sala, y se sigue jugando', async () => {
    const game = await resumed()
    const { host: hostTable, guest: guestTable } = tables()
    const init = game.toGuest.find((message) => message.t === 'autoInit') as Extract<AutoMessage, { t: 'autoInit' }>

    expect(init).toMatchObject({ seat: 1, setup: { lp: [6400, 8000], phase: 'main1', turns: [2, 2] } })
    const hidden = init.setup!.cards.filter((card) => card.controller === 0 && (card.position & 10) !== 0)

    expect(hidden.length).toBeGreaterThan(0)
    expect(hidden.every((card) => card.code === 0)).toBe(true)
    expect(init.setup!.cards.filter((card) => card.controller === 1)).toEqual(placedCards(guestTable, 1, codeOfId))
    expect(init.setup!.cards.find((card) => card.code === 90)?.materials).toEqual([1])

    const hosted = game.hostLink.getSnapshot().session!
    const guested = game.guestLink.getSnapshot().session!

    expect(game.hostLink.getSnapshot()).toMatchObject({ phase: 'playing', seat: 0 })
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'playing', seat: 1 })
    // Cada mesa es la manual (mismas cartas en cada lugar, misma fase y turno): la de Ana con todas sus cartas, la de Beto con las suyas.
    expect(codesAt(hosted.getSnapshot().initial.mine, 0)).toEqual(codesAt(hostTable, 0))
    expect(hosted.getSnapshot().initial.mine).toMatchObject({ phase: 'main1', turn: 2 })
    expect(codesAt(guested.getSnapshot().initial.mine, 1)).toEqual(codesAt(guestTable, 1))
    expect(guested.getSnapshot().initial.mine).toMatchObject({ phase: 'draw', turn: 2 })
    // (Las vidas del overlay las pisa el núcleo de mentira: las de verdad las prueba la lenta.)
    sameView(hosted, guested, 1)
    // El núcleo recibió el setup entero (las dos mesas, con código) y las vidas.
    const create = game.core.commands.find((command) => command.t === 'create') as Extract<(typeof game.core.commands)[number], { t: 'create' }>

    expect(create.setup).toEqual(game.start.setup)
    expect(create.players.map((player) => player.lp)).toEqual([6400, 8000])
    // Se sigue jugando: Ana contesta, le toca a Beto y contesta por la red.
    expect(hosted.getSnapshot()).toMatchObject({ status: 'ready', ask: { seat: 0 } })
    hosted.answer({ type: 'select_idlecmd', action: 7, index: null })
    await settle(game.room)
    expect(guested.getSnapshot()).toMatchObject({ status: 'ready', ask: { seat: 1 } })
    guested.answer({ type: 'select_idlecmd', action: 7, index: null })
    await settle(game.room)
    expect(hosted.getSnapshot()).toMatchObject({ status: 'ready', ask: { seat: 0 } })
    sameView(hosted, guested, 1)
    game.hostLink.destroy()
    game.guestLink.destroy()
  })

  it('lo guardado lleva el setup: el anfitrión que recarga rearma el mismo duelo y el invitado que vuelve recibe la misma mesa', async () => {
    const storage = new Map<string, string>()
    const store = autoSaveStore('ROOM0001', { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => void storage.set(key, value), removeItem: (key) => void storage.delete(key) })
    const game = await resumed({ save: store })
    const hosted = game.hostLink.getSnapshot().session!

    hosted.answer({ type: 'select_idlecmd', action: 7, index: null })
    await settle(game.room)
    expect(store.read()).toMatchObject({ v: 2, seat: 0, setup: game.start.setup })
    expect(store.read()!.answers).toHaveLength(1)
    const before = hosted.getSnapshot()

    // Ana recarga: otro enlace con lo guardado, que rearma el duelo desde el setup y re-simula la respuesta; Beto vuelve a recibirlo.
    game.hostLink.destroy()
    const again = createHostLink({ transport: game.hostEnd, loader, deck: HOST_DECK, handSize: 5, makeTransport: game.core.factory, enabled: async () => true, newKey: () => 'nunca', save: store })

    game.host.subscribe(() => again.observe(game.host.getSnapshot()))
    again.observe(game.host.getSnapshot())
    await settle(game.room)
    const rebuilt = again.getSnapshot().session!

    expect(again.getSnapshot()).toMatchObject({ phase: 'playing', seat: 0 })
    expect(rebuilt.getSnapshot().initial).toEqual(before.initial)
    expect(rebuilt.getSnapshot()).toMatchObject({ mine: before.mine, theirs: before.theirs, answers: before.answers, status: 'waiting' })
    const guested = game.guestLink.getSnapshot().session!

    expect(guested.getSnapshot().initial).toEqual(game.guestLink.getSnapshot().session!.getSnapshot().initial)
    sameView(rebuilt, guested, 1)
    // Beto vuelve (otra pestaña): pide el duelo de nuevo y arma la misma mesa.
    game.guestLink.destroy()
    const back = createGuestLink({ transport: game.guestEnd, source, deck: GUEST_DECK })

    game.guest.subscribe(() => back.observe(game.guest.getSnapshot()))
    back.observe(game.guest.getSnapshot())
    await settle(game.room)
    expect(back.getSnapshot()).toMatchObject({ phase: 'playing', seat: 1 })
    sameView(rebuilt, back.getSnapshot().session!, 1)
    expect(back.getSnapshot().session!.getSnapshot().initial).toEqual(guested.getSnapshot().initial)
    again.destroy()
    back.destroy()
  })
})
