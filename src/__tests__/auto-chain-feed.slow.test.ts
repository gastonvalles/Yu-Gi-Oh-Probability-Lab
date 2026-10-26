import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { chainFeed } from '../app/auto/chain-feed'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { autoRival } from '../app/handtraps'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * El aviso de la cadena contra el núcleo real (lento: `npm run test:auto`; se salta sin datos): activás Terraforming, el rival responde con Ash Blossom y la cadena de dos
 * eslabones llega de una. Los pasos que anota el adaptador (`chainSteps`) la cuentan en orden: CL1 tuyo, CL2 suyo, se resuelve primero CL2 y después CL1 (sin efecto), y fin.
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

describe.skipIf(!hasCoreData)('el aviso de la cadena contra el núcleo real (npm run test:auto)', () => {
  it('Terraforming respondida por Ash: se arma CL1 → CL2 y se resuelve CL2 → CL1, con lo negado en su eslabón (el núcleo lo niega mientras se resuelve Ash)', async () => {
    const rows = cardRows()
    const deck: DeckList = { main: [[TERRAFORMING, 1], [SOGEN, 1], [POT, 1]], extra: [] }
    const session = createAutoSession({
      loader: createDataLoader(nodeSource(rows, scriptStore()), null),
      deck,
      hand: [TERRAFORMING],
      handSize: 1,
      seed: 1,
      transport: localTransport({ wasmBinary: wasmBinary() }),
      rival: autoRival({ enabled: true, picks: [{ id: ASH, name: 'Ash Blossom & Joyous Spring', copies: 1 }], hand: 1 }),
    })
    const passive = passivePolicy()
    let snapshot = await settled(session)
    let activated = false

    for (let n = 0; n < 40 && snapshot.status === 'ready' && !(activated && snapshot.ask?.ask.type === 'select_idlecmd'); n += 1) {
      const ask = snapshot.ask!.ask

      if (ask.type === 'select_idlecmd' && !activated) {
        activated = true
        session.answer({ type: ask.type, action: 5, index: ask.activates.findIndex((card) => card.code === TERRAFORMING) })
      } else session.answer(passive(ask))
      snapshot = await settled(session)
    }
    session.destroy()

    const steps = snapshot.chainSteps
    const start = steps.findIndex((step) => step.kind === 'chain' && step.link?.code === TERRAFORMING)
    const chain = steps.slice(start, steps.findIndex((step, i) => i > start && step.kind === 'end') + 1)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(chain.map((step) => `${step.kind}:${step.index}`)).toEqual(['chain:0', 'chain:1', 'solving:1', 'disabled:0', 'solved:1', 'solving:0', 'solved:0', 'end:-1'])
    expect(chain.filter((step) => step.kind === 'chain').map((step) => [step.link?.code, step.link?.mine])).toEqual([[TERRAFORMING, true], [ASH, false]])
    // Cada paso, cuando la mesa contó hasta ahí (Terraforming boca arriba en su casilla, antes que su eslabón) y nunca después de lo que hay.
    expect(chain.every((step, i) => step.at <= snapshot.mineActions.length && (i === 0 || step.at >= chain[i - 1]!.at))).toBe(true)
    expect(['place', 'activate']).toContain(snapshot.mineActions[chain[0]!.at - 1]?.type)
    expect(chainFeed(steps, start + chain.length)).toMatchObject({ done: true, rows: [{ number: 1, code: TERRAFORMING, state: 'disabled' }, { number: 2, code: ASH, state: 'solved' }] })
  }, 60_000)
})
