import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cardMatchesOpcode } from 'ocgcore-wasm'
import { describe, expect, it } from 'vitest'
import { openAsk, type AskContext } from '../app/auto/ask-ui'
import { createDataLoader } from '../app/auto/auto-data'
import { autoSaveStore } from '../app/auto/auto-save'
import { undoPoint, type AutoSession, type PendingAsk } from '../app/auto/auto-session'
import { localTransport, type AutoHost } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { manualHandover } from '../app/auto/manual-handover'
import { createGuestLink, createHostLink, type OnlineLink } from '../app/auto/online'
import { codeOfId, createResumeLink, type ResumeLink } from '../app/auto/online-resume'
import { randomLegalPolicy, type Policy } from '../app/auto/policies'
import { parseAnswer, type AskOf, type CoreAnswer, type CoreAsk, type Seat } from '../app/auto/protocol'
import { placedCards } from '../app/auto/resume'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel, type Duel } from '../app/duel-session'
import { duelTurnNumber, whoseTurn } from '../app/duel-turn'
import type { Duelist } from '../app/life-calculator'
import { isToken, type MatPhase, type MatState } from '../app/practice-mat'
import { playAsk, seeded, seededKey } from './support/ask-ui-player'
import { compare, readMat, readReal } from './support/core-compare'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, wasmBinary } from './support/core-data'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'

/**
 * Pasar de manual a automático en el duelo por enlace con el núcleo real (lento: `npm run test:auto`; se salta sin datos). Como `auto-online-manual.slow.test.ts`: un
 * anfitrión y un invitado en memoria con decks del meta y un jugador al azar; cada par juega en automático, pasa a manual (pide Beto, acepta Ana), lleva la mesa manual a un
 * punto limpio (la Main Phase 1 o 2 de quien tiene el turno; con una ficha o una carta bajo el control del otro, no se pasa) y vuelve a automático: lo pide quien tiene el
 * turno, el otro acepta, y las dos mesas del núcleo y la del invitado tienen que ser las manuales campo por campo (`core-compare.ts`), con las vidas de la sala; se siguen
 * jugando RESUME_STEPS pasos sin trabarse, el anfitrión que recarga rearma lo mismo con lo guardado y el invitado que vuelve recibe la misma mesa. RESUME_PAIRS pares (6).
 */
const PAIRS = Number(process.env.RESUME_PAIRS ?? 6)
const CUT = Number(process.env.RESUME_CUT ?? 10)
const STEPS = Number(process.env.RESUME_STEPS ?? 8)
const PREFS: AskContext['prefs'] = { chainMode: 'ask', placeMode: 'ask' }

async function pump(room: MemoryRoom, done: () => boolean, ms = 90_000): Promise<boolean> {
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

/** Lo que importa de una mesa, por código: cada lugar con sus cartas (el deck en orden), posiciones y materiales. */
const codesAt = (state: MatState, seat: Seat) => placedCards(state, seat, codeOfId).map((card) => [card.location, card.sequence, card.position, card.code, ...(card.materials ?? [])])
const sameView = (hostSession: AutoSession, guestSession: AutoSession, guestSeat: Seat) => {
  const view = hostSession.viewOf!(guestSeat)!
  const mine = guestSession.getSnapshot()

  expect({ mine: mine.mine, theirs: mine.theirs, overlay: mine.overlay }).toEqual(view)
}

const tally = { pairs: 0, ended: 0, blocked: 0, skipped: {} as Record<string, number>, resumed: { host: 0, guest: 0 }, phases: {} as Record<string, number>, m2WithBp: 0, steps: 0 }

describe.skipIf(!hasCoreData)('pasar de manual a automático en el duelo por enlace con el núcleo real (npm run test:auto)', () => {
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

  /** Juega hasta `until` preguntas con los jugadores al azar; false si el duelo terminó. */
  async function playOn(room: MemoryRoom, hosted: () => AutoSession, guested: () => AutoSession, until: number, random: () => number, bots: [Policy, Policy], hostSeat: Seat): Promise<boolean> {
    for (let q = 0; q < until; q += 1) {
      const a = hosted().getSnapshot()

      expect(a.status, a.fault?.message).not.toBe('error')
      if (a.status === 'ended') return false
      if (a.status === 'ready') hosted().answer(play(hosted(), a.ask!, random, bots[hostSeat]!))
      else guested().answer(play(guested(), guested().getSnapshot().ask!, random, bots[(1 - hostSeat) as Seat]!))
      expect(await pump(room, () => settled(hosted(), guested()), 120_000)).toBe(true)
      tally.steps += 1
    }

    return true
  }

  it.each(Array.from({ length: PAIRS }, (_, i) => i))('par %i: automático, a mano, punto limpio y de vuelta en automático con las mismas mesas', async (pair) => {
    const hostId = ids[pair % ids.length]!
    const guestId = ids[(pair * 7 + 3) % ids.length] === hostId ? ids[(pair * 7 + 4) % ids.length]! : ids[(pair * 7 + 3) % ids.length]!
    const seed = (9_191 + pair) >>> 0
    const random = seeded(seed)
    const room = createMemoryRoom()
    const settings = { ...DEFAULT_SETTINGS, auto: true }
    const hostEnd = room.join()
    const guestEnd = room.join()
    const host: Duel = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings })
    const guest: Duel = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    let clock = 0
    const now = () => (clock += 100)
    const loader = createDataLoader(source, null)
    const held = { live: null as AutoHost | null }
    const makeTransport = localTransport({ wasmBinary: wasm }, (core) => void (held.live = core))
    const links: OnlineLink[] = []
    const storage = new Map<string, string>()
    const save = autoSaveStore('ROOM0001', { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => void storage.set(key, value), removeItem: (key) => void storage.delete(key) }, now)
    const hostLinkOf = (options: Partial<Parameters<typeof createHostLink>[0]> = {}) => {
      const link = createHostLink({ transport: hostEnd, loader, deck: lists[hostId]!, handSize: 5, makeTransport, enabled: async () => true, now, newKey: seededKey(random), save, ...options })

      host.subscribe(() => link.observe(host.getSnapshot()))
      link.observe(host.getSnapshot())
      links.push(link)
      return link
    }
    const guestLinkOf = () => {
      const link = createGuestLink({ transport: guestEnd, source, deck: lists[guestId]!, now })

      guest.subscribe(() => link.observe(guest.getSnapshot()))
      link.observe(guest.getSnapshot())
      links.push(link)
      return link
    }
    const done = () => links.forEach((link) => link.destroy())
    let hostLink = hostLinkOf()
    let guestLink = guestLinkOf()

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
    const hostSeat: Seat = pair % 2 === 0 ? 0 : 1
    const hosted = () => hostLink.getSnapshot().session!
    const guested = () => guestLink.getSnapshot().session!

    expect(await pump(room, () => hostLink.getSnapshot().session !== null && guestLink.getSnapshot().session !== null && settled(hosted(), guested()))).toBe(true)
    const bots: [Policy, Policy] = [randomLegalPolicy(seed, pickCard), randomLegalPolicy(seed + 1, pickCard)]

    tally.pairs += 1
    if (!(await playOn(room, hosted, guested, CUT + pair * 3, random, bots, hostSeat))) {
      tally.ended += 1
      return done()
    }

    // A mano: pide Beto, acepta Ana, cada uno arma su mesa manual con la del corte (como la pantalla).
    guestLink.manual!(true)
    expect(await pump(room, () => hostLink.getSnapshot().manual === 'asked')).toBe(true)
    hostLink.manual!(true)
    expect(await pump(room, () => ['agreed', 'blocked'].includes(guestLink.getSnapshot().manual ?? ''))).toBe(true)
    if (hostLink.getSnapshot().manual === 'blocked') {
      tally.blocked += 1
      return done()
    }
    const guestGame = manualHandover(guested().getSnapshot(), () => undefined).session(0)
    const hostGame = manualHandover(hosted().getSnapshot(), () => undefined).session(0)

    guest.start(guestGame.initial, guestGame.actions, guestGame.order)
    expect(await pump(room, () => host.getSnapshot().theirs !== null)).toBe(true)
    host.start(hostGame.initial, hostGame.actions, hostGame.order)
    expect(await pump(room, () => guest.getSnapshot().theirs !== null)).toBe(true)
    hostLink.destroy()
    guestLink.destroy()

    // Un punto limpio: quien tiene el turno llega a su Main Phase (de la Draw o la Standby a la 1; de la Battle a la 2; de la End, pasa el turno y el otro va a su 1).
    const turnOf = (duel: Duel) => {
      const snap = duel.getSnapshot()

      return whoseTurn(snap.me, snap.mine, snap.theirs!.state, snap.starter)
    }
    let player: Duel = turnOf(host) === 'mine' ? host : guest
    let other: Duel = player === host ? guest : host
    const phaseOf = () => player.getSnapshot().mine!.phase
    const move = async (duel: Duel, phase: MatPhase) => {
      duel.play({ type: 'phase', phase, ...(phase === 'draw' ? { skipDraw: true as const } : {}) })
      expect(await pump(room, () => (duel === host ? guest : host).getSnapshot().theirs!.state.phase === phase)).toBe(true)
    }

    if (phaseOf() === 'end') {
      await move(player, 'draw')
      ;[player, other] = [other, player]
      expect(turnOf(player)).toBe('mine')
    }
    if (phaseOf() === 'draw' || phaseOf() === 'standby') await move(player, 'main1')
    // Los pares impares siguen hasta la Main Phase 2 (pasando por la Battle Phase): el pase también vale ahí.
    if (phaseOf() === 'main1' && pair % 2 === 1) await move(player, 'battle')
    if (phaseOf() === 'battle') await move(player, 'main2')
    const allIds = (state: MatState) => [...state.deck, ...state.hand, ...state.gy, ...state.banished, ...state.extra, ...[...state.mz, ...state.emz, ...state.st, state.field].flatMap((card) => (card ? [card.id, ...card.materials] : []))]
    const tokens = [player, other].some((duel) => allIds(duel.getSnapshot().mine!).some(isToken))

    // Pedir, aceptar: lo pide quien tiene el turno.
    const resumes = { host: createResumeLink({ host: true, transport: hostEnd, now }), guest: createResumeLink({ host: false, transport: guestEnd, now }) }

    host.subscribe(() => resumes.host.observe(host.getSnapshot()))
    guest.subscribe(() => resumes.guest.observe(guest.getSnapshot()))
    resumes.host.observe(host.getSnapshot())
    resumes.guest.observe(guest.getSnapshot())
    room.flush()
    const asker: ResumeLink = player === host ? resumes.host : resumes.guest
    const answerer: ResumeLink = player === host ? resumes.guest : resumes.host
    const blocked = asker.getSnapshot().blocked

    if (blocked !== null) {
      expect(tokens ? 'tokens' : blocked).toBe(blocked)
      tally.skipped[blocked] = (tally.skipped[blocked] ?? 0) + 1
      resumes.host.destroy()
      resumes.guest.destroy()
      return done()
    }
    expect(tokens).toBe(false)
    const manualPhase = phaseOf()
    const manualTurn = duelTurnNumber(player.getSnapshot().mine, player.getSnapshot().theirs!.state)
    const hostTable = host.getSnapshot().mine!
    const guestTable = guest.getSnapshot().mine!
    const lp = host.getSnapshot().life.lp

    asker.want(true)
    expect(await pump(room, () => answerer.getSnapshot().state === 'asked')).toBe(true)
    answerer.want(true)
    expect(await pump(room, () => resumes.host.getSnapshot().state === 'agreed')).toBe(true)
    const { start } = resumes.host.getSnapshot()
    const newHostSeat: Seat = player === host ? 0 : 1
    const newGuestSeat = (1 - newHostSeat) as Seat

    expect(start).toMatchObject({ seat: newHostSeat, setup: { phase: manualPhase, turns: [player.getSnapshot().mine!.turn, other.getSnapshot().mine!.turn] } })
    expect(start!.setup.lp).toEqual(newHostSeat === 0 ? [lp[0], lp[1]] : [lp[1], lp[0]])
    held.live = null
    hostLink = hostLinkOf({ resume: start! })
    expect(await pump(room, () => resumes.guest.getSnapshot().state === 'agreed')).toBe(true)
    resumes.host.destroy()
    resumes.guest.destroy()
    guestLink = guestLinkOf()
    expect(await pump(room, () => hostLink.getSnapshot().session !== null && guestLink.getSnapshot().session !== null && settled(hosted(), guested()), 120_000)).toBe(true)
    const a = hosted().getSnapshot()
    const b = guested().getSnapshot()

    expect(a.status, a.fault?.message).not.toBe('error')
    expect(hostLink.getSnapshot()).toMatchObject({ phase: 'playing', seat: newHostSeat })
    expect(guestLink.getSnapshot()).toMatchObject({ phase: 'playing', seat: newGuestSeat })
    // Las mesas del arranque son las manuales (por código, lugar por lugar) y las vidas, las de la sala.
    expect(codesAt(a.initial.mine, newHostSeat)).toEqual(codesAt(hostTable, newHostSeat))
    expect(codesAt(b.initial.mine, newGuestSeat)).toEqual(codesAt(guestTable, newGuestSeat))
    expect(a.initial.mine).toMatchObject({ phase: player === host ? manualPhase : 'draw', turn: hostTable.turn })
    expect(b.initial.mine).toMatchObject({ phase: player === guest ? manualPhase : 'draw', turn: guestTable.turn })
    expect(a.overlay.lp).toEqual([lp[host.getSnapshot().me], lp[1 - host.getSnapshot().me]])
    expect(duelTurnNumber(a.initial.mine, a.initial.theirs)).toBe(manualTurn)
    // La mesa del invitado es la que el anfitrión calcula para su asiento, y las dos (y la del núcleo) siguen siendo las manuales.
    sameView(hosted(), guested(), newGuestSeat)
    const core = held.live!.live!

    expect(compare(readReal(core.lib, core.handle, newHostSeat), readMat(a.mine, codeOfId), true)).toEqual([])
    expect(compare(readReal(core.lib, core.handle, newGuestSeat), readMat(b.mine, codeOfId), true)).toEqual([])
    expect(compare(readReal(core.lib, core.handle, newGuestSeat), readMat(a.theirs, (id) => hosted().adapter!.codeOf({ side: 'theirs', id })), false)).toEqual([])
    // La primera pregunta es de quien tiene el turno, en su Main Phase.
    const first = (player === host ? a.ask : b.ask)!

    expect(first.seat).toBe(0)
    expect(first.ask.type).toBe('select_idlecmd')
    // En la Main Phase 2 el núcleo ya pasó solo su Main Phase 1 y su Battle Phase: no ofrece la Battle Phase, y esas respuestas no son jugadas a las que volver.
    if (manualPhase === 'main2') {
      expect((first.ask as Extract<CoreAsk, { type: 'select_idlecmd' }>).to_bp).toBe(false)
      tally.m2WithBp += 1
    }
    expect(a.answers.filter(undoPoint)).toEqual([])
    tally.resumed[player === host ? 'host' : 'guest'] += 1
    tally.phases[manualPhase] = (tally.phases[manualPhase] ?? 0) + 1

    // Se sigue jugando.
    const went = await playOn(room, hosted, guested, STEPS, random, bots, newHostSeat)

    expect(hosted().getSnapshot().faults.filter((fault) => fault.kind === 'retry' || fault.kind === 'unhandled')).toEqual([])
    if (!went) return done()
    sameView(hosted(), guested(), newGuestSeat)
    const before = hosted().getSnapshot()

    // Ana recarga: lo guardado (con el setup) rearma el mismo duelo; Beto lo recibe de nuevo y sigue igual.
    expect(save.read()?.setup).toEqual(start!.setup)
    hostLink.destroy()
    hostLink = hostLinkOf({ newKey: () => 'nunca' })
    expect(await pump(room, () => hostLink.getSnapshot().session !== null && settled(hosted(), guested()), 120_000)).toBe(true)
    expect(hosted().getSnapshot().status, hosted().getSnapshot().fault?.message).not.toBe('error')
    expect(hosted().getSnapshot().initial).toEqual(before.initial)
    expect(hosted().getSnapshot()).toMatchObject({ mine: before.mine, theirs: before.theirs, overlay: before.overlay, answers: before.answers })
    sameView(hosted(), guested(), newGuestSeat)
    // Beto vuelve (otra pestaña): pide el duelo de nuevo y arma la misma mesa.
    const guestBefore = guested().getSnapshot()

    guestLink.destroy()
    guestLink = guestLinkOf()
    expect(await pump(room, () => guestLink.getSnapshot().session !== null && settled(hosted(), guested()), 120_000)).toBe(true)
    expect(guested().getSnapshot().initial).toEqual(guestBefore.initial)
    expect(guested().getSnapshot()).toMatchObject({ mine: guestBefore.mine, theirs: guestBefore.theirs })
    sameView(hosted(), guested(), newGuestSeat)
    // Y se sigue jugando después de las dos vueltas.
    await playOn(room, hosted, guested, 2, random, bots, newHostSeat)
    done()
  }, 20 * 60 * 1000)

  it('pasó en el turno de los dos y en alguna Main Phase', () => {
    console.log(JSON.stringify(tally))
    expect(tally.pairs).toBe(PAIRS)
    expect(tally.resumed.host + tally.resumed.guest + tally.ended + tally.blocked + Object.values(tally.skipped).reduce((sum, n) => sum + n, 0)).toBe(PAIRS)
    if (PAIRS >= 6) expect(tally.resumed.host + tally.resumed.guest).toBeGreaterThan(0)
  })
})
