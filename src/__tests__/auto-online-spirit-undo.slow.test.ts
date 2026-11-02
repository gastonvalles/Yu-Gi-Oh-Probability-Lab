import './support/node-dom'
import { act, renderHook } from '@testing-library/react'
import { OcgLocation as L } from 'ocgcore-wasm'
import { useSyncExternalStore } from 'react'
import { openAsk, type AskContext } from '../app/auto/ask-ui'
import { createDataLoader } from '../app/auto/auto-data'
import { undoPoint, type AutoSession } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { createGuestLink, createHostLink, type OnlineLink } from '../app/auto/online'
import { freePlaces, passivePolicy } from '../app/auto/policies'
import type { CoreAnswer, CoreAsk, Seat } from '../app/auto/protocol'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel } from '../app/duel-session'
import { useAutoAsks } from '../components/auto/use-auto-asks'
import { seeded, seededKey } from './support/ask-ui-player'
import { cardRows, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'

/**
 * Deshacer siendo el invitado del duelo por enlace, con el núcleo real (lento: `npm run test:auto`). El invitado va segundo (asiento 1) y en su turno Invoca a Maiden with
 * Eyes of Blue, la usa para Spirit with Eyes of Blue (Zona Extra), activa Roar of the Blue-Eyed Dragons (un Blue-Eyes White Dragon del Deck) y activa Spirit (se sacrifica e
 * Invoca el Blue-Eyes de la mano). Pide deshacer en distintos momentos y el anfitrión acepta: después, el invitado tiene otra vez su pregunta de jugadas del turno, su mesa
 * es la del anfitrión, cada jugada que ofrece el núcleo cae en una carta y, con Spirit en el campo, puede activarla de nuevo y se resuelve. Su pantalla (`useAutoAsks`, montada
 * desde el principio y pasando sus paradas de fase como una persona) queda quieta, con la pregunta a la vista y la jugada en la carta, no con «no ofrece jugadas».
 */
const SPIRIT = 42097666
const MAIDEN = 88241506
const BEWD = 89631139
const ROAR = 17725109
const IMPERMANENCE = 10045474
const ELF = 15025844
const PREFS: AskContext['prefs'] = { chainMode: 'ask', placeMode: 'ask' }

/** Qué jugada del invitado se deshace: Spirit ya resuelto, Spirit con el rival por responder (Infinite Impermanence), Roar o la Invocación Normal. */
type Undo = 'resolved' | 'chain' | 'roar' | 'summon'

async function pump(room: MemoryRoom, done: () => boolean, ms = 60_000): Promise<boolean> {
  const start = performance.now()

  while (performance.now() - start < ms) {
    // Dentro de `act`: la pantalla del invitado (`useAutoAsks`) se dibuja con cada cosa que llega.
    await act(async () => {
      room.flush()
      await new Promise((resolve) => setImmediate(resolve))
    })
    if (done()) return true
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

describe.skipIf(!hasCoreData)('deshacer siendo el invitado, con Spirit with Eyes of Blue (núcleo real)', () => {
  const rows = hasCoreData ? cardRows() : []
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const source = nodeSource(rows, scriptStore())
  const typeOf = (code: number) => cards.get(code)?.type ?? 0
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  // Mazos de pocas cartas distintas: la mano de 5 trae lo que hace falta (con esta semilla).
  const guestDeck: DeckList = { main: [[MAIDEN, 14], [ROAR, 13], [BEWD, 13]], extra: [[SPIRIT, 1]] }
  const hostDeck: DeckList = { main: [[IMPERMANENCE, 20], [ELF, 20]] }

  it.each<Undo>(['resolved', 'chain', 'roar', 'summon'])('deshace %s: vuelve su pregunta de jugadas, cada jugada cae en una carta y Spirit se puede activar de nuevo', async (undo) => {
    const random = seeded(4242)
    let clock = 0
    const now = () => (clock += 100)
    const room = createMemoryRoom()
    const hostEnd = room.join()
    const guestEnd = room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings: { ...DEFAULT_SETTINGS, auto: true } })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    const hostLink: OnlineLink = createHostLink({ transport: hostEnd, loader: createDataLoader(source, null), deck: hostDeck, handSize: 5, makeTransport: localTransport({ wasmBinary: wasm }), enabled: async () => true, now, newKey: seededKey(random) })
    const guestLink = createGuestLink({ transport: guestEnd, source, deck: guestDeck, now })
    const wait = async (label: string, done: () => boolean, ms?: number) => expect(await pump(room, done, ms), label).toBe(true)

    host.subscribe(() => hostLink.observe(host.getSnapshot()))
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
    // Empieza el anfitrión: el invitado es el asiento 1, como Gastón.
    host.chooseFirst(0)
    const guestSeat: Seat = 1
    const hosted = () => hostLink.getSnapshot().session!
    const guested = () => guestLink.getSnapshot().session!

    await wait('empieza el duelo', () => hostLink.getSnapshot().session !== null && guestLink.getSnapshot().session !== null && settled(hosted(), guested()))
    // La pantalla del invitado (`useAutoAsks`, como `AutoDuelScreen` online) desde el principio, con su ritmo y sus paradas de fase.
    const screen = renderHook(() => {
      const link = useSyncExternalStore(guestLink.subscribe, guestLink.getSnapshot)
      const session = link.session!
      const snap = useSyncExternalStore(session.subscribe, session.getSnapshot)

      return useAutoAsks({ session, snap, cardsById: new Map(), cards: link.cards, seat: guestSeat, canCancel: false, canUndo: false, waitingText: 'Ana está eligiendo…' })
    })
    const mesa = () => screen.result.current
    // Hasta que la mesa termina de contar; si frena en tu DP o tu SP, la persona pide la Main Phase 1 con el botón de fases.
    const catchUp = (label: string) =>
      wait(label, () => {
        const { settled: quiet, turnMine, state: { phase } } = mesa()
        const main1 = mesa().mat.auto?.phaseItems.find((item) => item.label === 'Main Phase 1')

        if (!quiet && turnMine && (phase === 'draw' || phase === 'standby') && main1) act(() => main1.onSelect())
        return quiet
      })
    const passive = passivePolicy()
    const done = new Set<string>()
    const at = (list: readonly { code: number; location: number }[], code: number, location: number) => list.findIndex((card) => card.code === code && card.location === location)
    // El guion del invitado; el anfitrión pasa (y no responde con Impermanence).
    const script = (ask: CoreAsk): CoreAnswer => {
      if (ask.type === 'select_idlecmd') {
        if (!done.has('maiden') && at(ask.summons, MAIDEN, L.HAND) >= 0) return done.add('maiden'), { type: ask.type, action: 0, index: at(ask.summons, MAIDEN, L.HAND) }
        if (!done.has('spirit') && at(ask.special_summons, SPIRIT, L.EXTRA) >= 0) return done.add('spirit'), { type: ask.type, action: 1, index: at(ask.special_summons, SPIRIT, L.EXTRA) }
        if (!done.has('roar') && at(ask.activates, ROAR, L.HAND) >= 0) return done.add('roar'), { type: ask.type, action: 5, index: at(ask.activates, ROAR, L.HAND) }
        if (!done.has('effect') && at(ask.activates, SPIRIT, L.MZONE) >= 0) return done.add('effect'), { type: ask.type, action: 5, index: at(ask.activates, SPIRIT, L.MZONE) }
      }
      if (ask.type === 'select_place') return { type: ask.type, places: [freePlaces(ask)[0]!] }
      return passive(ask)
    }
    const step = async () => {
      const a = hosted().getSnapshot()

      if (a.status === 'ready') hosted().answer(passive(a.ask!.ask))
      else guested().answer(script(guested().getSnapshot().ask!.ask))
      await wait(`la respuesta ${hosted().getSnapshot().answers.length + 1}`, () => settled(hosted(), guested()), 120_000)
      expect(hosted().getSnapshot().status, hosted().getSnapshot().fault?.message).not.toBe('error')
    }
    const guestIdle = () => {
      const b = guested().getSnapshot()

      return b.status === 'ready' && b.ask?.ask.type === 'select_idlecmd' && b.ask.ask.player === guestSeat ? b.ask.ask : null
    }
    // Hasta el punto de deshacer: después de la jugada que se deshace (con Impermanence por responder, cuando el anfitrión tiene la cadena).
    const until: Record<Undo, () => boolean> = {
      resolved: () => done.has('effect') && guestIdle() !== null,
      chain: () => done.has('effect') && hosted().getSnapshot().ask?.ask.type === 'select_chain',
      roar: () => done.has('roar') && guestIdle() !== null,
      summon: () => done.has('maiden') && guestIdle() !== null,
    }
    const codes = (ids: readonly string[]) => ids.map((id) => guested().adapter!.codeOf({ side: 'mine', id }))

    expect(codes(guested().getSnapshot().mine.hand), 'la mano del invitado').toEqual(expect.arrayContaining([MAIDEN, ROAR, BEWD]))
    for (let q = 0; q < 120 && !until[undo]() && hosted().getSnapshot().status !== 'ended'; q += 1) await step()
    expect(until[undo](), `llega a deshacer (${[...done].join()})`).toBe(true)

    await catchUp('la pantalla del invitado, quieta')
    expect(mesa().mat.auto?.asking).toBe(undo !== 'chain')

    // El invitado pide deshacer y el anfitrión acepta.
    const before = hosted().getSnapshot().answers
    const to = before.findLastIndex((item) => item.seat === guestSeat && undoPoint(item))

    guestLink.undo!(true)
    await wait('le llega el pedido de deshacer', () => hostLink.getSnapshot().undo?.state === 'asked')
    hostLink.undo!(true)
    await wait('los dos deshacen', () => guestLink.getSnapshot().undo?.done === 1 && hostLink.getSnapshot().undo?.done === 1 && settled(hosted(), guested()), 120_000)
    expect(hosted().getSnapshot().answers).toEqual(before.slice(0, to))

    // Lo que ve el invitado: su pregunta de jugadas, su mesa igual a la del anfitrión y cada jugada en una carta.
    const idle = guestIdle()
    const b = guested().getSnapshot()

    expect(idle, `el invitado: ${b.status}, ${b.ask?.ask.type}`).not.toBeNull()
    expect({ mine: b.mine, theirs: b.theirs, overlay: b.overlay }).toEqual(hosted().viewOf!(guestSeat))
    const state = openAsk(b.ask!, { queries: guested().adapter!, prefs: PREFS, typeOf })
    const offered = idle!.summons.length + idle!.monster_sets.length + idle!.special_summons.length + idle!.spell_sets.length + idle!.pos_changes.length
    const placed = [...state.base.items.values()].flat().length

    expect(placed).toBeGreaterThanOrEqual(offered + (idle!.activates.length > 0 ? 1 : 0))
    const spirit = guested().adapter!.mine.emz.find((card) => card !== null && guested().adapter!.codeOf({ side: 'mine', id: card.id }) === SPIRIT)
    // En la pantalla: quieta, con la pregunta a la vista y las jugadas en las cartas (Spirit; sin él, Maiden de la mano).
    const maiden = b.mine.hand.find((id) => guested().adapter!.codeOf({ side: 'mine', id }) === MAIDEN)

    await catchUp('la pantalla del invitado, después de deshacer')
    expect(mesa().mat.auto?.asking).toBe(true)
    expect(mesa().mat.auto!.itemsFor((spirit ?? { id: maiden! }).id)?.length ?? 0).toBeGreaterThan(0)
    screen.unmount()

    if (undo === 'summon') {
      expect(spirit).toBeUndefined()
      return
    }
    // Spirit en la Zona Extra, con su efecto en la carta; se activa otra vez y se resuelve (el Blue-Eyes de la mano al campo).
    expect(at(idle!.activates, SPIRIT, L.MZONE)).toBeGreaterThanOrEqual(0)
    expect(state.base.items.get(spirit!.id)?.length).toBeGreaterThan(0)
    done.delete('effect')
    for (let q = 0; q < 40 && !(done.has('effect') && guestIdle() !== null); q += 1) await step()
    expect(guested().getSnapshot().mine.mz.filter((card) => card && guested().adapter!.codeOf({ side: 'mine', id: card.id }) === BEWD).length).toBe(undo === 'roar' ? 1 : 2)
    guestLink.destroy()
    hostLink.destroy()
  }, 10 * 60 * 1000)
})
