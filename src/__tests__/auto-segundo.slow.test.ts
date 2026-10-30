import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy, randomLegalPolicy } from '../app/auto/policies'
import type { AutoEvent, CoreAnswer, CoreAsk, WireEvent } from '../app/auto/protocol'
import { autoRival } from '../app/handtraps'
import { matReducer } from '../app/practice-mat'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, slowDecklists, wasmBinary } from './support/core-data'

/**
 * Ir segundo en jugar solo automático con el núcleo real (lento: `npm run test:auto`; se salta sin datos). Vas en el asiento 1 (el núcleo siempre empieza con el 0): el rival
 * pasivo hace su turno 1 sin jugar, vos robás en tu turno 2 (una jugada, no la mano de apertura) y jugás; deshacer y reiniciar andan igual desde ese asiento. Con handtraps, el
 * rival que empieza las guarda y las usa en tu turno (Ash Blossom contra Terraforming).
 */
const ASH = 14558127
const TERRAFORMING = 73628505
const SOGEN = 86318356
const POT = 55144522

const settled = (session: AutoSession) =>
  new Promise<AutoSnapshot>((resolve) => {
    const check = () => {
      const snapshot = session.getSnapshot()

      if ((snapshot.status === 'ready' && snapshot.ask && !snapshot.replaying) || snapshot.status === 'ended' || snapshot.status === 'error') {
        off()
        resolve(snapshot)
      }
    }
    const off = session.subscribe(check)

    check()
  })

/** Lo que el rival contestó que no es pasar: su turno sin jugar es sólo cambiar de fase (`select_idlecmd` 6/7, `select_battlecmd` 2/3) y no encadenar. */
const rivalPlays = (snapshot: AutoSnapshot) => snapshot.answers.filter((item) => item.seat === 0 && ((item.answer.type === 'select_idlecmd' && item.answer.action < 6) || (item.answer.type === 'select_battlecmd' && item.answer.action < 2)))

describe.skipIf(!hasCoreData)('ir segundo en jugar solo, con el núcleo real (npm run test:auto)', () => {
  const rows = hasCoreData ? cardRows() : []
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const loader = createDataLoader(nodeSource(rows, store), null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const lists = slowDecklists()
  const ok = new Set(hasCoreData ? metaDecks(cards, store).map((deck) => deck.id) : [])
  const id = Object.keys(lists).find((key) => ok.has(key)) ?? ''

  it('el rival pasivo pasa su turno 1; vos robás en el 2 y jugás; deshacer vuelve a tu mesa y reiniciar repite el duelo', async () => {
    const seed = 0x5e9 >>> 0
    const session = createAutoSession({ loader, deck: lists[id]!, seed, seat: 1, transport: localTransport({ wasmBinary: wasm }) })
    const passive = passivePolicy()
    let snapshot = await settled(session)

    // Las ventanas de cadena de tu Draw y Standby Phase (si las hay) se pasan: la primera jugada es en tu Main Phase 1 del turno 2.
    for (let n = 0; n < 20 && snapshot.status === 'ready' && snapshot.ask!.ask.type !== 'select_idlecmd'; n += 1) {
      session.answer(passive(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    expect(snapshot.status).toBe('ready')
    expect(snapshot.ask!.seat).toBe(1)
    expect(snapshot.overlay).toMatchObject({ turn: 2, turnPlayer: 1, lp: [8000, 8000] })
    expect(rivalPlays(snapshot)).toEqual([])
    // La mano de apertura (5) y tu robo del turno 2 (1), en ese orden.
    expect(snapshot.mineActions.filter((action) => action.type === 'draw').map((action) => (action.type === 'draw' ? action.count : 0))).toEqual([5, 1])
    expect(snapshot.mine.hand).toHaveLength(6)
    const firstTable = snapshot.mine

    // Jugás al azar (legal) hasta el turno 5 o el final: la mesa reproducida es la del núcleo y el rival sigue sin jugar.
    const bot = randomLegalPolicy(seed)
    let undone = false

    for (let n = 0; n < 300 && snapshot.status === 'ready' && snapshot.overlay.turn < 5; n += 1) {
      const before = snapshot.mine
      const play = snapshot.ask!.ask.type === 'select_idlecmd' && !undone

      session.answer(bot(snapshot.ask!.ask))
      snapshot = await settled(session)
      // Deshacer tu primera jugada: la misma mesa de antes, desde el asiento 1.
      if (play && snapshot.status === 'ready') {
        undone = true
        expect(session.undo()).toBe(true)
        snapshot = await settled(session)
        expect(snapshot.mine).toEqual(before)
      }
    }
    expect(snapshot.status === 'ended' || snapshot.overlay.turn >= 5).toBe(true)
    expect(snapshot.fault).toBeNull()
    expect(snapshot.mineActions.reduce(matReducer, snapshot.initial.mine)).toEqual(snapshot.mine)
    expect(rivalPlays(snapshot)).toEqual([])

    // Reiniciar con la misma semilla: el mismo arranque desde el mismo asiento.
    session.restart()
    snapshot = await settled(session)
    for (let n = 0; n < 20 && snapshot.status === 'ready' && snapshot.ask!.ask.type !== 'select_idlecmd'; n += 1) {
      session.answer(passive(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    expect(snapshot.overlay).toMatchObject({ turn: 2, turnPlayer: 1 })
    expect(snapshot.mine).toEqual(firstTable)
    session.destroy()
  })

  it('con handtraps, el rival que empieza guarda Ash Blossom y la usa en tu turno 2', async () => {
    const events: WireEvent[] = []
    // Dos Sogen: robes el que robes en el turno 2, Terraforming tiene qué buscar.
    const deck: DeckList = { main: [[TERRAFORMING, 1], [SOGEN, 2], [POT, 1]] }
    const session = createAutoSession({
      loader,
      deck,
      hand: [TERRAFORMING],
      handSize: 1,
      seed: 1,
      seat: 1,
      transport: localTransport({ wasmBinary: wasm }),
      rival: autoRival({ enabled: true, picks: [{ id: ASH, name: 'Ash Blossom', copies: 1 }], hand: 1 }),
      onEvent: (event: AutoEvent) => {
        if (event.t === 'events' && event.seat === 1) events.push(...event.events)
      },
    })
    const passive = passivePolicy()
    let activated = false
    const answer = (ask: CoreAsk): CoreAnswer => {
      if (ask.type === 'select_idlecmd' && !activated) {
        const index = ask.activates.findIndex((card) => card.code === TERRAFORMING)

        if (index >= 0) {
          activated = true
          return { type: ask.type, action: 5, index }
        }
      }
      return passive(ask)
    }
    let snapshot = await settled(session)

    expect(snapshot.rivalHand).toEqual([ASH])
    for (let n = 0; n < 60 && snapshot.status === 'ready' && !(activated && snapshot.ask!.ask.type === 'select_idlecmd'); n += 1) {
      session.answer(answer(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    session.destroy()

    expect(snapshot.status).toBe('ready')
    expect(activated).toBe(true)
    expect(snapshot.overlay.turn).toBe(2)
    expect(events.some((event) => event.type === 'chaining' && event.code === ASH && event.controller === 0)).toBe(true)
    expect(events.some((event) => event.type === 'chain_disabled' && event.chain_size === 1)).toBe(true)
    expect(snapshot.rivalHand).toEqual([])
  })
})
