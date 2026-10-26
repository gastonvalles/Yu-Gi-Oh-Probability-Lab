import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardData, type CardRow, type DataLoader, type DataSource } from '../app/auto/auto-data'
import { autoSaveStore, type AutoSaveStore } from '../app/auto/auto-save'
import type { AutoSession } from '../app/auto/auto-session'
import type { DeckList } from '../app/auto/deck-map'
import { codesOf, createGuestLink, createHostLink, MANUAL_WAIT_MS, underControl, type OnlineLink } from '../app/auto/online'
import { encodeAutoMessage, GUEST_ACCEPTS, HOST_ACCEPTS, isAutoText, parseAutoMessage, type AutoMessage, type AutoMessageKind } from '../app/auto/online-protocol'
import { LOCATION as L, POSITION as P, type AutoCommand, type AutoEvent, type CoreAsk, type Seat } from '../app/auto/protocol'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel, type Duel } from '../app/duel-session'
import type { Duelist } from '../app/life-calculator'
import type { MatState } from '../app/practice-mat'
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

/** `flaky`: mientras `down`, lo que manda el anfitrión se pierde sin que nadie se entere (su red se cayó y el relay no lo sabe: la presencia no cambia). */
function setup({ seatOf, firstCode, enabled = true, noRules = [], seeds = [11, 22, 33], react, save, flaky }: { seatOf?: (k: number) => Seat; firstCode?: number; enabled?: boolean; noRules?: number[]; seeds?: number[]; react?: Parameters<typeof fakeHost>[1]; save?: AutoSaveStore; flaky?: { down: boolean } } = {}): Game {
  const room = createMemoryRoom()
  const hostEnd = room.join()
  const guestEnd = room.join()
  const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings: { ...DEFAULT_SETTINGS, auto: true } })
  const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
  const core = fakeHost(seatOf, react, firstCode)
  const random = () => (seeds.shift() ?? 99) / 2 ** 32
  const transport = flaky ? { send: (text: string) => void (flaky.down || hostEnd.send(text)), onMessage: hostEnd.onMessage.bind(hostEnd) } : hostEnd
  const hostLink = createHostLink({ transport, loader: listLoader(noRules), deck: HOST_DECK, handSize: 5, makeTransport: core.factory, enabled: async () => enabled, random, ...(save ? { save } : {}) })
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

  it('codesOf: las cartas de un evento, también las que nombran sus rótulos (`description` y las opciones de `select_option`); no los textos del sistema ni los números de `announce_number`', () => {
    const ask = (body: CoreAsk): AutoEvent => ({ t: 'ask', seat: 0, askId: 1, ask: body })

    expect([...codesOf(ask({ type: 'select_option', player: 0, options: [String((94103142n << 20n) | 3n), '573'] }))]).toEqual([94103142])
    expect([...codesOf(ask({ type: 'select_yesno', player: 0, description: String(55n << 20n) }))]).toEqual([55])
    expect([...codesOf(ask({ type: 'announce_number', player: 0, options: [String(94103142n << 20n)] }))]).toEqual([])
  })

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

  it('el anfitrión que se reconecta (se le cayó la red sin que el relay se entere) le repone al invitado lo que se perdió; reponerlo de más no duplica nada', async () => {
    const flaky = { down: false }
    const game = setup({ firstCode: 2, flaky })

    await settle(game.room)
    await order(game, 1)
    const hosted = sessionOf(game.hostLink)

    // Beto contesta con la red de Ana caída: lo que sigue (su próxima pregunta) no le llega y queda esperando.
    flaky.down = true
    sessionOf(game.guestLink).answer(END)
    await settle(game.room)
    expect(hosted.getSnapshot().remoteAsk).not.toBeNull()
    expect(sessionOf(game.guestLink).getSnapshot().ask).toBeNull()
    // Vuelve la conexión de Ana (la pantalla lo ve): Beto recibe el duelo otra vez, con su pregunta.
    flaky.down = false
    game.hostLink.resync()
    await settle(game.room)
    expect(sessionOf(game.guestLink).getSnapshot()).toMatchObject({ status: 'ready', ask: { askId: hosted.getSnapshot().remoteAsk!.askId } })
    sameView(hosted, sessionOf(game.guestLink), 0)
    // Dos veces seguidas: la misma mesa, sin jugadas repetidas, y el duelo sigue.
    game.hostLink.resync()
    await settle(game.room)
    sameView(hosted, sessionOf(game.guestLink), 0)
    expect(sessionOf(game.guestLink).answer(END)).toBe(true)
    await settle(game.room)
    expect(answers(game.core)).toHaveLength(2)
    sameView(hosted, sessionOf(game.guestLink), 0)
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

  it('re-simulando (Ana corta con su pregunta en pie), al invitado le llega todo en lotes y el último sale al terminar, aunque después no haya nada más que mandar', async () => {
    const game = setup({ firstCode: 2 })

    await settle(game.room)
    await order(game, 1)
    const guested = sessionOf(game.guestLink)
    const hosted = sessionOf(game.hostLink)

    guested.answer(END)
    await settle(game.room)
    guested.answer(END)
    await settle(game.room)
    expect(hosted.getSnapshot()).toMatchObject({ status: 'ready', ask: { seat: 1 } })
    const mark = game.room.sent.length

    hosted.cancel()
    await settle(game.room)
    const kinds = game.room.sent.slice(mark).map((text) => parseAutoMessage(text)!.t)

    expect(kinds[0]).toBe('autoReplay')
    expect(kinds.slice(1).every((kind) => kind === 'autoBatch')).toBe(true)
    expect(kinds.length).toBeGreaterThan(1)
    expect(guested.getSnapshot()).toMatchObject({ status: 'waiting', replaying: false })
    sameView(hosted, guested, 0)
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

    // La revancha: Beto le manda su deck otra vez (el anfitrión recargado no lo tenía revisado) y los dos quedan listos para el próximo.
    const decks = game.room.sent.filter((text) => text.startsWith('{"t":"autoDeck"')).length

    host.rematch()
    game.guest.rematch()
    await settle(game.room)
    expect(game.room.sent.filter((text) => text.startsWith('{"t":"autoDeck"')).length).toBeGreaterThan(decks)
    expect(hostLink.getSnapshot()).toMatchObject({ phase: 'ready', problems: { reason: null } })
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'ready', problems: { reason: null } })
  })

  it('lo que el invitado tiraría (un evento que no pasa su revisión) no se manda: el duelo se pierde para los dos', async () => {
    let emit: (event: AutoEvent) => void = () => {}
    const game = setup({ firstCode: 2, react: (_command, next) => ((emit = next), false) })

    await settle(game.room)
    await order(game, 1)
    emit({ t: 'ask', seat: 0, askId: 900, ask: { type: 'select_nada' } as unknown as CoreAsk })
    await settle(game.room)
    expect(game.room.sent.some((text) => text.includes('select_nada'))).toBe(false)
    expect(game.hostLink.getSnapshot().phase).toBe('lost')
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'lost', problems: { reason: 'lost' } })
  })

  it('un evento que no entra ni en 16 partes: el duelo se pierde, el núcleo se para y lo guardado se borra (al recargar no se rearma para perderse otra vez)', async () => {
    const items = new Map<string, string>()
    const save = autoSaveStore('ROOMBIG1', { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key) })
    let emit: (event: AutoEvent) => void = () => {}
    const game = setup({ firstCode: 2, save, react: (_command, next) => ((emit = next), false) })

    await settle(game.room)
    await order(game, 1)
    sessionOf(game.guestLink).answer(END)
    await settle(game.room)
    expect(items.size).toBe(1)
    const hosted = sessionOf(game.hostLink)

    emit({ t: 'ask', seat: 0, askId: 900, ask: { type: 'announce_card', player: 0, opcodes: ['1'], cards: Array.from({ length: 30_000 }, (_, i) => 100_000_000 + i) } })
    await settle(game.room)
    expect(game.hostLink.getSnapshot()).toMatchObject({ phase: 'lost', session: hosted })
    expect(game.guestLink.getSnapshot().phase).toBe('lost')
    expect(items.size).toBe(0)
    // El núcleo ya no cuenta nada (ni al invitado).
    const before = game.room.sent.length
    const view = hosted.getSnapshot()

    emit({ t: 'events', seat: 0, n: 9, events: [{ type: 'lpupdate', player: 0, lp: 7000 }] })
    await settle(game.room)
    expect(game.room.sent.length).toBe(before)
    expect(hosted.getSnapshot()).toBe(view)
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

describe('pasar a manual', () => {
  afterEach(() => vi.useRealTimers())

  /** Lo `auto*` que le llegó a cada lado, en orden (pasar a manual viaja en los dos sentidos: `room.sent` no dice de quién es). */
  function inboxes(game: Game) {
    const of = (end: MemoryEnd, accepts: readonly AutoMessageKind[]) => {
      const box: AutoMessage[] = []

      end.onMessage((text) => {
        const message = isAutoText(text) ? parseAutoMessage(text) : null

        if (message && accepts.includes(message.t)) box.push(message)
      })
      return box
    }

    return { guest: of(game.guestEnd, GUEST_ACCEPTS), host: of(game.hostEnd, HOST_ACCEPTS) }
  }
  const manualOf = (link: OnlineLink) => link.getSnapshot().manual
  /** Lo que importa de una mesa para seguir a mano: cuántas cartas en cada lugar, la fase y el turno. */
  const shape = (state: MatState) => ({ deck: state.deck.length, hand: state.hand.length, gy: state.gy.length, banished: state.banished.length, extra: state.extra.length, mz: state.mz.filter(Boolean).length, st: state.st.filter(Boolean).length, phase: state.phase, turn: state.turn })

  /** Beto (invitado) va primero, contesta dos veces y queda la pregunta de Ana (la cadena). */
  async function playing(options: Parameters<typeof setup>[0] = {}) {
    const game = setup({ firstCode: 2, ...options })
    const box = inboxes(game)

    await settle(game.room)
    await order(game, 1)
    sessionOf(game.guestLink).answer(END)
    await settle(game.room)
    sessionOf(game.guestLink).answer(END)
    await settle(game.room)

    return { ...game, box, hosted: sessionOf(game.hostLink), guested: sessionOf(game.guestLink) }
  }

  it('el invitado pide y el anfitrión acepta: el anfitrión corta (su sí va detrás de todo lo que contó el núcleo), el núcleo no recibe nada más y cada uno sigue a mano con la mesa del corte', async () => {
    const game = await playing()

    expect(game.hosted.getSnapshot()).toMatchObject({ status: 'ready', ask: { seat: 1 } })
    game.guestLink.manual!(true)
    expect(manualOf(game.guestLink)).toBe('asking')
    await settle(game.room)
    expect(manualOf(game.hostLink)).toBe('asked')
    expect(game.box.host.at(-1)).toEqual({ t: 'autoManual', step: 'ask' })

    // El núcleo está quieto (espera a Ana): corta enseguida.
    game.hostLink.manual!(true)
    expect(game.hostLink.getSnapshot()).toMatchObject({ manual: 'agreed', manualDropped: false })
    await settle(game.room)
    expect(game.guestLink.getSnapshot()).toMatchObject({ manual: 'agreed', manualDropped: false })
    expect(game.box.guest.at(-1)).toEqual({ t: 'autoManual', step: 'yes' })
    sameView(game.hosted, game.guested, 0)

    // Desde el corte el núcleo no recibe nada: ni lo de Ana ni lo de Beto (que tampoco lo manda).
    const sent = answers(game.core).length
    const theirAsk = game.guested.getSnapshot().ask

    game.hosted.answer(PASS)
    game.room.inject(game.hostEnd, encodeAutoMessage({ t: 'autoAnswer', askId: theirAsk?.askId ?? 1, answer: END }))
    await settle(game.room)
    expect(answers(game.core)).toHaveLength(sent)
    sameView(game.hosted, game.guested, 0)

    // La sala sigue a mano: cada uno arma su mesa con la del corte, el otro la ve igual y una jugada de uno llega al otro.
    const guestTable = game.guested.getSnapshot().mine
    const hostTable = game.hosted.getSnapshot().mine

    game.guest.start(guestTable)
    game.host.start(hostTable)
    await settle(game.room)
    expect(shape(game.host.getSnapshot().theirs!.state)).toEqual(shape(guestTable))
    expect(shape(game.guest.getSnapshot().theirs!.state)).toEqual(shape(hostTable))
    expect(guestTable.hand).toHaveLength(3)
    game.guest.play({ type: 'move', id: guestTable.hand[0]!, to: 'gy' })
    await settle(game.room)
    expect(game.host.getSnapshot().theirs!.state.gy).toHaveLength(guestTable.gy.length + 1)
    expect(game.host.getSnapshot().theirs!.state.hand).toHaveLength(2)
  })

  it('el anfitrión pide y el invitado rechaza: nada cambia y el anfitrión lo ve; quien pide lo puede retirar y, sin respuesta, a los 30 s vence', async () => {
    const game = await playing()

    game.hostLink.manual!(true)
    await settle(game.room)
    expect(manualOf(game.guestLink)).toBe('asked')
    game.guestLink.manual!(false)
    await settle(game.room)
    expect(manualOf(game.hostLink)).toBe('declined')
    expect(manualOf(game.guestLink)).toBe('idle')
    // Sigue el automático: Ana contesta y el núcleo lo cuenta.
    const sent = answers(game.core).length

    game.hosted.answer(PASS)
    await settle(game.room)
    expect(answers(game.core)).toHaveLength(sent + 1)

    // Retirarlo: al otro se le va el pedido.
    game.hostLink.manual!(true)
    await settle(game.room)
    expect(manualOf(game.guestLink)).toBe('asked')
    game.hostLink.manual!(false)
    await settle(game.room)
    expect([manualOf(game.hostLink), manualOf(game.guestLink)]).toEqual(['idle', 'idle'])

    // Sin respuesta: vence y el otro deja de verlo.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    game.guestLink.manual!(true)
    game.room.flush()
    expect(manualOf(game.hostLink)).toBe('asked')
    vi.advanceTimersByTime(MANUAL_WAIT_MS - 1)
    expect(manualOf(game.guestLink)).toBe('asking')
    vi.advanceTimersByTime(1)
    game.room.flush()
    expect(manualOf(game.guestLink)).toBe('expired')
    expect(manualOf(game.hostLink)).toBe('idle')
  })

  it('si el duelo termina con un pedido en pie (alguien se rinde), el pedido se cae para los dos', async () => {
    const game = await playing()

    game.hostLink.manual!(true)
    await settle(game.room)
    expect([manualOf(game.hostLink), manualOf(game.guestLink)]).toEqual(['asking', 'asked'])
    game.guest.concede()
    await settle(game.room)
    expect([manualOf(game.hostLink), manualOf(game.guestLink)]).toEqual(['idle', 'idle'])
    // Terminado, tampoco se puede pedir.
    game.guestLink.manual!(true)
    expect(manualOf(game.guestLink)).toBe('idle')
  })

  it('el invitado acepta el pedido del anfitrión: espera el corte y pasa con el sí del anfitrión; con el núcleo pensando, el corte espera a la próxima pregunta', async () => {
    const game = await playing()

    // Ana contesta y el núcleo se queda pensando.
    game.core.state.hold = true
    game.hosted.answer(PASS)
    await settle(game.room)
    game.hostLink.manual!(true)
    await settle(game.room)
    game.guestLink.manual!(true)
    expect(manualOf(game.guestLink)).toBe('switching')
    await settle(game.room)
    expect(manualOf(game.hostLink)).toBe('switching')
    expect(game.box.guest.some((message) => message.t === 'autoManual' && message.step === 'yes')).toBe(false)

    // Ana corta lo que piensa: el núcleo vuelve a su pregunta y ahí se corta.
    game.core.state.hold = false
    game.hosted.cancel()
    await settle(game.room)
    expect([manualOf(game.hostLink), manualOf(game.guestLink)]).toEqual(['agreed', 'agreed'])
    expect(game.box.guest.at(-1)).toEqual({ t: 'autoManual', step: 'yes' })
    sameView(game.hosted, game.guested, 0)
  })

  const MIDWAY: [string, CoreAsk][] = [
    ['el sí o no de un efecto', { type: 'select_effectyn', player: 1, code: 1, controller: 1, location: L.HAND, sequence: 0, position: 10, description: '16' }],
    ['una cadena obligatoria', { type: 'select_chain', player: 1, spe_count: 1, forced: true, hint_timing: 0, hint_timing_other: 0, selects: [] }],
  ]

  it.each(MIDWAY)('pedirlo los dos a la vez es un sí; lo que quedó a medio jugar (%s) se descarta y los dos lo saben', async (_what, ask) => {
    // La pregunta de Ana (la tercera) deja algo a medio jugar si se corta ahí.
    const game = await playing({
      react: (command, emit) => {
        if (command.t !== 'answer' || command.askId !== 2) return false
        emit({ t: 'ask', seat: 1, askId: 500, ask })
        return true
      },
    })

    expect(game.hosted.getSnapshot().ask?.ask.type).toBe(ask.type)
    game.hostLink.manual!(true)
    game.guestLink.manual!(true)
    await settle(game.room)
    expect(game.hostLink.getSnapshot()).toMatchObject({ manual: 'agreed', manualDropped: true })
    expect(game.guestLink.getSnapshot()).toMatchObject({ manual: 'agreed', manualDropped: true })
    expect(game.box.guest.at(-1)).toEqual({ t: 'autoManual', step: 'yes', dropped: true })
  })

  it('con una carta bajo el control del otro el anfitrión no corta: los dos lo ven y el duelo sigue en automático', async () => {
    // Beto invoca la carta que robó y Ana se la queda (como Cambio de Corazón).
    let moved = false
    const game = await playing({
      react: (command, emit) => {
        if (command.t !== 'answer' || moved) return false
        moved = true
        const hand = { controller: 0 as Seat, location: L.HAND, sequence: 0, position: P.FACEDOWN }
        const mine = { controller: 0 as Seat, location: L.MZONE, sequence: 0, position: P.FACEUP_ATTACK }
        const theirs = { controller: 1 as Seat, location: L.MZONE, sequence: 0, position: P.FACEUP_ATTACK }

        for (const viewer of [0, 1] as const) {
          emit({ t: 'events', seat: viewer, n: 0, events: [{ type: 'move', card: 2, from: hand, to: mine }, { type: 'move', card: 2, from: mine, to: theirs }] })
        }
        return false
      },
    })

    expect(underControl(game.hosted.getSnapshot().mine)).toBe(true)
    expect(underControl(game.guested.getSnapshot().theirs)).toBe(true)
    game.guestLink.manual!(true)
    await settle(game.room)
    game.hostLink.manual!(true)
    await settle(game.room)
    expect([manualOf(game.hostLink), manualOf(game.guestLink)]).toEqual(['blocked', 'blocked'])
    expect(game.box.guest.at(-1)).toEqual({ t: 'autoManual', step: 'no', why: 'control' })
    // Sigue el automático.
    const sent = answers(game.core).length

    game.hosted.answer(PASS)
    await settle(game.room)
    expect(answers(game.core)).toHaveLength(sent + 1)
  })

  it('el invitado que recarga sin haber recibido el corte vuelve a recibir el duelo y el corte, con la misma mesa', async () => {
    const game = await playing()

    game.guestLink.manual!(true)
    await settle(game.room)
    game.hostLink.manual!(true)
    // El sí no llega: Beto recarga la página justo ahora.
    game.room.queue.splice(0)
    const before = game.guested.getSnapshot()

    game.guestLink.destroy()
    const again = createGuestLink({ transport: game.guestEnd, source, deck: GUEST_DECK })

    again.observe(game.guest.getSnapshot())
    await settle(game.room)
    expect(again.getSnapshot()).toMatchObject({ manual: 'agreed', phase: 'playing' })
    expect(sessionOf(again).getSnapshot().mine).toEqual(before.mine)
    sameView(game.hosted, sessionOf(again), 0)
  })

  it('el anfitrión que recarga después del corte rearma el núcleo en el mismo punto (no recibió nada más) y sigue cortado, sin repetir el corte solo', async () => {
    const items = new Map<string, string>()
    const save = () => autoSaveStore('ROOMMAN1', { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key) })
    const game = await playing({ save: save() })

    game.guestLink.manual!(true)
    await settle(game.room)
    game.hostLink.manual!(true)
    await settle(game.room)
    const cutAt = game.hosted.getSnapshot()

    expect(manualOf(game.guestLink)).toBe('agreed')
    // Lo de Ana después del corte no llega al núcleo ni se guarda.
    game.hosted.answer(PASS)
    await settle(game.room)
    // Beto ya está a mano (su enlace no sigue); Ana recarga con lo guardado.
    game.guestLink.destroy()
    game.hostLink.destroy()
    game.hostEnd.close()
    const yeses = () => game.room.sent.filter((text) => text.includes('"step":"yes"')).length
    const said = yeses()
    const hostEnd = game.room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-2', settings: { ...DEFAULT_SETTINGS, auto: true } })
    const core = fakeHost(undefined, undefined, 2)
    const hostLink = createHostLink({ transport: hostEnd, loader: listLoader(), deck: HOST_DECK, handSize: 5, makeTransport: core.factory, enabled: async () => true, save: save() })

    host.subscribe(() => hostLink.observe(host.getSnapshot()))
    hostLink.observe(host.getSnapshot())
    await settle(game.room)
    const rebuilt = sessionOf(hostLink).getSnapshot()

    expect(rebuilt).toMatchObject({ status: 'ready', replaying: false, ask: { seat: 1 } })
    expect(rebuilt.answers).toEqual(cutAt.answers)
    expect(rebuilt.mine).toEqual(cutAt.mine)
    expect(hostLink.getSnapshot()).toMatchObject({ manual: 'agreed', manualDropped: false })
    expect(yeses()).toBe(said)
    // Sigue cortado: lo de Ana tampoco llega al núcleo rearmado.
    sessionOf(hostLink).answer(PASS)
    await settle(game.room)
    expect(answers(core)).toEqual([])
    hostLink.destroy()
  })
})
