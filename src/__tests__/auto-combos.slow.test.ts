import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { foldOpeningHand } from '../app/auto/opening-hand'
import { randomLegalPolicy } from '../app/auto/policies'
import { describeMatSteps, replayMat } from '../app/practice-mat'
import { createSavedCombo, readSavedCombos, writeSavedCombos } from '../app/saved-combos'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * Un combo grabado en «Jugar solo automático» con el núcleo real (lento: `npm run test:auto`; se salta sin datos): la cinta del núcleo, con la mano de apertura plegada en la
 * mesa del arranque (como la lee la pantalla), se guarda en la lista de la práctica, se lee de ahí y, reproducida, es la mesa del núcleo; sus pasos se leen con las frases de siempre.
 */
// La lista de combos vive en `localStorage`: el núcleo (con `node:sqlite`) no corre en jsdom, así que el almacenamiento es uno en memoria.
const memory = new Map<string, string>()

vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, String(value)), removeItem: (key: string) => void memory.delete(key), clear: () => memory.clear() })

const settled = (session: AutoSession) =>
  new Promise<AutoSnapshot>((resolve) => {
    const check = () => {
      const snapshot = session.getSnapshot()

      if ((snapshot.status === 'ready' && snapshot.ask !== null && !snapshot.replaying) || snapshot.status === 'ended' || snapshot.status === 'error') {
        off()
        resolve(snapshot)
      }
    }
    const off = session.subscribe(check)

    check()
  })

describe.skipIf(!hasCoreData)('un combo grabado con el núcleo real (npm run test:auto)', () => {
  it('unas 20 jugadas del núcleo, guardadas como combo, se leen de la lista de la práctica y reproducidas son la mesa del núcleo', async () => {
    const rows = cardRows()
    const store = scriptStore()
    const { cards } = loadCards()
    const lists = JSON.parse(readFileSync(path.join(process.cwd(), 'src/data/meta-decklists.json'), 'utf8')) as Record<string, DeckList>
    const id = metaDecks(cards, store)[0]!.id
    const session = createAutoSession({ loader: createDataLoader(nodeSource(rows, store), null), deck: lists[id]!, seed: 7, transport: localTransport({ wasmBinary: wasmBinary() }) })
    const bot = randomLegalPolicy(7)
    let snapshot = await settled(session)

    for (let n = 0; n < 300 && snapshot.status === 'ready' && snapshot.mineActions.length < 20; n += 1) {
      session.answer(bot(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    expect(snapshot.mineActions.length).toBeGreaterThanOrEqual(20)

    const { initial, skip } = foldOpeningHand(snapshot.initial.mine, snapshot.mineActions)
    const nameOf = (cardId: string) => snapshot.names[Number(cardId.split('-')[1])] ?? cardId
    const combo = createSavedCombo({ name: 'Del núcleo', deckName: id, initial, actions: snapshot.mineActions.slice(skip), nameOf, auto: true }, [])

    expect(skip).toBe(1)
    expect(initial.hand).toHaveLength(5)
    writeSavedCombos([combo])
    const [read] = readSavedCombos()

    expect(read).toEqual(combo)
    expect(replayMat(read!.initial, read!.actions)).toEqual(snapshot.mine)
    expect(read!.names[read!.initial.hand[0]!]).toBe(snapshot.names[Number(read!.initial.hand[0]!.split('-')[1])])
    const lines = describeMatSteps(read!.initial, read!.actions, (cardId) => read!.names[cardId] ?? cardId)

    expect(lines).toHaveLength(read!.actions.length)
    expect(lines.filter((line) => !line || /undefined|card-\d/.test(line))).toEqual([])
    session.destroy()
  }, 300_000)
})
