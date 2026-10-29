import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { OcgDuelMode } from 'ocgcore-wasm'
import { createDataLoader, preloadedReaders } from '../app/auto/auto-data'
import { createAutoHost } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { randomLegalPolicy } from '../app/auto/policies'
import type { AutoEvent } from '../app/auto/protocol'
import { cardRows, CORE_DATA_DIR, hasCoreData, nodeSource, runDuel, scriptStore, wasmBinary } from './support/core-data'

/**
 * Las cartas de los sets recientes que no están en `cards.cdb` (lento: `npm run test:auto`; se salta sin datos): con sus passcodes de
 * YGOPRODeck, los de nuestros decks, entran por las bases de preestreno que junta `mergeCdbs` (las Angelechy sólo están con un id
 * provisorio: van ascendidas) y juegan duelos enteros sin RETRY ni errores. El informe (turnos y efectos que se activaron) va a CORE_DATA_DIR.
 */
const ANGELECHY = [28904860, 59062857, 50284408, 55393975, 54171327, 12845564, 81797573, 80565021, 86457955, 17782288, 86673403, 42410161, 13068112, 48340269]
const ARS_MAGNA = [37279096, 90728287, 101403061, 101403045, 101403046, 101403047, 62368221, 99753860, 36270527]
const EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000
const DUELS = 4

describe.skipIf(!hasCoreData)('las cartas recientes con el núcleo real (npm run test:auto)', () => {
  it('un deck de Angelechy y Ars Magna no tiene cartas faltantes ni sin reglas, y juega duelos enteros sin RETRY ni errores', async () => {
    const rows = cardRows()
    const types = new Map(rows.map((row) => [row.id, row.type]))
    const codes = [...ANGELECHY, ...ARS_MAGNA]
    const list: DeckList = { main: codes.filter((code) => !((types.get(code) ?? 0) & EXTRA)).map((code) => [code, 3]), extra: codes.filter((code) => (types.get(code) ?? 0) & EXTRA).map((code) => [code, 1]) }
    const data = await createDataLoader(nodeSource(rows, scriptStore()), null).load([list, list])
    const [deck] = data.decks

    expect(deck!.missing).toEqual([])
    expect(deck!.noRules).toEqual([])
    expect(deck!.main.length).toBeGreaterThanOrEqual(40)

    const faults: string[] = []
    let turns = 0
    const report: { seed: number; end: string; questions: number }[] = []
    const activated = new Set<number>()

    for (let seed = 1; seed <= DUELS; seed += 1) {
      const events: AutoEvent[] = []
      const emit = (event: AutoEvent) => {
        events.push(event)
        if (event.t === 'fault') faults.push(`${seed} ${event.kind}: ${event.message.slice(0, 200)}`)
        if (event.t !== 'events' || event.seat !== 0) return
        for (const item of event.events) {
          if (item.type === 'new_turn') turns += 1
          if (item.type === 'chaining') activated.add(item.code)
        }
      }
      const host = createAutoHost({ core: { wasmBinary: wasmBinary() }, ...preloadedReaders(data, emit), emit })

      await host.handle({ t: 'create', seed, flags: String(OcgDuelMode.MODE_MR5), players: [{ lp: 8000, hand: 5, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }], decks: data.decks.map((mapped) => ({ main: mapped.main, extra: mapped.extra, hand: [] })) })
      const result = await runDuel(host, events, [randomLegalPolicy(seed * 2 + 1), randomLegalPolicy(seed * 2 + 2)], 3000)

      report.push({ seed, end: result.end, questions: result.questions })
      expect(result.end, `duelo ${seed}`).not.toBe('stuck')
    }
    writeFileSync(path.join(CORE_DATA_DIR, 'recientes-report.json'), JSON.stringify({ turns, faults, report, activated: codes.filter((code) => activated.has(code)), never: codes.filter((code) => !activated.has(code)) }, null, 1))
    expect(faults).toEqual([])
    expect(turns).toBeGreaterThanOrEqual(20)
  }, 600_000)
})
