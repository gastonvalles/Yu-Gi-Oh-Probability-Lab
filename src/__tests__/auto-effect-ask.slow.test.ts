import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createDataLoader } from '../app/auto/auto-data'
import { askView, effectAskText, openAsk } from '../app/auto/ask-ui'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { CORE_DATA_DIR, cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * «¿Activás el efecto…?» con contexto, contra el núcleo real (lento: `npm run test:auto`; se salta sin datos). Invocás de forma Normal a Legendary Fire King Ponix (dos efectos
 * opcionales que se disparan): el núcleo pregunta por la carta, en su casilla, con el `desc` 221 y sin decir cuál de sus efectos es; la pregunta cuenta la Invocación (`overlay.cause`
 * del adaptador), el lugar y la frase del efecto de la Invocación, la única de las dos que nombra «this card is … Summoned».
 */

const PONIX = 90681088
const ISLAND = 57554544

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

describe.skipIf(!hasCoreData)('la pregunta de un efecto que se dispara, con su contexto (npm run test:auto)', () => {
  it('Invocación Normal de Ponix: «Tras la Invocación Normal de …», en la Zona de Monstruos, con la frase de su efecto de Invocación', async () => {
    const rows = cardRows()
    const byId = new Map(rows.map((row) => [row.id, row]))
    // El texto de la carta (el mismo, en inglés, que trae el catálogo).
    const db = new DatabaseSync(path.join(CORE_DATA_DIR, 'cards.cdb'), { readOnly: true })
    const ponixText = (db.prepare('select desc from texts where id = ?').get(PONIX) as { desc: string }).desc

    db.close()
    const deck: DeckList = { main: [[PONIX, 1], [ISLAND, 3]], extra: [] }
    const session = createAutoSession({ loader: createDataLoader(nodeSource(rows, scriptStore()), null), deck, hand: [PONIX], handSize: 1, seed: 1, transport: localTransport({ wasmBinary: wasmBinary() }) })
    const passive = passivePolicy()
    let snapshot = await settled(session)
    let summoned = false

    for (let n = 0; n < 40 && snapshot.status === 'ready' && snapshot.ask?.ask.type !== 'select_effectyn'; n += 1) {
      const ask = snapshot.ask!.ask

      if (ask.type === 'select_idlecmd' && !summoned) {
        summoned = true
        session.answer({ type: ask.type, action: 0, index: ask.summons.findIndex((card) => card.code === PONIX) })
      } else session.answer(passive(ask))
      snapshot = await settled(session)
    }

    const pending = snapshot.ask!
    const prompt = askView(openAsk(pending, { queries: session.adapter!, prefs: { chainMode: 'ask', placeMode: 'auto' } })).prompt!

    session.destroy()
    expect(pending.ask).toMatchObject({ type: 'select_effectyn', code: PONIX, description: '221' })
    expect(snapshot.overlay.cause).toEqual({ kind: 'normal', codes: [PONIX] })
    expect(prompt).toMatchObject({ at: 'mz', trigger: true })
    expect(effectAskText({ ...prompt, card: prompt.card! }, snapshot.overlay.cause, (code) => byId.get(code)?.name ?? '?', ponixText)).toEqual({
      kicker: 'Efecto que se dispara',
      text: 'Tras la Invocación Normal de Legendary Fire King Ponix (en la Zona de Monstruos): ¿activás su efecto?',
      place: 'Campo',
      effect: { when: 'If this card is Normal or Special Summoned', what: 'You can add 1 "Fire King" Spell/Trap from your Deck to your hand.' },
    })
  }, 60_000)
})
