import { askView, openAsk, step, type AskState } from '../app/auto/ask-ui'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { replayMat } from '../app/practice-mat'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * Las fases con el núcleo real (lento: `npm run test:auto`; se salta sin datos). Con Scapegoat (una Mágica de Juego Rápido) en la mano, el núcleo abre la ventana
 * de tu Draw y tu Standby Phase del turno 1 y la mesa las muestra (`ask-ui`), con el botón de fases que pasa; sin nada que activar, el núcleo ya espera en la Main
 * Phase 1 con la DP y la SP contadas (la mesa las pasa solas); activar en la DP sigue solo hasta la M1.
 */
const SCAPEGOAT = 73915051
const PASS = { type: 'select_chain', index: null }

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

describe.skipIf(!hasCoreData)('las fases con el núcleo real', () => {
  const store = scriptStore()
  const rows = hasCoreData ? cardRows() : []
  const types = new Map(rows.map((row) => [row.id, row.type]))
  const loader = createDataLoader(nodeSource(rows, store), null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  // Normales sin script (como el relleno del rival): no abren ninguna ventana.
  const filler = rows.filter((row) => row.type === 0x11 && row.alias === 0 && (row.ot & 3) !== 0 && !store.has(`c${row.id}.lua`)).map((row) => row.id).sort((a, b) => a - b).slice(0, 40)
  const deckOf = (hand: number[]): DeckList => ({ main: [...new Set([...hand, ...filler])].slice(0, 40).map((code) => [code, 1] as const) })
  const start = (hand: number[]) => createAutoSession({ loader, deck: deckOf(hand), hand, handSize: hand.length, seed: 7, transport: localTransport({ wasmBinary: wasm }) })
  const open = (snapshot: AutoSnapshot, session: AutoSession, chainMode: 'ask' | 'never' = 'ask'): AskState =>
    openAsk(snapshot.ask!, { queries: session.adapter!, prefs: { chainMode, placeMode: 'auto' }, phase: session.adapter!.mine.phase, typeOf: (code) => types.get(code) ?? 0 })
  /** Contesta lo que la mesa contesta sola (las casillas, las cadenas sin nada) hasta la próxima pregunta que se muestra. */
  const shownNext = async (session: AutoSession) => {
    for (let n = 0; n < 40; n += 1) {
      const snapshot = await settled(session)

      if (snapshot.status !== 'ready') return snapshot
      const auto = askView(open(snapshot, session)).auto

      if (!auto?.answer) return snapshot
      session.answer(auto.answer)
    }
    throw new Error('demasiadas preguntas que se contestan solas')
  }

  it('con una Rápida en la mano: la ventana de tu DP y la de tu SP se muestran y «Standby Phase» y «Main Phase 1» pasan; con «Nunca», se pasan solas', async () => {
    const session = start([SCAPEGOAT, ...filler.slice(0, 4)])
    let snap = await settled(session)

    expect(snap.ask?.ask).toMatchObject({ type: 'select_chain', hint_timing: 0x1, spe_count: 0 })
    expect(askView(open(snap, session, 'never')).auto).toEqual({ answer: PASS, why: 'setting' })
    const dp = askView(open(snap, session))

    expect(dp.auto).toBeNull()
    expect(dp.phaseWindow).toBe('draw')
    expect(dp.respond).toHaveLength(1)
    // El núcleo todavía no pasó a la SP: la mesa está en la DP del turno 1.
    expect(snap.mine.phase).toBe('draw')
    const toStandby = step(open(snap, session), { kind: 'item', answer: dp.phaseItems.find((item) => item.to === 'standby')!.answer! })

    expect(toStandby.answer).toEqual(PASS)
    session.answer(toStandby.answer!)
    snap = await settled(session)
    expect(snap.ask?.ask).toMatchObject({ type: 'select_chain', hint_timing: 0x2 })
    const sp = askView(open(snap, session))

    expect(sp.phaseWindow).toBe('standby')
    session.answer(sp.phaseItems.find((item) => item.to === 'main1')!.answer!)
    snap = await settled(session)
    expect(snap.ask?.ask.type).toBe('select_idlecmd')
    expect(snap.mine.phase).toBe('main1')
    session.destroy()
  }, 120_000)

  it('sin nada que activar (vas primero, sin robo) el núcleo ya espera en la Main Phase 1: la mesa cuenta la DP, la SP y la M1 sin pregunta en el medio', async () => {
    const session = start(filler.slice(0, 5))
    const snap = await settled(session)
    const { mine } = snap.initial

    expect(snap.ask?.ask.type).toBe('select_idlecmd')
    expect(mine).toMatchObject({ phase: 'draw', turn: 1 })
    expect(snap.mineActions.slice(-2)).toEqual([
      { type: 'phase', phase: 'standby' },
      { type: 'phase', phase: 'main1' },
    ])
    expect(snap.mineActions.filter((action) => action.type === 'draw')).toHaveLength(1)
    expect(replayMat(mine, snap.mineActions)).toMatchObject({ phase: 'main1', turn: 1 })
    session.destroy()
  }, 120_000)

  it('activar Scapegoat en la DP: después de la cadena el turno sigue solo hasta la M1 (con las fichas)', async () => {
    const session = start([SCAPEGOAT, ...filler.slice(0, 4)])
    let snap = await settled(session)
    const [activate] = [...askView(open(snap, session)).items.values()][0]!

    expect(activate!.answer).toEqual({ type: 'select_chain', index: 0 })
    session.answer(activate!.answer!)
    snap = await shownNext(session)
    expect(snap.ask?.ask.type).toBe('select_idlecmd')
    expect(replayMat(snap.initial.mine, snap.mineActions)).toMatchObject({ phase: 'main1', mz: [expect.anything(), expect.anything(), expect.anything(), expect.anything(), null] })
    session.destroy()
  }, 120_000)
})
