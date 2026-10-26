import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cardMatchesOpcode } from 'ocgcore-wasm'
import { openAsk, type AskContext } from '../app/auto/ask-ui'
import { createDataLoader } from '../app/auto/auto-data'
import type { AutoSession, PendingAsk } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { createGuestLink, createHostLink } from '../app/auto/online'
import { randomLegalPolicy, type Policy } from '../app/auto/policies'
import { parseAnswer, type AskOf, type CoreAnswer, type Seat } from '../app/auto/protocol'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel } from '../app/duel-session'
import { duelTurnNumber, sharedPhase, whoseTurn } from '../app/duel-turn'
import type { Duelist } from '../app/life-calculator'
import type { MatPhase, MatState } from '../app/practice-mat'
import { playAsk, seeded } from './support/ask-ui-player'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, wasmBinary } from './support/core-data'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'

/**
 * Pasar a manual con el núcleo real (lento: `npm run test:auto`; se salta sin datos). Como `auto-online.slow.test.ts`: un anfitrión y un invitado en memoria con decks del meta y
 * un jugador al azar que toca lo que la pantalla ofrece; cada par corta en otra pregunta (así cae en el turno de uno y del otro, en fases distintas). Pide Beto, acepta Ana y cada
 * uno arma su mesa manual con la del corte (lo que hace la pantalla): de quién es el turno y la fase, como los cuenta la sala manual (`duel-turn.ts`), son los del núcleo; cada
 * uno ve la mesa del otro tal cual (cantidades por lugar) y una jugada manual cruza. MANUAL_PAIRS pares (24, unos segundos), MANUAL_CUT la pregunta del primer corte (12), MANUAL_STEP (11).
 */
const PAIRS = Number(process.env.MANUAL_PAIRS ?? 24)
const CUT = Number(process.env.MANUAL_CUT ?? 12)
const STEP = Number(process.env.MANUAL_STEP ?? 11)
const PREFS: AskContext['prefs'] = { chainMode: 'ask', placeMode: 'ask' }
/** `PHASE_*` del núcleo → la fase de la mesa (como el adaptador). */
const PHASE: Record<number, MatPhase> = { 1: 'draw', 2: 'standby', 4: 'main1', 8: 'battle', 0x10: 'battle', 0x20: 'battle', 0x40: 'battle', 0x80: 'battle', 0x100: 'main2', 0x200: 'end' }

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

/** Lo que el otro ve de una mesa: cuántas cartas en cada lugar. */
const shape = (state: MatState) => ({ deck: state.deck.length, hand: state.hand.length, gy: state.gy.length, banished: state.banished.length, extra: state.extra.length, extraUp: state.extraUp.length, mz: state.mz.filter(Boolean).length, emz: state.emz.filter(Boolean).length, st: state.st.filter(Boolean).length, field: state.field ? 1 : 0 })

const tally = { pairs: 0, ended: 0, blocked: 0, cuts: { mine: 0, theirs: 0 }, phases: {} as Record<string, number>, turnDrift: 0 }

describe.skipIf(!hasCoreData)('pasar a manual con el núcleo real (npm run test:auto)', () => {
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

  it.each(Array.from({ length: PAIRS }, (_, i) => i))('par %i: pide Beto, acepta Ana y la sala manual sigue con el turno, la fase y las mesas del núcleo', async (pair) => {
    const hostId = ids[pair % ids.length]!
    const guestId = ids[(pair * 7 + 3) % ids.length] === hostId ? ids[(pair * 7 + 4) % ids.length]! : ids[(pair * 7 + 3) % ids.length]!
    const seed = (4_242 + pair) >>> 0
    const random = seeded(seed)
    const room = createMemoryRoom()
    const settings = { ...DEFAULT_SETTINGS, auto: true }
    const hostEnd = room.join()
    const guestEnd = room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    let clock = 0
    const now = () => (clock += 100)
    const hostLink = createHostLink({ transport: hostEnd, loader: createDataLoader(source, null), deck: lists[hostId]!, handSize: 5, makeTransport: localTransport({ wasmBinary: wasm }), enabled: async () => true, now, random })
    const guestLink = createGuestLink({ transport: guestEnd, source, deck: lists[guestId]!, now })

    host.subscribe(() => hostLink.observe(host.getSnapshot()))
    guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
    hostLink.observe(host.getSnapshot())
    guestLink.observe(guest.getSnapshot())
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
    const hostSeat = (1 - guestSeat) as Seat
    const hosted = () => hostLink.getSnapshot().session!
    const guested = () => guestLink.getSnapshot().session!

    expect(await pump(room, () => hostLink.getSnapshot().session !== null && guestLink.getSnapshot().session !== null && settled(hosted(), guested()))).toBe(true)
    const bots: [Policy, Policy] = [randomLegalPolicy(seed, pickCard), randomLegalPolicy(seed + 1, pickCard)]

    for (let q = 0; q < CUT + pair * STEP; q += 1) {
      const a = hosted().getSnapshot()

      expect(a.status, a.fault?.message).not.toBe('error')
      if (a.status === 'ended') break
      if (a.status === 'ready') hosted().answer(play(hosted(), a.ask!, random, bots[hostSeat]!))
      else guested().answer(play(guested(), guested().getSnapshot().ask!, random, bots[guestSeat]!))
      expect(await pump(room, () => settled(hosted(), guested()), 120_000)).toBe(true)
    }
    tally.pairs += 1
    if (hosted().getSnapshot().status === 'ended') {
      tally.ended += 1
      return
    }

    // Pide Beto y acepta Ana: el anfitrión corta con el núcleo quieto y los dos quedan en el corte.
    guestLink.manual!(true)
    expect(await pump(room, () => hostLink.getSnapshot().manual === 'asked')).toBe(true)
    hostLink.manual!(true)
    expect(await pump(room, () => ['agreed', 'blocked'].includes(guestLink.getSnapshot().manual ?? ''))).toBe(true)
    if (hostLink.getSnapshot().manual === 'blocked') {
      // Una carta bajo el control del otro: no se pasa (y los dos lo saben).
      expect(guestLink.getSnapshot().manual).toBe('blocked')
      tally.blocked += 1
      return
    }
    expect(hostLink.getSnapshot().manual).toBe('agreed')
    const a = hosted().getSnapshot()
    const b = guested().getSnapshot()

    expect({ mine: b.mine, theirs: b.theirs, overlay: b.overlay }).toEqual(hosted().viewOf!(guestSeat))

    // La sala sigue a mano: cada uno arma su mesa con la del corte (el invitado primero, como en la pantalla).
    guest.start(b.mine)
    expect(await pump(room, () => host.getSnapshot().theirs !== null)).toBe(true)
    host.start(a.mine)
    expect(await pump(room, () => guest.getSnapshot().theirs !== null)).toBe(true)
    const hs = host.getSnapshot()
    const gs = guest.getSnapshot()
    const corePlayer = a.overlay.turnPlayer
    const corePhase = PHASE[a.overlay.phase]!
    const hostTurn = whoseTurn(hs.me, hs.mine, hs.theirs!.state, hs.starter)
    const guestTurn = whoseTurn(gs.me, gs.mine, gs.theirs!.state, gs.starter)

    expect(hostTurn).toBe(corePlayer === hostSeat ? 'mine' : 'theirs')
    expect(guestTurn).toBe(corePlayer === guestSeat ? 'mine' : 'theirs')
    expect(sharedPhase(hostTurn, hs.mine, hs.theirs!.state)).toBe(corePhase)
    expect(sharedPhase(guestTurn, gs.mine, gs.theirs!.state)).toBe(corePhase)
    expect(duelTurnNumber(gs.mine, gs.theirs!.state)).toBe(duelTurnNumber(hs.mine, hs.theirs!.state))
    if (duelTurnNumber(hs.mine, hs.theirs!.state) !== a.overlay.turn) tally.turnDrift += 1
    expect(shape(hs.theirs!.state)).toEqual(shape(gs.mine!))
    expect(shape(gs.theirs!.state)).toEqual(shape(hs.mine!))
    tally.cuts[corePlayer === guestSeat ? 'theirs' : 'mine'] += 1
    tally.phases[corePhase] = (tally.phases[corePhase] ?? 0) + 1

    // Una jugada manual de Beto llega a Ana.
    const card = gs.mine!.hand[0]

    if (card) {
      guest.play({ type: 'move', id: card, to: 'gy' })
      expect(await pump(room, () => host.getSnapshot().theirs!.state.gy.length === gs.mine!.gy.length + 1)).toBe(true)
    }
    guestLink.destroy()
    hostLink.destroy()
  }, 20 * 60 * 1000)

  it('cortó en el turno de los dos y en más de una fase', () => {
    console.log(JSON.stringify(tally))
    expect(tally.pairs).toBe(PAIRS)
    expect(tally.cuts.mine + tally.cuts.theirs + tally.ended + tally.blocked).toBe(PAIRS)
    if (PAIRS >= 12) {
      expect(tally.cuts.mine).toBeGreaterThan(0)
      expect(tally.cuts.theirs).toBeGreaterThan(0)
      expect(Object.keys(tally.phases).length).toBeGreaterThan(2)
    }
  })
})
