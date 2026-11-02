import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { askView, openAsk } from '../app/auto/ask-ui'
import { askWhy } from '../app/auto/ask-why'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * La regla de `ask-why.ts` contra el núcleo real (lento: `npm run test:auto`; se salta sin datos). One for One: mandar un monstruo de la mano al Cementerio es su costo y lo que se
 * Invoca del Deck, su efecto (también la casilla). Monster Reincarnation: descartar es su costo y el monstruo del Cementerio, su objetivo («al activar»: el núcleo no dice que lo es).
 */

const ONE_FOR_ONE = 2295440
const REINCARNATION = 74848038
const VEILER = 97268402

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

describe.skipIf(!hasCoreData)('por qué se pregunta algo, con el núcleo real (npm run test:auto)', () => {
  it('el costo se pregunta activándose y el efecto, resolviéndose', async () => {
    const deck: DeckList = { main: [[ONE_FOR_ONE, 1], [REINCARNATION, 1], [VEILER, 38]], extra: [] }
    const session = createAutoSession({ loader: createDataLoader(nodeSource(cardRows(), scriptStore()), null), deck, hand: [ONE_FOR_ONE, REINCARNATION, VEILER, VEILER, VEILER], handSize: 5, seed: 1, transport: localTransport({ wasmBinary: wasmBinary() }) })
    const passive = passivePolicy()
    const used = new Set<number>()
    const seen: string[] = []
    let snapshot = await settled(session)

    for (let n = 0; n < 40 && snapshot.status === 'ready'; n += 1) {
      const pending = snapshot.ask!
      const ask = pending.ask

      if (ask.type === 'select_idlecmd') {
        const index = ask.activates.findIndex((card) => !used.has(card.code))

        if (index < 0) break
        used.add(ask.activates[index]!.code)
        session.answer({ type: ask.type, action: 5, index })
      } else {
        const cards = askView(openAsk(pending, { queries: session.adapter!, prefs: { chainMode: 'never', placeMode: 'auto' } })).cardPick?.cards
        const why = askWhy(ask.type, snapshot.overlay, cards)

        if (why) seen.push(`${ask.type}:${pending.title ?? ''}:${why.role}:${why.code}`)
        session.answer(passive(ask))
      }
      snapshot = await settled(session)
    }
    session.destroy()

    expect(seen).toEqual([
      `select_card:504:cost:${ONE_FOR_ONE}`,
      `select_card:509:effect:${ONE_FOR_ONE}`,
      `select_place:${VEILER}:effect:${ONE_FOR_ONE}`,
      `select_position::effect:${ONE_FOR_ONE}`,
      `select_card:501:cost:${REINCARNATION}`,
      `select_card:506:activation:${REINCARNATION}`,
    ])
  }, 60_000)
})
