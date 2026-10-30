import { createDataLoader } from '../app/auto/auto-data'
import { autoSaveStore } from '../app/auto/auto-save'
import type { AutoSession } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { createGuestLink, createHostLink, type OnlineLink } from '../app/auto/online'
import type { AutoCommand } from '../app/auto/protocol'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel } from '../app/duel-session'
import { seeded, seededKey } from './support/ask-ui-player'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, slowDecklists, wasmBinary } from './support/core-data'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'

/**
 * Un Match con siding en el duelo automático por enlace, con el núcleo real (lento: `npm run test:auto`; se salta sin datos): el primer duelo termina, cada uno cambia una carta
 * con su Side (el invitado la manda con `autoDeck`), el anfitrión recarga en el siding y rearma el duelo terminado, y el segundo arranca en el núcleo con los decks nuevos, con la
 * mesa del invitado igual a la que el anfitrión calcula para él.
 */
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

  if (a.status === 'error' || a.replaying || b.replaying) return a.status === 'error'
  if (a.status === 'ready' && a.ask) return b.status === 'waiting'

  return a.status === 'waiting' && a.remoteAsk !== null && b.status === 'ready' && b.ask?.askId === a.remoteAsk.askId
}

/** Una copia menos de la primera carta del Main y una más de `code` (el siding de una carta). */
function side(deck: DeckList, code: number): DeckList {
  const [[first, copies], ...rest] = deck.main as [readonly [number, number], ...(readonly [number, number])[]]

  return { ...deck, main: [...(copies > 1 ? [[first, copies - 1] as const] : []), ...rest, [code, 1] as const] }
}

describe.skipIf(!hasCoreData)('un Match con siding por enlace, con el núcleo real (npm run test:auto)', () => {
  it('el segundo duelo arranca con los decks del siding, también si el anfitrión recargó en el siding', async () => {
    const rows = cardRows()
    const { cards } = loadCards()
    const store = scriptStore()
    const source = nodeSource(rows, store)
    const lists = slowDecklists()
    const ok = new Set(metaDecks(cards, store).map((deck) => deck.id))
    const [hostId, guestId] = Object.keys(lists).filter((id) => ok.has(id))
    const hostDeck = lists[hostId!]!
    const guestDeck = lists[guestId!]!
    const wasm = wasmBinary()
    const commands: AutoCommand[] = []
    const makeTransport = (data: Parameters<ReturnType<typeof localTransport>>[0]) => {
      const inner = localTransport({ wasmBinary: wasm })(data)

      return { send: (command: AutoCommand) => (commands.push(command), inner.send(command)), onEvent: inner.onEvent, terminate: () => inner.terminate() }
    }
    let clock = 0
    const now = () => (clock += 100)
    const random = seeded(7)
    const items = new Map<string, string>()
    const save = autoSaveStore('MATCH001', { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key) }, now)
    const settings = { ...DEFAULT_SETTINGS, auto: true, match: true, siding: true }
    const room = createMemoryRoom()
    const hostEnd = room.join()
    const guestEnd = room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    const hostLinkOf = (end: typeof hostEnd, deck: DeckList) => createHostLink({ transport: end, loader: createDataLoader(source, null), deck, handSize: 5, makeTransport, enabled: async () => true, now, newKey: seededKey(random), save })
    let hostLink: OnlineLink = hostLinkOf(hostEnd, hostDeck)
    const guestLink = createGuestLink({ transport: guestEnd, source, deck: guestDeck, now })

    guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
    const offHost = host.subscribe(() => hostLink.observe(host.getSnapshot()))

    hostLink.observe(host.getSnapshot())
    guestLink.observe(guest.getSnapshot())
    expect(await pump(room, () => hostLink.getSnapshot().phase === 'ready' && guestLink.getSnapshot().phase === 'ready')).toBe(true)
    // Los dos llevan el reloj de turnos con quien decide (`turnClock` en el deck y en la revisión).
    expect([hostLink.getSnapshot().clock, guestLink.getSnapshot().clock]).toEqual([true, true])
    host.setReady(true)
    guest.setReady(true)
    room.flush()
    host.chooseMethod('rps')
    room.flush()
    host.pickRps('rock')
    guest.pickRps('scissors')
    room.flush()
    host.chooseFirst(0)
    expect(await pump(room, () => Boolean(hostLink.getSnapshot().session && guestLink.getSnapshot().session && settled(hostLink.getSnapshot().session!, guestLink.getSnapshot().session!)))).toBe(true)

    // Beto se rinde. En el siding, cada uno cambia una carta por una del deck del otro (una que el núcleo conoce).
    guest.concede()
    room.flush()
    const guestSided = side(guestDeck, hostDeck.main[0]![0])
    const hostSided = side(hostDeck, guestDeck.main[0]![0])

    guestLink.deck!(guestSided)
    hostLink.deck!(hostSided)
    expect(await pump(room, () => hostLink.getSnapshot().phase === 'ended')).toBe(true)
    expect(items.size).toBe(1)

    // Ana recarga en el siding: otra sala, otro enlace (ya con su deck nuevo) y otro núcleo; el duelo terminado se rearma con lo guardado.
    offHost()
    hostLink.destroy()
    hostEnd.close()
    const hostEnd2 = room.join()
    const host2 = createDuel(hostEnd2, { role: 'host', name: 'Ana', sid: 'host-2', settings, ended: { conceded: 1, timeUp: false } })

    hostLink = hostLinkOf(hostEnd2, hostSided)
    host2.subscribe(() => hostLink.observe(host2.getSnapshot()))
    hostLink.observe(host2.getSnapshot())
    expect(await pump(room, () => hostLink.getSnapshot().phase === 'ended' && host2.getSnapshot().opening.ordered)).toBe(true)

    host2.rematch()
    guest.rematch()
    room.flush()
    expect(await pump(room, () => hostLink.getSnapshot().phase === 'ready' && guestLink.getSnapshot().phase === 'ready')).toBe(true)
    expect(items.size).toBe(0)
    expect(host2.getSnapshot().series).toMatchObject({ game: 2, wins: [1, 0] })
    guest.chooseFirst(1)
    const before = commands.length

    expect(await pump(room, () => Boolean(hostLink.getSnapshot().session && guestLink.getSnapshot().session && settled(hostLink.getSnapshot().session!, guestLink.getSnapshot().session!)))).toBe(true)
    const create = commands.slice(before).find((command) => command.t === 'create') as Extract<AutoCommand, { t: 'create' }>
    const count = (codes: readonly number[], code: number) => codes.filter((item) => item === code).length
    const expand = (deck: DeckList) => deck.main.flatMap(([code, copies]) => Array<number>(copies).fill(code))
    const hosted = hostLink.getSnapshot().session!.getSnapshot()

    // Beto va primero (asiento 0): su deck es el del siding, y el de Ana también.
    expect(hostLink.getSnapshot().seat).toBe(1)
    expect(hosted.status).not.toBe('error')
    expect([...create.decks[0]!.main].sort()).toEqual(expand(guestSided).sort())
    expect(count(create.decks[1]!.main, guestDeck.main[0]![0])).toBe(count(expand(hostSided), guestDeck.main[0]![0]))
    expect(create.decks[1]!.main).toHaveLength(expand(hostSided).length)
    const mirror = guestLink.getSnapshot().session!.getSnapshot()

    expect({ mine: mirror.mine, theirs: mirror.theirs, overlay: mirror.overlay }).toEqual(hostLink.getSnapshot().session!.viewOf!(0))
    hostLink.destroy()
    guestLink.destroy()
  }, 180_000)
})
