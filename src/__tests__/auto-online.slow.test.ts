import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cardMatchesOpcode } from 'ocgcore-wasm'
import { openAsk, type AskContext } from '../app/auto/ask-ui'
import { createDataLoader } from '../app/auto/auto-data'
import { autoSaveStore } from '../app/auto/auto-save'
import type { AutoSession, PendingAsk, TransportFactory } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import { bagOrder, teamOrder, type DeckList } from '../app/auto/deck-map'
import { codesOf, createGuestLink, createHostLink, type OnlineLink } from '../app/auto/online'
import { createReassembler, GUEST_ACCEPTS, isAutoText, MAX_WHOLE_BYTES, parseAutoMessage, type AutoMessage } from '../app/auto/online-protocol'
import { randomLegalPolicy, type Policy } from '../app/auto/policies'
import { parseAnswer, type AskOf, type AutoCommand, type AutoEvent, type CoreAnswer, type Seat } from '../app/auto/protocol'
import { byteLength } from '../app/duel-relay-rules'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel } from '../app/duel-session'
import type { Duelist } from '../app/life-calculator'
import { playAsk, seeded, seededKey } from './support/ask-ui-player'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, wasmBinary } from './support/core-data'
import { createMemoryRoom, type MemoryEnd, type MemoryRoom } from './support/memory-room'

/**
 * El duelo automático por enlace con el núcleo real (lento: `npm run test:auto`; se salta sin datos). Un anfitrión y un invitado en memoria (`createDuel` sobre `MemoryRoom`,
 * con `createHostLink` sobre `localTransport` y `createGuestLink` sin núcleo), con decks del meta, y un jugador al azar que sólo toca lo que la pantalla ofrece (`ask-ui`, como el
 * oráculo de `auto-ask-ui.slow.test.ts`) por los dos asientos. Comprueba: 0 `RETRY`; ningún fallo salvo errores de scripts; ningún código oculto en el cable (cada evento que
 * viaja es uno que el árbitro le dejó ver al invitado, y las cartas adjuntas son las de ese evento); la mesa del invitado es la que el anfitrión calcula para su asiento después de
 * cada tanda; el invitado que recarga a mitad de duelo (otro enlace) vuelve a la misma mesa y la misma pregunta, y el anfitrión que recarga rearma el duelo con lo guardado. Parámetros: ONLINE_PAIRS pares (2), ONLINE_FROM (0),
 * ONLINE_CAP preguntas por duelo (300), ONLINE_DUEL_S segundos por duelo (120), ONLINE_RELOAD_AT la pregunta en la que recarga el invitado (40), ONLINE_HOST_RELOAD_AT la
 * pregunta en la que recarga el anfitrión, que rearma el duelo con lo guardado (80), ONLINE_SEED (1).
 */
const PAIRS = Number(process.env.ONLINE_PAIRS ?? 2)
const FROM = Number(process.env.ONLINE_FROM ?? 0)
const CAP = Number(process.env.ONLINE_CAP ?? 300)
const DUEL_MS = Number(process.env.ONLINE_DUEL_S ?? 120) * 1000
const RELOAD_AT = Number(process.env.ONLINE_RELOAD_AT ?? 40)
const HOST_RELOAD_AT = Number(process.env.ONLINE_HOST_RELOAD_AT ?? 80)
const SEED = Number(process.env.ONLINE_SEED ?? 1)
const PREFS: AskContext['prefs'] = { chainMode: 'ask', placeMode: 'ask' }

/** JSON con las claves ordenadas: el mismo evento, venga del núcleo o del cable. */
const canon = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item))

/** Entrega lo pendiente de la sala y deja correr el núcleo (en el mismo proceso, con promesas) hasta que `done` o se acabe el tiempo. */
async function pump(room: MemoryRoom, done: () => boolean, ms = 60_000): Promise<boolean> {
  const start = performance.now()

  while (performance.now() - start < ms) {
    room.flush()
    if (done()) return true
    await new Promise((resolve) => setImmediate(resolve))
  }

  return false
}

/** Los dos lados quedaron quietos en el mismo punto: uno elige y el otro espera (con la misma pregunta), o terminó. */
function settled(host: AutoSession, guest: AutoSession): boolean {
  const a = host.getSnapshot()
  const b = guest.getSnapshot()

  if (a.status === 'error') return true
  if (a.replaying || b.replaying) return false
  if (a.status === 'ended') return b.status === 'ended'
  if (a.status === 'ready' && a.ask) return b.status === 'waiting'

  return a.status === 'waiting' && a.remoteAsk !== null && b.status === 'ready' && b.ask?.askId === a.remoteAsk.askId
}

const tally = { duels: 0, questions: 0, guestAnswers: 0, reloads: 0, hostReloads: 0, checks: 0, wire: 0, maxBytes: 0, peakPerStep: 0, resyncMessages: 0, resyncBytes: 0, ends: {} as Record<string, number>, notPreloaded: {} as Record<string, string>, ms: 0 }

describe.skipIf(!hasCoreData)('el duelo automático por enlace con el núcleo real (npm run test:auto)', () => {
  const rows = hasCoreData ? cardRows() : []
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const source = nodeSource(rows, store)
  const lists = hasCoreData ? (JSON.parse(readFileSync(path.join(process.cwd(), 'src/data/meta-decklists.json'), 'utf8')) as Record<string, DeckList>) : {}
  const ok = new Set(hasCoreData ? metaDecks(cards, store).map((deck) => deck.id) : [])
  const ids = Object.keys(lists).filter((id) => ok.has(id))
  const cardList = [...cards.values()]
  const typeOf = (code: number) => cards.get(code)?.type ?? 0
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const pickCard = (ask: AskOf<'announce_card'>, random: () => number) => {
    const opcodes = ask.opcodes.map(BigInt)
    const from = Math.floor(random() * cardList.length)

    for (let k = 0; k < cardList.length; k += 1) {
      const card = cardList[(from + k) % cardList.length]!

      if (cardMatchesOpcode(card, opcodes as never)) return card.code
    }

    return 0
  }

  /** Lo que haría una persona con la pantalla: toca al azar lo que `ask-ui` ofrece; si no hay nada que tocar, el bot del fuzz. */
  function play(session: AutoSession, pending: PendingAsk, random: () => number, fallback: Policy): CoreAnswer {
    const state = openAsk({ askId: pending.askId, ask: pending.ask, ...(pending.title === undefined ? {} : { title: pending.title }) }, { queries: session.adapter!, prefs: PREFS, typeOf })
    const played = playAsk(state, random)

    return played.answer && parseAnswer(played.answer) ? played.answer : fallback(pending.ask)
  }

  it.each(Array.from({ length: PAIRS }, (_, i) => FROM + i))('par %i: el invitado juega sin núcleo, ve sólo lo suyo, su mesa es la del anfitrión y vuelve igual tras recargar', async (pair) => {
    const started = performance.now()
    const hostId = ids[pair % ids.length]!
    const guestId = ids[(pair * 7 + 3) % ids.length] === hostId ? ids[(pair * 7 + 4) % ids.length]! : ids[(pair * 7 + 3) % ids.length]!
    const seed = (SEED * 100_003 + pair) >>> 0
    const random = seeded(seed)
    const room = createMemoryRoom()
    const settings = { ...DEFAULT_SETTINGS, auto: true }
    let hostEnd = room.join()
    const guestEnd = room.join()
    let host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    // Lo que cuenta el núcleo, tal cual sale del árbitro (por asiento), y los comandos que recibe.
    const coreEvents: AutoEvent[] = []
    const commands: AutoCommand[] = []
    const makeTransport: TransportFactory = (data) => {
      const inner = localTransport({ wasmBinary: wasm })(data)

      return {
        send: (command) => (commands.push(command), inner.send(command)),
        onEvent: (listener) => inner.onEvent((event) => (coreEvents.push(event), listener(event))),
        terminate: () => inner.terminate(),
      }
    }
    // Un reloj que corre solo: el marcapasos nunca frena (el ritmo lo prueba `auto-online-protocol.test.ts`).
    let clock = 0
    const now = () => (clock += 100)
    // Lo que el anfitrión guarda (en un `localStorage` en memoria, con el mismo reloj que el enlace: lo guardado vence) para rearmar el duelo si recarga.
    const items = new Map<string, string>()
    const save = autoSaveStore(`PAR${pair}`, { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key) }, now)
    const hostLinkOf = (transport: MemoryEnd) => createHostLink({ transport, loader: createDataLoader(source, null), deck: lists[hostId]!, handSize: 5, makeTransport, enabled: async () => true, now, newKey: seededKey(random), save })
    let hostLink: OnlineLink = hostLinkOf(hostEnd)
    let guestLink: OnlineLink = createGuestLink({ transport: guestEnd, source, deck: lists[guestId]!, now })
    let offGuest = guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
    let offHost = host.subscribe(() => hostLink.observe(host.getSnapshot()))

    hostLink.observe(host.getSnapshot())
    guestLink.observe(guest.getSnapshot())

    // La sala: los dos decks revisados, listos, piedra-papel-tijera y Ana elige (en los pares impares empieza Beto).
    expect(await pump(room, () => hostLink.getSnapshot().phase === 'ready' && guestLink.getSnapshot().phase === 'ready')).toBe(true)
    host.setReady(true)
    guest.setReady(true)
    room.flush()
    host.chooseMethod('rps')
    room.flush()
    host.pickRps('rock')
    guest.pickRps('scissors')
    room.flush()
    host.chooseFirst((pair % 2) as Duelist)
    const guestSeat: Seat = pair % 2 === 0 ? 1 : 0
    const hosted = () => hostLink.getSnapshot().session!
    const guested = () => guestLink.getSnapshot().session!

    expect(await pump(room, () => hostLink.getSnapshot().session !== null && guestLink.getSnapshot().session !== null && settled(hosted(), guested()))).toBe(true)
    expect(hostLink.getSnapshot().seat).toBe(1 - guestSeat)
    expect(guestLink.getSnapshot().seat).toBe(guestSeat)
    const bots: [Policy, Policy] = [randomLegalPolicy(seed, pickCard), randomLegalPolicy(seed + 1, pickCard)]
    // Cuántos mensajes le mandó el anfitrión al invitado hasta ahora (se cuentan de a poco: `room.sent` crece con todo el duelo).
    let counted = 0
    let toGuest = 0
    const toGuestCount = () => {
      for (; counted < room.sent.length; counted += 1) {
        const text = room.sent[counted]!

        if (isAutoText(text) && !text.startsWith('{"t":"autoAnswer') && !text.startsWith('{"t":"autoDeck') && !text.startsWith('{"t":"autoResync')) toGuest += 1
      }

      return toGuest
    }
    let end = 'cap'
    let sentBefore = toGuestCount()

    for (let q = 0; q < CAP; q += 1) {
      const a = hosted().getSnapshot()
      const b = guested().getSnapshot()

      expect(a.status, a.fault?.message).not.toBe('error')
      // Después de cada tanda: la mesa, el espejo del rival y el overlay del invitado son los que el anfitrión calcula para su asiento.
      expect({ mine: b.mine, theirs: b.theirs, overlay: b.overlay }).toEqual(hosted().viewOf!(guestSeat))
      tally.checks += 1
      tally.peakPerStep = Math.max(tally.peakPerStep, toGuestCount() - sentBefore)
      if (a.status === 'ended') {
        end = 'win'
        break
      }
      if (performance.now() - started > DUEL_MS) {
        end = 'slow'
        break
      }

      // A mitad de duelo, Beto recarga: otro enlace (y otra sesión) sobre la misma conexión; pide el duelo y queda igual.
      if (q === RELOAD_AT) {
        const before = { mine: b.mine, theirs: b.theirs, overlay: b.overlay, status: b.status, ask: b.ask }
        const wire = toGuestCount()
        const bytes = room.sent.reduce((sum, text) => sum + text.length, 0)

        offGuest()
        guestLink.destroy()
        guestLink = createGuestLink({ transport: guestEnd, source, deck: lists[guestId]!, now })
        offGuest = guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
        guestLink.observe(guest.getSnapshot())
        guestLink.resync()
        expect(await pump(room, () => guestLink.getSnapshot().session !== null && settled(hosted(), guested()))).toBe(true)
        const after = guested().getSnapshot()

        expect({ mine: after.mine, theirs: after.theirs, overlay: after.overlay, status: after.status, ask: after.ask }).toEqual(before)
        tally.reloads += 1
        tally.resyncMessages = Math.max(tally.resyncMessages, toGuestCount() - wire)
        tally.resyncBytes = Math.max(tally.resyncBytes, room.sent.reduce((sum, text) => sum + text.length, 0) - bytes)
      }

      // Más adelante recarga Ana: otra sala (que se entera por Beto de quién empezaba), otro enlace y otro núcleo; con lo guardado el duelo se rearma y los dos quedan igual.
      if (q === HOST_RELOAD_AT) {
        const view = (snap: ReturnType<AutoSession['getSnapshot']>) => ({ mine: snap.mine, theirs: snap.theirs, overlay: snap.overlay, status: snap.status, ask: snap.ask?.ask ?? null, remoteAsk: snap.remoteAsk?.ask ?? null })
        const before = [view(a), view(b)]

        offHost()
        hostLink.destroy()
        hostEnd.close()
        hostEnd = room.join()
        host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-2', settings })
        hostLink = hostLinkOf(hostEnd)
        offHost = host.subscribe(() => hostLink.observe(host.getSnapshot()))
        hostLink.observe(host.getSnapshot())
        expect(await pump(room, () => hostLink.getSnapshot().session !== null && guestLink.getSnapshot().session !== null && settled(hosted(), guested()), DUEL_MS)).toBe(true)
        expect([view(hosted().getSnapshot()), view(guested().getSnapshot())]).toEqual(before)
        tally.hostReloads += 1
      }

      sentBefore = toGuestCount()
      tally.questions += 1
      if (a.status === 'ready') hosted().answer(play(hosted(), a.ask!, random, bots[1 - guestSeat]!))
      else {
        tally.guestAnswers += 1
        guested().answer(play(guested(), guested().getSnapshot().ask!, random, bots[guestSeat]!))
      }
      if (!(await pump(room, () => settled(hosted(), guested()), DUEL_MS))) {
        const state = (snap: ReturnType<AutoSession['getSnapshot']>) => ({ status: snap.status, replaying: snap.replaying, ask: snap.ask && { askId: snap.ask.askId, type: snap.ask.ask.type }, remoteAsk: snap.remoteAsk && { askId: snap.remoteAsk.askId, type: snap.remoteAsk.ask.type }, faults: snap.faults, answers: snap.answers.length })

        throw new Error(`par ${pair}, pregunta ${q}: no se calmó. Anfitrión ${JSON.stringify(state(hosted().getSnapshot()))}; invitado ${JSON.stringify(state(guested().getSnapshot()))}; últimos del núcleo ${JSON.stringify(coreEvents.slice(-4)).slice(0, 1500)}`)
      }
    }
    tally.ends[end] = (tally.ends[end] ?? 0) + 1

    // El cable: lo que viajó al invitado es exactamente lo que el árbitro le dejó ver (eventos de su asiento, sin los del anfitrión), con las cartas de esos eventos.
    const allowed = new Set(coreEvents.filter((event) => (event.t !== 'events' && event.t !== 'ask' && event.t !== 'stats') || event.seat === guestSeat).map(canon))
    const parts = createReassembler(() => 0)
    const messages = room.sent.filter(isAutoText).flatMap((text): AutoMessage[] => {
      const message = parseAutoMessage(text)

      if (!message || !GUEST_ACCEPTS.includes(message.t)) return []
      tally.wire += 1
      tally.maxBytes = Math.max(tally.maxBytes, byteLength(text))
      if (message.t !== 'autoPart') return [message]
      const whole = parts.push(message)
      const inner = whole === null ? null : parseAutoMessage(whole, MAX_WHOLE_BYTES)

      return inner ? [inner] : []
    })
    const create = commands.find((command): command is Extract<AutoCommand, { t: 'create' }> => command.t === 'create')!

    // La clave del duelo no viaja (ni por nombre ni entera ni sus mitades) y el Main del invitado va por código: con el orden real (`teamOrder`) sabría sus robos.
    const key = create.key!

    expect(room.sent.some((text) => text.includes('seed') || text.includes('"key"') || [key, key.slice(0, 32), key.slice(32)].some((part) => text.includes(part)))).toBe(false)
    expect(bagOrder(create.decks[guestSeat]!.main)).not.toEqual(teamOrder(create, guestSeat))
    for (const message of messages) {
      if (message.t === 'autoInit') {
        expect(message).toMatchObject({ seat: guestSeat, mine: { main: bagOrder(create.decks[guestSeat]!.main), extra: create.decks[guestSeat]!.extra }, theirs: { main: create.decks[1 - guestSeat]!.main.length, extra: create.decks[1 - guestSeat]!.extra.length } })
        continue
      }
      if (message.t !== 'autoEvent' && message.t !== 'autoBatch') continue
      const events = message.t === 'autoEvent' ? [message.event] : message.events
      const named = new Set<number>()

      for (const event of events) {
        codesOf(event, named)
        // Las fallas viajan resumidas (sin el detalle, que puede nombrar cartas).
        if (event.t === 'fault') expect(event.kind === 'retry' || event.message.endsWith('on the host')).toBe(true)
        else expect(allowed.has(canon(event)), canon(event).slice(0, 300)).toBe(true)
      }
      for (const card of message.cards ?? []) expect(named.has(card.code)).toBe(true)
    }
    // Ningún RETRY y ningún fallo que no sea de un script. Un script que le pide al núcleo una carta que no está en ninguno de los dos decks
    // («card data not preloaded»: los datos son los de los decks y las fichas, igual que en «Jugar solo») no es del enlace: se cuenta aparte.
    const faults = coreEvents.flatMap((event) => (event.t === 'fault' ? [event] : []))

    expect(faults.filter((fault) => fault.kind !== 'script')).toEqual([])
    expect([...hosted().getSnapshot().faults, ...guested().getSnapshot().faults].filter((fault) => fault.kind !== 'script')).toEqual([])
    for (const fault of faults) if (fault.message.startsWith('card data not preloaded')) tally.notPreloaded[`${fault.cards?.[0]}`] = `${hostId}/${guestId}`
    tally.duels += 1
    tally.ms += performance.now() - started
    offGuest()
    offHost()
    guestLink.destroy()
    hostLink.destroy()
  }, 30 * 60 * 1000)

  it('comprobó lo que dice: cada par, las mesas en cada tanda y las recargas del invitado y del anfitrión', () => {
    console.log(JSON.stringify({ ...tally, ms: Math.round(tally.ms) }))
    expect(tally.duels).toBe(PAIRS)
    // Recarga cada uno una vez por par (si el duelo llegó a esa pregunta).
    expect(tally.reloads).toBeGreaterThan(0)
    expect(tally.hostReloads).toBeGreaterThan(0)
    expect(tally.guestAnswers).toBeGreaterThan(0)
    expect(tally.checks).toBeGreaterThan(PAIRS * Math.min(CAP, RELOAD_AT))
  })
})

