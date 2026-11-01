import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * La casilla de una Mágica que se activa desde la mano, contra el núcleo real (lento: `npm run test:auto`; se salta sin datos): `select_place` no trae `can_cancel` ni deja
 * una respuesta que cancele, así que «Cancelar» de la pantalla es `undo`. Con la cadena vacía, deshacer ahí devuelve el menú de tus jugadas con la carta en la mano y sin jugadas hechas.
 */

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

describe.skipIf(!hasCoreData)('cancelar la casilla de una Mágica (npm run test:auto)', () => {
  it('activarla pregunta la casilla con la cadena vacía y deshacer vuelve a tus jugadas, con la carta todavía activable', async () => {
    const deck: DeckList = { main: [[POT, 40]], extra: [] }
    const session = createAutoSession({ loader: createDataLoader(nodeSource(cardRows(), scriptStore()), null), deck, hand: [POT], handSize: 1, seed: 1, transport: localTransport({ wasmBinary: wasmBinary() }) })
    const passive = passivePolicy()
    let snapshot = await settled(session)

    for (let n = 0; n < 40 && snapshot.status === 'ready' && snapshot.ask?.ask.type !== 'select_place'; n += 1) {
      const ask = snapshot.ask!.ask

      if (ask.type === 'select_idlecmd') session.answer({ type: ask.type, action: 5, index: ask.activates.findIndex((card) => card.code === POT) })
      else session.answer(passive(ask))
      snapshot = await settled(session)
    }

    expect(snapshot.ask?.ask.type).toBe('select_place')
    expect(snapshot.overlay.chain).toEqual([])
    expect(snapshot.answers.map((item) => item.answer.type)).toEqual(['select_idlecmd'])

    expect(session.undo()).toBe(true)
    snapshot = await settled(session)
    const back = snapshot.ask?.ask

    session.destroy()
    expect(back?.type).toBe('select_idlecmd')
    expect(back?.type === 'select_idlecmd' ? back.activates.map((card) => card.code) : []).toEqual([POT])
    expect(snapshot.answers).toEqual([])
  }, 60_000)
})
