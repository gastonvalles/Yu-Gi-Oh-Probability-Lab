import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardData, type CardRow, type DataLoader, type DataSource } from '../app/auto/auto-data'
import type { AutoSession } from '../app/auto/auto-session'
import type { DeckList } from '../app/auto/deck-map'
import { createGuestLink, createHostLink, type OnlineLink } from '../app/auto/online'
import { encodeAutoMessage, GUEST_ACCEPTS, isAutoText, parseAutoMessage, type AutoMessage, type AutoMessageKind } from '../app/auto/online-protocol'
import type { AutoCommand, AutoEvent, Seat } from '../app/auto/protocol'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel, type Duel } from '../app/duel-session'
import type { Duelist } from '../app/life-calculator'
import { CHAIN, END, fakeHost, IDLE, PASS } from './support/auto-core-fake'
import { createMemoryRoom, type MemoryEnd, type MemoryRoom } from './support/memory-room'

/**
 * El enlace del duelo automático por enlace con un núcleo de mentira (`fakeHost`) y la sala de siempre en memoria (`createDuel` sobre `MemoryRoom`): las fases del anfitrión y
 * del invitado, el asiento según quién empieza, las respuestas del invitado, la reposición a quien vuelve, la revancha y lo que corta (apagado, sin reglas, versión, recarga del
 * anfitrión). El núcleo de verdad lo prueba `auto-online.slow.test.ts`.
 */

const HOST_DECK: DeckList = { main: [[1, 5]] }
const GUEST_DECK: DeckList = { main: [[2, 5]] }
const row = (id: number): CardRow => ({ id, alias: 0, setcode: '0', type: 0x21, atk: 0, def: 0, level: 4, race: '1', attribute: 1, name: `Carta ${id}`, strs: [`Efecto de ${id}`] })
const expand = (rows: DeckList['main'] = []) => rows.flatMap(([code, copies]) => Array<number>(copies).fill(code))

/** Arma cada deck con lo que se le pide; los códigos de `noRules` no tienen script. */
function listLoader(noRules: number[] = []): DataLoader {
  return {
    manifest: async () => ({ version: 't', tokens: [], filler: [] }),
    async load(lists) {
      const decks = lists.map((list) => ({ main: expand(list.main), extra: expand(list.extra), missing: [], noRules: [...new Set(expand(list.main).filter((code) => noRules.includes(code)))] }))
      const codes = [...new Set(decks.flatMap((deck) => [...deck.main, ...deck.extra]))]

      return { decks, cards: codes.map((code) => cardData(row(code))), scripts: {}, names: Object.fromEntries(codes.map((code) => [code, `Carta ${code}`])), version: 't' }
    },
  }
}
const source: DataSource = { manifest: async () => ({ version: 't', tokens: [], filler: [] }), cards: async (codes) => codes.map(row), script: async () => null }

// `setImmediate` y no `setTimeout`: en Windows un `setTimeout(0)` tarda lo que el reloj del sistema (~15 ms) y todo lo que se espera acá son promesas.
const tick = () => new Promise((resolve) => setImmediate(resolve))
/** Entrega lo pendiente de la sala y deja correr las promesas (el cargador, el núcleo de mentira), hasta que se calma. */
async function settle(room: MemoryRoom) {
  for (let i = 0; i < 30; i += 1) {
    room.flush()
    await tick()
  }
}

interface Game {
  room: MemoryRoom
  hostEnd: MemoryEnd
  guestEnd: MemoryEnd
  host: Duel
  guest: Duel
  hostLink: OnlineLink
  guestLink: OnlineLink
  core: ReturnType<typeof fakeHost>
}

function setup({ seatOf, firstCode, enabled = true, noRules = [], seeds = [11, 22, 33] }: { seatOf?: (k: number) => Seat; firstCode?: number; enabled?: boolean; noRules?: number[]; seeds?: number[] } = {}): Game {
  const room = createMemoryRoom()
  const hostEnd = room.join()
  const guestEnd = room.join()
  const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings: { ...DEFAULT_SETTINGS, auto: true } })
  const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
  const core = fakeHost(seatOf, undefined, firstCode)
  const random = () => (seeds.shift() ?? 99) / 2 ** 32
  const hostLink = createHostLink({ transport: hostEnd, loader: listLoader(noRules), deck: HOST_DECK, handSize: 5, makeTransport: core.factory, enabled: async () => enabled, random })
  const guestLink = createGuestLink({ transport: guestEnd, source, deck: GUEST_DECK })

  host.subscribe(() => hostLink.observe(host.getSnapshot()))
  guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
  hostLink.observe(host.getSnapshot())
  guestLink.observe(guest.getSnapshot())

  return { room, hostEnd, guestEnd, host, guest, hostLink, guestLink, core }
}

/** Los dos listos, piedra-papel-tijera (gana Ana) y Ana elige quién empieza (0 Ana, 1 Beto). */
async function order(game: Game, first: Duelist) {
  game.host.setReady(true)
  game.guest.setReady(true)
  await settle(game.room)
  game.host.chooseMethod('rps')
  await settle(game.room)
  game.host.pickRps('rock')
  game.guest.pickRps('scissors')
  await settle(game.room)
  game.host.chooseFirst(first)
  await settle(game.room)
}

/** Lo que el anfitrión le mandó al invitado (lo único `auto*` que viaja en ese sentido), ya parseado y con las partes juntas. */
function toGuest(room: MemoryRoom, kind?: AutoMessageKind): AutoMessage[] {
  const out = room.sent.filter(isAutoText).flatMap((text) => {
    const message = parseAutoMessage(text)

    return message && GUEST_ACCEPTS.includes(message.t) ? [message] : []
  })

  return kind ? out.filter((message) => message.t === kind) : out
}

const sessionOf = (link: OnlineLink) => link.getSnapshot().session!
const answers = (core: ReturnType<typeof fakeHost>) => core.commands.filter((command): command is Extract<AutoCommand, { t: 'answer' }> => command.t === 'answer')
/** La mesa del invitado es la que el anfitrión calcula para su asiento. */
function sameView(hostSession: AutoSession, guestSession: AutoSession, guestSeat: Seat) {
  const view = hostSession.viewOf!(guestSeat)!
  const mine = guestSession.getSnapshot()

  expect({ mine: mine.mine, theirs: mine.theirs, overlay: mine.overlay }).toEqual(view)
}

describe('el enlace del duelo automático por enlace', () => {
  afterEach(() => vi.useRealTimers())

  it('en la sala: el anfitrión espera el deck del invitado, revisa los dos y los dos quedan listos; con las cartas sin reglas, nadie', async () => {
    const game = setup()

    // En la sala en memoria los dos ya están: el anfitrión espera el deck.
    expect(game.hostLink.getSnapshot().phase).toBe('awaitingDeck')
    await settle(game.room)
    expect(game.hostLink.getSnapshot()).toMatchObject({ phase: 'ready', problems: { mine: [], theirs: 0, reason: null }, session: null, seat: null })
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'ready', problems: { mine: [], theirs: 0, reason: null }, session: null })
    // El anfitrión sabe cómo es cada carta del duelo (los nombres para listar las que faltan).
    expect(game.hostLink.getSnapshot().cards.get(2)).toEqual({ code: 2, type: 0x21, name: 'Carta 2' })
    // Ni la mano ni el deck del anfitrión viajan en la sala: sólo la revisión.
    expect(toGuest(game.room).map((message) => message.t)).toEqual(['autoCheck'])

    const blocked = setup({ noRules: [2] })

    await settle(blocked.room)
    expect(blocked.hostLink.getSnapshot()).toMatchObject({ phase: 'blocked', problems: { mine: [], theirs: 1, reason: null } })
    expect(blocked.guestLink.getSnapshot()).toMatchObject({ phase: 'blocked', problems: { mine: [2], theirs: 0, reason: null } })
  })

  it('apagado en el despliegue (o con otra versión del protocolo), nadie puede empezar y se dice por qué', async () => {
    const game = setup({ enabled: false })

    await settle(game.room)
    expect(game.hostLink.getSnapshot()).toMatchObject({ phase: 'blocked', problems: { reason: 'off' } })
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'blocked', problems: { reason: 'off' } })

    const other = setup()

    await settle(other.room)
    other.room.inject(other.hostEnd, encodeAutoMessage({ t: 'autoDeck', v: 2, main: [], extra: [] }))
    await settle(other.room)
    expect(other.hostLink.getSnapshot()).toMatchObject({ phase: 'blocked', problems: { reason: 'version' } })
    expect(other.guestLink.getSnapshot()).toMatchObject({ phase: 'blocked', problems: { reason: 'version' } })
  })

  it('un invitado sin el duelo automático (una versión vieja) nunca manda su deck: a los 10 s, «tiene que actualizar»', () => {
    vi.useFakeTimers()
    const room = createMemoryRoom()
    const hostEnd = room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings: { ...DEFAULT_SETTINGS, auto: true } })
    const link = createHostLink({ transport: hostEnd, loader: listLoader(), deck: HOST_DECK, handSize: 5, makeTransport: fakeHost().factory, enabled: async () => true })

    host.subscribe(() => link.observe(host.getSnapshot()))
    createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })
    room.flush()
    expect(link.getSnapshot().phase).toBe('awaitingDeck')
    vi.advanceTimersByTime(9000)
    expect(link.getSnapshot().phase).toBe('awaitingDeck')
    vi.advanceTimersByTime(1000)
    expect(link.getSnapshot().phase).toBe('outdated')
    link.destroy()
  })

  it('al elegir quién empieza: el anfitrión arma el duelo con el asiento del invitado remoto, le cuenta cómo empieza y el invitado juega su pregunta; su mesa es la que el anfitrión calcula para él', async () => {
    // Beto va primero (asiento 0 del núcleo): las preguntas 0 y 1 son suyas, la 2 de Ana.
    const game = setup({ firstCode: 2 })

    await settle(game.room)
    await order(game, 1)
    const [init] = toGuest(game.room, 'autoInit') as Extract<AutoMessage, { t: 'autoInit' }>[]

    expect(init).toMatchObject({ seed: 11, seat: 0, players: [{ hand: 5 }, { hand: 5 }], mine: { main: [2, 2, 2, 2, 2], extra: [], hand: [] }, theirs: { main: 5, extra: 0 } })
    expect(game.core.commands[0]).toMatchObject({ t: 'create', seed: 11, decks: [{ main: [2, 2, 2, 2, 2] }, { main: [1, 1, 1, 1, 1] }] })
    expect(game.hostLink.getSnapshot()).toMatchObject({ phase: 'playing', seat: 1 })
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'playing', seat: 0 })
    const hosted = sessionOf(game.hostLink)
    const guested = sessionOf(game.guestLink)

    // El anfitrión espera; el invitado tiene la pregunta (con el mismo askId que el núcleo).
    expect(hosted.getSnapshot()).toMatchObject({ status: 'waiting', ask: null, remoteAsk: { seat: 0, ask: { type: 'select_idlecmd' } } })
    expect(guested.getSnapshot()).toMatchObject({ status: 'ready', ask: { askId: hosted.getSnapshot().remoteAsk!.askId, seat: 0 } })
    sameView(hosted, guested, 0)

    // Contesta Beto dos veces; la tercera es de Ana: Beto queda esperando.
    for (let i = 0; i < 2; i += 1) {
      expect(guested.answer(END)).toBe(true)
      await settle(game.room)
    }
    expect(hosted.getSnapshot()).toMatchObject({ status: 'ready', ask: { seat: 1, ask: CHAIN } })
    expect(guested.getSnapshot()).toMatchObject({ status: 'waiting', ask: null })
    expect(answers(game.core).map((command) => command.answer)).toEqual([END, END])
    sameView(hosted, guested, 0)
    expect(guested.getSnapshot().mine.hand).toHaveLength(3)

    // Contesta Ana: la pregunta vuelve a Beto.
    hosted.answer(PASS)
    await settle(game.room)
    expect(guested.getSnapshot()).toMatchObject({ status: 'ready', ask: { seat: 0 } })
    expect(hosted.getSnapshot().answers.map((answer) => answer.seat)).toEqual([0, 0, 1])
    sameView(hosted, guested, 0)
  })

  it('del invitado sólo vale la respuesta a la pregunta pendiente: una vieja, repetida o de otro tipo no llega al núcleo', async () => {
    const game = setup({ firstCode: 2 })

    await settle(game.room)
    await order(game, 1)
    const guested = sessionOf(game.guestLink)
    const first = guested.getSnapshot().ask!.askId

    guested.answer(END)
    await settle(game.room)
    const now = guested.getSnapshot().ask!.askId

    for (const message of [
      { t: 'autoAnswer', askId: first, answer: END },
      { t: 'autoAnswer', askId: now, answer: PASS },
      { t: 'autoAnswer', askId: now + 50, answer: END },
    ] as AutoMessage[])
      game.room.inject(game.hostEnd, encodeAutoMessage(message))
    // Basura del relay o de un cliente roto: nada.
    game.room.inject(game.hostEnd, '{"t":"autoAnswer","askId":"x"}')
    game.room.inject(game.hostEnd, `{"t":"autoDeck","v":1,"main":[[1,1]],"extra":[],"pad":"${'x'.repeat(20_000)}"}`)
    await settle(game.room)
    expect(answers(game.core)).toHaveLength(1)
    expect(sessionOf(game.hostLink).getSnapshot().remoteAsk?.askId).toBe(now)
  })

  it('el invitado que vuelve (otra página) pide el duelo: recibe cómo empezó, cuántas preguntas suyas ya pasaron y lo mandado, y queda con la misma mesa y la misma pregunta', async () => {
    const game = setup({ firstCode: 2 })

    await settle(game.room)
    await order(game, 1)
    const guested = sessionOf(game.guestLink)

    guested.answer(END)
    await settle(game.room)
    guested.answer(END)
    await settle(game.room)
    sessionOf(game.hostLink).answer(PASS)
    await settle(game.room)
    const before = guested.getSnapshot()

    expect(before.ask).not.toBeNull()
    // Se recarga la página de Beto: otro enlace sobre la misma conexión.
    game.guestLink.destroy()
    const again = createGuestLink({ transport: game.guestEnd, source, deck: GUEST_DECK })

    again.observe(game.guest.getSnapshot())
    await settle(game.room)
    const after = sessionOf(again).getSnapshot()

    expect(after.status).toBe('ready')
    expect(after.ask).toEqual(before.ask)
    expect({ mine: after.mine, theirs: after.theirs, overlay: after.overlay }).toEqual({ mine: before.mine, theirs: before.theirs, overlay: before.overlay })
    expect(after.replaying).toBe(false)
    sameView(sessionOf(game.hostLink), sessionOf(again), 0)
    // Lo mandado viajó en tandas, con un `autoReplay` adelante que salta las 2 preguntas de Beto ya contestadas (la tercera respuesta fue de Ana).
    expect(toGuest(game.room, 'autoReplay').at(-1)).toEqual({ t: 'autoReplay', skip: 2 })
    expect(toGuest(game.room, 'autoBatch').length).toBeGreaterThan(0)
    // Y sigue jugando.
    expect(sessionOf(again).answer(END)).toBe(true)
    await settle(game.room)
    expect(answers(game.core)).toHaveLength(4)
    // Pedirlo sin parar no hace que el anfitrión lo mande sin parar (uno cada 5 s, dos de golpe).
    const inits = toGuest(game.room, 'autoInit').length

    for (let i = 0; i < 10; i += 1) game.room.inject(game.hostEnd, encodeAutoMessage({ t: 'autoResync' }))
    await settle(game.room)
    expect(toGuest(game.room, 'autoInit').length - inits).toBeLessThanOrEqual(2)
  })

  it('el anfitrión corta lo que piensa el núcleo: el invitado recibe la re-emisión y vuelve a su pregunta; un pedido suyo en medio espera a que termine', async () => {
    const game = setup({ firstCode: 2 })

    await settle(game.room)
    await order(game, 1)
    const guested = sessionOf(game.guestLink)
    const hosted = sessionOf(game.hostLink)

    guested.answer(END)
    await settle(game.room)
    const before = guested.getSnapshot()

    // El núcleo se queda pensando la respuesta de Beto; Ana corta.
    game.core.state.hold = true
    guested.answer(END)
    await settle(game.room)
    game.core.state.hold = false
    hosted.cancel()
    // Beto pide el duelo justo mientras se re-simula: se le manda cuando termina.
    const inits = toGuest(game.room, 'autoInit').length

    game.room.inject(game.hostEnd, encodeAutoMessage({ t: 'autoResync' }))
    game.room.flush()
    expect(toGuest(game.room, 'autoInit')).toHaveLength(inits)
    await settle(game.room)
    expect(toGuest(game.room, 'autoInit')).toHaveLength(inits + 1)
    const back = sessionOf(game.guestLink).getSnapshot()

    expect(toGuest(game.room, 'autoReplay')).toContainEqual({ t: 'autoReplay', skip: 1 })
    expect(back).toMatchObject({ status: 'ready', replaying: false, ask: { seat: 0 } })
    expect(back.ask!.askId).toBe(hosted.getSnapshot().remoteAsk!.askId)
    expect({ mine: back.mine, theirs: back.theirs, overlay: back.overlay }).toEqual({ mine: before.mine, theirs: before.theirs, overlay: before.overlay })
    sameView(hosted, sessionOf(game.guestLink), 0)
  })

  it('el núcleo rechaza una respuesta: el invitado se entera sólo si era suya (la pregunta vuelve a él)', async () => {
    const room = createMemoryRoom()
    const hostEnd = room.join()
    const guestEnd = room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings: { ...DEFAULT_SETTINGS, auto: true } })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    // Ana (asiento 0) y Beto (1) se turnan; la primera respuesta de cada uno se rechaza: `RETRY` y la misma pregunta otra vez.
    const rejected = new Set<string>()
    const core = fakeHost(
      (k) => (k % 2) as Seat,
      (command, emit) => {
        if (command.t !== 'answer' || rejected.has(command.answer.type)) return false
        rejected.add(command.answer.type)
        const seat: Seat = command.answer.type === 'select_idlecmd' ? 0 : 1

        emit({ t: 'fault', kind: 'retry', message: `RETRY: the core rejected the answer to ${command.answer.type}` })
        emit({ t: 'ask', seat, askId: command.askId, ask: seat === 0 ? IDLE : CHAIN })
        return true
      },
    )
    const hostLink = createHostLink({ transport: hostEnd, loader: listLoader(), deck: HOST_DECK, handSize: 5, makeTransport: core.factory, enabled: async () => true })
    const guestLink = createGuestLink({ transport: guestEnd, source, deck: GUEST_DECK })

    host.subscribe(() => hostLink.observe(host.getSnapshot()))
    guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
    await settle(room)
    await order({ room, hostEnd, guestEnd, host, guest, hostLink, guestLink, core }, 0)
    const hosted = sessionOf(hostLink)
    const guested = sessionOf(guestLink)

    // Ana juega y el núcleo se la rechaza: a Beto no le llega nada de eso.
    hosted.answer(END)
    await settle(room)
    expect(toGuest(room, 'autoEvent').filter((message) => message.t === 'autoEvent' && message.event.t === 'fault')).toEqual([])
    hosted.answer(END)
    await settle(room)
    // A Beto se le rechaza la suya: lo ve, y la pregunta vuelve a él.
    guested.answer(PASS)
    await settle(room)
    const faults = toGuest(room, 'autoEvent').flatMap((message) => (message.t === 'autoEvent' && message.event.t === 'fault' ? [message.event] : []))

    expect(faults).toEqual([{ t: 'fault', kind: 'retry', message: 'RETRY: the core rejected the answer to select_chain' }])
    expect(guested.getSnapshot()).toMatchObject({ status: 'ready', ask: { ask: CHAIN }, faults: [{ kind: 'retry' }] })
    guested.answer(PASS)
    await settle(room)
    expect(hosted.getSnapshot().answers.map((answer) => answer.seat)).toEqual([0, 1])
  })

  it('el fin del duelo, la revancha (otra sesión con otra semilla) y el anfitrión que recarga sin guardado: el duelo se pierde y la sala sigue', async () => {
    const game = setup({ firstCode: 2 })

    await settle(game.room)
    await order(game, 1)
    const firstHost = sessionOf(game.hostLink)

    game.guest.concede()
    await settle(game.room)
    expect(game.hostLink.getSnapshot().phase).toBe('ended')
    expect(game.guestLink.getSnapshot().phase).toBe('ended')
    game.host.rematch()
    game.guest.rematch()
    await settle(game.room)
    // De vuelta en la sala: la sesión vieja ya no está.
    expect(game.hostLink.getSnapshot()).toMatchObject({ phase: 'ready', session: null })
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'ready', session: null })
    game.guest.chooseFirst(0)
    await settle(game.room)
    const inits = toGuest(game.room, 'autoInit') as Extract<AutoMessage, { t: 'autoInit' }>[]

    expect(inits.map((init) => [init.seed, init.seat])).toEqual([
      [11, 0],
      [22, 1],
    ])
    expect(sessionOf(game.hostLink)).not.toBe(firstHost)
    expect(game.hostLink.getSnapshot()).toMatchObject({ phase: 'playing', seat: 0 })
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'playing', seat: 1 })

    // Ana recarga la página (sin guardado): su sala nueva se entera de quién empezaba por Beto, pero el duelo no está en ningún lado.
    game.hostLink.destroy()
    game.hostEnd.close()
    const hostEnd = game.room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-2', settings: { ...DEFAULT_SETTINGS, auto: true } })
    const hostLink = createHostLink({ transport: hostEnd, loader: listLoader(), deck: HOST_DECK, handSize: 5, makeTransport: fakeHost().factory, enabled: async () => true })

    host.subscribe(() => hostLink.observe(host.getSnapshot()))
    hostLink.observe(host.getSnapshot())
    await settle(game.room)
    expect(host.getSnapshot().opening.ordered).toBe(true)
    expect(hostLink.getSnapshot()).toMatchObject({ phase: 'lost', problems: { reason: 'lost' }, session: null })
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'lost', problems: { reason: 'lost' } })
  })

  it('al invitado no le llega nada del asiento del anfitrión; en una sala manual, los mensajes automáticos no se escuchan', async () => {
    const game = setup({ firstCode: 2 })

    await settle(game.room)
    await order(game, 1)
    const guested = sessionOf(game.guestLink)

    guested.answer(END)
    await settle(game.room)
    guested.answer(END)
    await settle(game.room)
    const events = toGuest(game.room).flatMap((message): AutoEvent[] => (message.t === 'autoEvent' ? [message.event] : message.t === 'autoBatch' ? message.events : []))

    expect(events.some((event) => event.t === 'events')).toBe(true)
    expect(events.filter((event) => (event.t === 'events' || event.t === 'ask' || event.t === 'stats') && event.seat !== 0)).toEqual([])

    // Sala manual: un `autoInit` (de quien sea) no arma nada en el invitado, y el anfitrión no contesta a los `auto*`.
    const room = createMemoryRoom()
    const hostEnd = room.join()
    const guestEnd = room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1' })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    const hostLink = createHostLink({ transport: hostEnd, loader: listLoader(), deck: HOST_DECK, handSize: 5, makeTransport: fakeHost().factory, enabled: async () => true })
    const guestLink = createGuestLink({ transport: guestEnd, source, deck: GUEST_DECK })

    host.subscribe(() => hostLink.observe(host.getSnapshot()))
    guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
    await settle(room)
    room.inject(guestEnd, encodeAutoMessage(toGuest(game.room, 'autoInit')[0]!))
    room.inject(hostEnd, encodeAutoMessage({ t: 'autoResync' }))
    await settle(room)
    expect(guestLink.getSnapshot()).toMatchObject({ phase: 'idle', session: null })
    expect(hostLink.getSnapshot().phase).toBe('idle')
    expect(room.sent.filter(isAutoText)).toEqual([])
  })
})
