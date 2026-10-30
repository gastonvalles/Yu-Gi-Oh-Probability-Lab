import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cardMatchesOpcode } from 'ocgcore-wasm'
import { openAsk, type AskContext } from '../app/auto/ask-ui'
import { createDataLoader } from '../app/auto/auto-data'
import { autoSaveStore } from '../app/auto/auto-save'
import { undoPoint, type AutoSession, type PendingAsk } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { createGuestLink, createHostLink, type OnlineLink } from '../app/auto/online'
import { randomLegalPolicy, type Policy } from '../app/auto/policies'
import { parseAnswer, type AskOf, type CoreAnswer, type Seat } from '../app/auto/protocol'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel } from '../app/duel-session'
import { playAsk, seeded, seededKey } from './support/ask-ui-player'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, wasmBinary } from './support/core-data'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'

/**
 * Deshacer en el duelo por enlace con el núcleo real (lento: `npm run test:auto`; se salta sin datos). Un anfitrión y un invitado en memoria con decks del meta y un jugador al azar
 * que toca lo que la pantalla ofrece; en cada par, a la pregunta CUT + par × STEP, pide deshacer el que tiene la decisión (o, si no tiene jugada propia, el otro): primero el otro
 * rechaza (nada cambia) y después acepta. El núcleo vuelve a antes de la última jugada de quien pidió (las respuestas, recortadas ahí), las dos mesas son las que había en ese
 * punto, el duelo sigue y el anfitrión que recarga lo rearma igual. UNDO_PAIRS pares (8), UNDO_CUT (10), UNDO_STEP (9).
 */
const PAIRS = Number(process.env.UNDO_PAIRS ?? 8)
const CUT = Number(process.env.UNDO_CUT ?? 10)
const STEP = Number(process.env.UNDO_STEP ?? 9)
const PREFS: AskContext['prefs'] = { chainMode: 'ask', placeMode: 'ask' }

async function pump(room: MemoryRoom, done: () => boolean, ms = 60_000): Promise<boolean> {
  const start = performance.now()

  while (performance.now() - start < ms) {
    room.flush()
    if (done()) return true
    await new Promise((resolve) => setImmediate(resolve))
  }

  return false
}

function settled(host: AutoSession, guest: AutoSession): boolean {
  const a = host.getSnapshot()
  const b = guest.getSnapshot()

  if (a.status === 'error') return true
  if (a.replaying || b.replaying) return false
  if (a.status === 'ended') return b.status === 'ended'
  if (a.status === 'ready' && a.ask) return b.status === 'waiting'

  return a.status === 'waiting' && a.remoteAsk !== null && b.status === 'ready' && b.ask?.askId === a.remoteAsk.askId
}

const tally = { pairs: 0, ended: 0, undone: { host: 0, guest: 0 }, erased: 0, reloads: 0 }

describe.skipIf(!hasCoreData)('deshacer en el duelo por enlace con el núcleo real (npm run test:auto)', () => {
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

  function play(session: AutoSession, pending: PendingAsk, random: () => number, fallback: Policy): CoreAnswer {
    const state = openAsk({ askId: pending.askId, ask: pending.ask, ...(pending.title === undefined ? {} : { title: pending.title }) }, { queries: session.adapter!, prefs: PREFS, typeOf })
    const played = playAsk(state, random)

    return played.answer && parseAnswer(played.answer) ? played.answer : fallback(pending.ask)
  }

  it.each(Array.from({ length: PAIRS }, (_, i) => i))('par %i: uno pide deshacer, el otro rechaza y después acepta; las dos mesas vuelven a antes de su jugada y el duelo sigue (también tras recargar)', async (pair) => {
    const hostId = ids[pair % ids.length]!
    const guestId = ids[(pair * 7 + 3) % ids.length] === hostId ? ids[(pair * 7 + 4) % ids.length]! : ids[(pair * 7 + 3) % ids.length]!
    const seed = (7_100 + pair) >>> 0
    const random = seeded(seed)
    const items = new Map<string, string>()
    const save = () => autoSaveStore(`UNDO${pair}`, { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key) }, now)
    let clock = 0
    // Un reloj que corre solo (el marcapasos no frena); lo guardado vence con el mismo.
    const now = () => (clock += 100)
    const room = createMemoryRoom()
    const settings = { ...DEFAULT_SETTINGS, auto: true }
    const hostEnd = room.join()
    const guestEnd = room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    const makeHost = (transport = hostEnd) => createHostLink({ transport, loader: createDataLoader(source, null), deck: lists[hostId]!, handSize: 5, makeTransport: localTransport({ wasmBinary: wasm }), enabled: async () => true, now, newKey: seededKey(random), save: save() })
    let hostLink: OnlineLink = makeHost()
    const guestLink = createGuestLink({ transport: guestEnd, source, deck: lists[guestId]!, now })

    // Dice en qué paso se colgó y cómo quedó cada enlace (un `false` solo no dice nada).
    const wait = async (label: string, done: () => boolean, ms?: number) => {
      const ok = await pump(room, done, ms)

      expect(ok, `${label}: el anfitrión en «${hostLink.getSnapshot().phase}», el invitado en «${guestLink.getSnapshot().phase}»`).toBe(true)
    }
    const offHost = host.subscribe(() => hostLink.observe(host.getSnapshot()))
    guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
    hostLink.observe(host.getSnapshot())
    guestLink.observe(guest.getSnapshot())
    await wait('los dos revisan los decks', () => hostLink.getSnapshot().phase === 'ready' && guestLink.getSnapshot().phase === 'ready')
    host.setReady(true)
    guest.setReady(true)
    room.flush()
    host.chooseMethod('rps')
    room.flush()
    host.pickRps('rock')
    guest.pickRps('scissors')
    room.flush()
    host.chooseFirst((pair % 2) as 0 | 1)
    const guestSeat: Seat = pair % 2 === 0 ? 1 : 0
    const hostSeat = (1 - guestSeat) as Seat
    const hosted = () => hostLink.getSnapshot().session!
    const guested = () => guestLink.getSnapshot().session!
    const views = () => ({ host: hosted().viewOf!(hostSeat), guest: hosted().viewOf!(guestSeat) })
    const guestView = () => {
      const b = guested().getSnapshot()

      return { mine: b.mine, theirs: b.theirs, overlay: b.overlay }
    }

    await wait('empieza el duelo', () => hostLink.getSnapshot().session !== null && guestLink.getSnapshot().session !== null && settled(hosted(), guested()))
    const bots: [Policy, Policy] = [randomLegalPolicy(seed, pickCard), randomLegalPolicy(seed + 1, pickCard)]
    // Cómo estaban las dos mesas con tantas respuestas dadas: adonde tiene que volver deshacer.
    const history = new Map<number, ReturnType<typeof views>>([[0, views()]])
    const step = async () => {
      const a = hosted().getSnapshot()

      if (a.status === 'ready') hosted().answer(play(hosted(), a.ask!, random, bots[hostSeat]!))
      else guested().answer(play(guested(), guested().getSnapshot().ask!, random, bots[guestSeat]!))
      await wait(`la respuesta ${hosted().getSnapshot().answers.length + 1}`, () => settled(hosted(), guested()), 120_000)
      expect(hosted().getSnapshot().status, hosted().getSnapshot().fault?.message).not.toBe('error')
      history.set(hosted().getSnapshot().answers.length, views())
    }

    for (let q = 0; q < CUT + pair * STEP && hosted().getSnapshot().status !== 'ended'; q += 1) await step()
    tally.pairs += 1
    if (hosted().getSnapshot().status === 'ended') {
      tally.ended += 1
      return
    }

    // Pide el que tiene la decisión, si tiene una jugada suya; si no, el otro.
    const deciding: Seat = hosted().getSnapshot().status === 'ready' ? hostSeat : guestSeat
    const has = (seat: Seat) => hosted().getSnapshot().answers.some((item) => item.seat === seat && undoPoint(item))
    const seat = has(deciding) ? deciding : (1 - deciding) as Seat
    const [asker, answerer] = seat === hostSeat ? [hostLink, guestLink] : [guestLink, hostLink]
    const before = hosted().getSnapshot().answers

    expect(has(seat)).toBe(true)
    // Rechazado: nada cambia.
    asker.undo!(true)
    await wait('le llega el pedido de deshacer', () => answerer.getSnapshot().undo?.state === 'asked')
    answerer.undo!(false)
    await wait('le llega el rechazo', () => asker.getSnapshot().undo?.state === 'declined')
    expect(hosted().getSnapshot().answers).toBe(before)

    // Aceptado: vuelve a antes de la última jugada de quien pidió.
    const to = before.findLastIndex((item) => item.seat === seat && undoPoint(item))

    asker.undo!(true)
    await wait('le llega el pedido de deshacer', () => answerer.getSnapshot().undo?.state === 'asked')
    answerer.undo!(true)
    await wait('los dos deshacen', () => guestLink.getSnapshot().undo?.done === 1 && hostLink.getSnapshot().undo?.done === 1 && settled(hosted(), guested()), 120_000)
    expect(hosted().getSnapshot().answers).toEqual(before.slice(0, to))
    expect(views()).toEqual(history.get(to))
    expect(guestView()).toEqual(views().guest)
    // Le toca contestar de nuevo a quien deshizo.
    expect(hosted().getSnapshot().status).toBe(seat === hostSeat ? 'ready' : 'waiting')
    tally.undone[seat === hostSeat ? 'host' : 'guest'] += 1
    tally.erased += before.length - to

    // Sigue el duelo.
    for (let q = 0; q < 6 && hosted().getSnapshot().status !== 'ended'; q += 1) await step()
    expect(guestView()).toEqual(views().guest)

    // Ana recarga: lo guardado (ya recortado) rearma el mismo duelo y Beto recibe la misma mesa.
    if (hosted().getSnapshot().status !== 'ended') {
      const answers = hosted().getSnapshot().answers
      const kept = views()

      // La página vieja deja de existir: su sala no le habla más al enlace nuevo (si no, le cuenta la mesa de antes de recargar y éste lo toma por una revancha, que borra lo guardado).
      offHost()
      hostLink.destroy()
      hostEnd.close()
      const hostEnd2 = room.join()
      const host2 = createDuel(hostEnd2, { role: 'host', name: 'Ana', sid: 'host-2', settings })

      hostLink = makeHost(hostEnd2)
      host2.subscribe(() => hostLink.observe(host2.getSnapshot()))
      hostLink.observe(host2.getSnapshot())
      await wait('el anfitrión recarga y rearma lo guardado', () => hostLink.getSnapshot().session !== null && settled(hosted(), guested()) && guestView().overlay.turn > 0, 120_000)
      expect(hosted().getSnapshot().answers.map((item) => item.answer)).toEqual(answers.map((item) => item.answer))
      expect(views()).toEqual(kept)
      expect(guestView()).toEqual(views().guest)
      tally.reloads += 1
    }
    guestLink.destroy()
    hostLink.destroy()
  }, 20 * 60 * 1000)

  it('deshicieron los dos y se recargó después', () => {
    console.log(JSON.stringify(tally))
    expect(tally.pairs).toBe(PAIRS)
    if (PAIRS >= 6) {
      expect(tally.undone.host).toBeGreaterThan(0)
      expect(tally.undone.guest).toBeGreaterThan(0)
      expect(tally.reloads).toBeGreaterThan(0)
    }
  })
})
