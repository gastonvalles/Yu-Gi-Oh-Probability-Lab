import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * Una carta ascendida (de preestreno, con el passcode de nuestros decks) que se excluye por su nombre (`not c:IsCode(id)`), contra el
 * núcleo real (lento: `npm run test:auto`; se salta sin datos): Angelechy Strategy Score agrega una Magia/Trampa «Angelechy», excepto
 * «Angelechy Strategy Score». Sus otras copias del deck no son candidatas.
 */

const STRATEGY_SCORE = 13068112
const OTHERS = [12845564, 86457955, 59062857, 48340269]

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

describe.skipIf(!hasCoreData)('una carta ascendida que se excluye por su nombre (npm run test:auto)', () => {
  it('Angelechy Strategy Score no ofrece sus otras copias', async () => {
    const rows = cardRows()
    const name = new Map(rows.map((row) => [row.id, row.name]))
    const deck: DeckList = { main: [[STRATEGY_SCORE, 3], ...OTHERS.map((code) => [code, 2] as [number, number])], extra: [] }
    const session = createAutoSession({ loader: createDataLoader(nodeSource(rows, scriptStore()), null), deck, hand: [STRATEGY_SCORE], handSize: 1, seed: 1, transport: localTransport({ wasmBinary: wasmBinary() }) })
    const passive = passivePolicy()
    let snapshot = await settled(session)
    let activated = false

    for (let n = 0; n < 40 && snapshot.status === 'ready' && !(activated && snapshot.ask?.ask.type === 'select_card'); n += 1) {
      const ask = snapshot.ask!.ask

      if (ask.type === 'select_idlecmd' && !activated) {
        activated = true
        session.answer({ type: ask.type, action: 5, index: ask.activates.findIndex((card) => card.code === STRATEGY_SCORE) })
      } else session.answer(passive(ask))
      snapshot = await settled(session)
    }

    const pending = snapshot.ask?.ask
    const offered = pending?.type === 'select_card' ? pending.selects.map((card) => card.code) : []

    session.destroy()
    expect(offered.length).toBeGreaterThan(0)
    expect(offered.filter((code) => name.get(code) === 'Angelechy Strategy Score')).toEqual([])
  }, 60_000)
})
