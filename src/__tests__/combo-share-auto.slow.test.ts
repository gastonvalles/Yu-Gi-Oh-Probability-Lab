import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { foldOpeningHand } from '../app/auto/opening-hand'
import { randomLegalPolicy } from '../app/auto/policies'
import { comboEnvelope, decodeComboPayload, encodeComboPayload, packPayload } from '../app/combo-share'
import { replayMat } from '../app/practice-mat'
import { createSavedCombo } from '../app/saved-combos'
import { withoutId } from './support/combo-fixtures'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * El enlace v2 de combos grabados con el núcleo real (`auto: true`; lento: `npm run test:auto`; se salta sin datos): van y vuelven igual (sin los nombres), se reproducen
 * en la misma mesa y miden menos de la mitad que en v1 (el informe sale por consola).
 */
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

describe.skipIf(!hasCoreData)('el enlace de un combo grabado con el núcleo real (npm run test:auto)', () => {
  it('va y vuelve, se reproduce igual y mide menos de la mitad que v1', async () => {
    const rows = cardRows()
    const store = scriptStore()
    const { cards } = loadCards()
    const lists = JSON.parse(readFileSync(path.join(process.cwd(), 'src/data/meta-decklists.json'), 'utf8')) as Record<string, DeckList>
    const report = ['jugadas | enlace v1 → v2']

    for (const [n, deck] of metaDecks(cards, store).slice(0, 3).entries()) {
      const session = createAutoSession({ loader: createDataLoader(nodeSource(rows, store), null), deck: lists[deck.id]!, seed: 7 + n, transport: localTransport({ wasmBinary: wasmBinary() }) })
      const bot = randomLegalPolicy(7 + n)
      let snapshot = await settled(session)

      for (let i = 0; i < 600 && snapshot.status === 'ready' && snapshot.mineActions.length < 46; i += 1) {
        session.answer(bot(snapshot.ask!.ask))
        snapshot = await settled(session)
      }
      const { initial, skip } = foldOpeningHand(snapshot.initial.mine, snapshot.mineActions)
      const nameOf = (cardId: string) => snapshot.names[Number(cardId.split('-')[1])] ?? cardId
      const combo = createSavedCombo({ name: `Del núcleo ${n}`, deckName: deck.id, initial, actions: snapshot.mineActions.slice(skip), nameOf, auto: true }, [])
      session.destroy()

      const [v1, v2] = [await packPayload(comboEnvelope(combo)), await encodeComboPayload(combo)]
      const result = await decodeComboPayload(v2)
      expect(result).toEqual({ ok: true, combo: { ...withoutId(combo), names: {} } })
      if (result.ok) expect(replayMat(result.combo.initial, result.combo.actions)).toEqual(replayMat(combo.initial, combo.actions))
      expect(v2.length).toBeLessThan(v1.length / 2)
      report.push(`${combo.actions.length} | ${v1.length} → ${v2.length} (${Math.round((100 * v2.length) / v1.length)} %)`)
    }
    console.info(report.join('\n'))
  }, 600_000)
})
