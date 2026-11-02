import { createDataLoader } from '../app/auto/auto-data'
import { askView, effectAskText, openAsk } from '../app/auto/ask-ui'
import { createAutoSession, type AutoSession, type AutoSnapshot, type TransportFactory } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { ANGELECHY as A } from '../app/bot-deck-lists'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * La causa de «¿Activás el efecto?» contra el núcleo real (lento: `npm run test:auto`; se salta sin datos). Angelechy Problem Invoca de Modo Especial a Enlisted y después pone a
 * Castellan como Mágica Continua: el núcleo manda `spsummoning` de Enlisted y recién después el `move` de Castellan, y pregunta por Castellan (se dispara por el movimiento). La
 * pregunta no dice «Tras la Invocación Especial»: dice lo neutro.
 */

const BEWD = 89631139

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

describe.skipIf(!hasCoreData)('qué disparó un efecto, con el núcleo real (npm run test:auto)', () => {
  it('Castellan puesto como Continua después de la Invocación de Enlisted: no dice «Tras la Invocación Especial»', async () => {
    const seen: string[] = []
    const base = localTransport({ wasmBinary: wasmBinary() })
    // Los mensajes que llegan a tu asiento, para comprobar el orden.
    const transport: TransportFactory = (data) => {
      const inner = base(data)

      return { ...inner, onEvent: (next) => inner.onEvent((event) => (event.t === 'events' && event.seat === 0 && seen.push(...event.events.map((item) => ('code' in item ? `${item.type}:${item.code}` : item.type))), next(event))) }
    }
    const deck: DeckList = { main: [[A.problem, 3], [A.opposition, 3], [BEWD, 34]], extra: [[A.enlisted, 1], [A.castellan, 1]] }
    const session = createAutoSession({ loader: createDataLoader(nodeSource(cardRows(), scriptStore()), null), deck, hand: [A.problem, A.opposition, BEWD, BEWD, BEWD], handSize: 5, seed: 1, transport })
    const passive = passivePolicy()
    let snapshot = await settled(session)

    // Activás Problem y después su efecto (descartás Opposition, Invocás a Enlisted y ponés a Castellan); lo demás, lo primero que se ofrece.
    for (let n = 0; n < 40 && snapshot.status === 'ready' && snapshot.ask?.ask.type !== 'select_effectyn'; n += 1) {
      const ask = snapshot.ask!.ask
      const problem = ask.type === 'select_idlecmd' ? ask.activates.findIndex((card) => card.code === A.problem) : -1

      session.answer(problem >= 0 ? { type: 'select_idlecmd', action: 5, index: problem } : passive(ask))
      snapshot = await settled(session)
    }

    const pending = snapshot.ask!
    const prompt = askView(openAsk(pending, { queries: session.adapter!, prefs: { chainMode: 'ask', placeMode: 'auto' } })).prompt!
    const summoned = seen.lastIndexOf(`spsummoning:${A.enlisted}`)

    session.destroy()
    expect(pending.ask).toMatchObject({ type: 'select_effectyn', code: A.castellan })
    expect(summoned).toBeGreaterThanOrEqual(0)
    expect(seen.slice(summoned)).toContain('move')
    expect(snapshot.overlay.cause).toBeNull()
    expect(effectAskText(prompt, snapshot.overlay.cause)).toEqual({ kicker: 'Efecto que se dispara', text: '¿Activás el efecto?', place: 'Campo' })
  }, 60_000)
})
