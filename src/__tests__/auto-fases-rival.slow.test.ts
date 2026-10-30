import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import type { Seat } from '../app/auto/protocol'
import { autoRival, DEFAULT_HANDTRAP_CONFIG } from '../app/handtraps'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * Las fases del turno del rival como las cuenta el núcleo real (lento: `npm run test:auto`; se salta sin datos), lo que «Jugar solo automático» muestra de a una con su cartel
 * (`useAutoAsks`, `rivalPhases`). El pasivo y el de handtraps, yendo primero y segundo: cada turno suyo llega entero de una, en el mismo lugar de tu cinta, como SP, M1, su End
 * Phase y el pase que te devuelve el turno (`skipDraw`, «Tu turno»); su DP no tiene acción propia (la cubre «Turno de Rival» de tu mesa).
 */
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

describe.skipIf(!hasCoreData)('las fases del rival con el núcleo real', () => {
  const store = scriptStore()
  const rows = hasCoreData ? cardRows() : []
  const loader = createDataLoader(nodeSource(rows, store), null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  // Normales sin script (como el relleno del rival): ninguna ventana en tu turno ni en el suyo.
  const filler = rows.filter((row) => row.type === 0x11 && row.alias === 0 && (row.ot & 3) !== 0 && !store.has(`c${row.id}.lua`)).map((row) => row.id).sort((a, b) => a - b).slice(0, 40)
  const deck: DeckList = { main: filler.map((code) => [code, 1] as const) }

  for (const handtraps of [false, true])
    for (const seat of [0, 1] as Seat[])
      it(`${handtraps ? 'con handtraps' : 'pasivo'}, ${seat === 0 ? 'yendo primero' : 'yendo segundo'}: SP, M1, End Phase y «Tu turno», juntas en tu cinta`, async () => {
        const rival = handtraps ? autoRival({ ...DEFAULT_HANDTRAP_CONFIG, enabled: true }) : null
        const session = createAutoSession({ loader, deck, seed: 11, seat, rival, transport: localTransport({ wasmBinary: wasm }) })
        // Vos también pasás (End Phase en cuanto se puede), hasta el turno 5.
        const me = passivePolicy(undefined, 3)
        let snap = await settled(session)

        for (let n = 0; n < 200 && snap.status === 'ready' && snap.overlay.turn < 5; n += 1) {
          session.answer(me(snap.ask!.ask)!)
          snap = await settled(session)
        }
        expect(snap.status).toBe('ready')
        const turns = new Map<number, string[]>()
        let at = 0
        let index = 0

        for (const side of snap.order) {
          if (side === 'mine') at += 1
          else {
            const action = snap.theirsActs[index++]!.action

            if (action.type === 'phase') turns.set(at, [...(turns.get(at) ?? []), action.skipDraw ? 'tu turno' : action.phase])
          }
        }
        expect(turns.size).toBeGreaterThanOrEqual(2)
        for (const phases of turns.values()) expect(phases).toEqual(['standby', 'main1', 'end', 'tu turno'])
        session.destroy()
      }, 180_000)
})
