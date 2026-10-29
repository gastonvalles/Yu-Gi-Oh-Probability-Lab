import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { replayFromAuto } from '../app/auto/auto-replay'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { randomLegalPolicy } from '../app/auto/policies'
import { duelReplayAt, walkReplay } from '../app/duel-replay'
import { buildReplayLink, decodeReplayPayload, encodeReplayPayload, MAX_LINK_LENGTH, parseReplayText, replayEnvelope } from '../app/duel-replay-share'
import { mapMatIds, openPublic } from '../app/mat-public'
import { cardRows, CORE_DATA_DIR, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * El replay de duelos automáticos reales (lento: `npm run test:auto`; se salta sin datos): los dos asientos juegan al azar (legal) con decks del Meta hasta el final. El replay
 * termina en las mismas dos mesas que el duelo (la mía, con los ids opacos), con las vidas del final; en la vista pública ninguna carta sin mostrar lleva su id real; va y vuelve
 * por enlace y por archivo; y se mide cuánto pesa (el informe sale por consola: JSON, comprimido y si entra en un enlace).
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

describe.skipIf(!hasCoreData)('el replay de duelos automáticos reales (npm run test:auto)', () => {
  const rows = hasCoreData ? cardRows() : []
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const loader = createDataLoader(nodeSource(rows, store), null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const lists = JSON.parse(readFileSync(path.join(process.cwd(), 'src/data/meta-decklists.json'), 'utf8')) as Record<string, DeckList>
  const ok = hasCoreData ? metaDecks(cards, store).map((deck) => deck.id).filter((key) => lists[key]) : []

  it('termina en las mesas del duelo, no filtra lo oculto y va y vuelve por enlace y archivo; mide el tamaño', async () => {
    const report: string[] = []

    for (const [n, seed] of [0x1234, 0xbeef, 0x51ed, 0x7777, 0x2468, 0x9999].entries()) {
      const deck = lists[ok[n % ok.length]!]!
      const session = createAutoSession({ loader, deck, seed, seat: n % 2 === 0 ? 0 : 1, control: 'both', transport: localTransport({ wasmBinary: wasm }) })
      const bots = [randomLegalPolicy(seed), randomLegalPolicy(seed + 1)]
      let snap = await settled(session)

      for (let i = 0; i < 6000 && snap.status === 'ready' && snap.overlay.turn < 120; i += 1) {
        session.answer(bots[snap.ask!.seat]!(snap.ask!.ask))
        snap = await settled(session)
      }
      const seat = n % 2 === 0 ? 0 : 1
      const replay = replayFromAuto(snap, { seat, mode: 'solo-auto', view: 'public', players: ['Ana', 'Beto'] })
      const t0 = performance.now()
      const shots = walkReplay(replay)
      const walkMs = performance.now() - t0
      const t1 = performance.now()
      const end = duelReplayAt(replay, replay.steps.length)
      const fullMs = performance.now() - t1
      const t2 = performance.now()
      duelReplayAt(replay, replay.steps.length - 1, shots)
      const jumpMs = performance.now() - t2

      // Las mismas dos mesas que el duelo: la mía, con los ids opacos del replay.
      const { opaque } = openPublic(snap.initial.mine).sender
      const toOpaque = (id: string) => (id.startsWith('f.') && opaque[id.slice(2)] ? `f.${opaque[id.slice(2)]}` : (opaque[id] ?? id))
      expect(snap.order.length).toBe(replay.steps.length)
      expect(end.states[0]).toEqual(mapMatIds(snap.mine, toOpaque))
      expect(end.states[1]).toEqual(mapMatIds(snap.theirs, toOpaque))
      expect(end.lp).toEqual([snap.overlay.lp[seat], snap.overlay.lp[1 - seat]])
      // El turno: el mismo que cuenta el núcleo (de quién es).
      if (snap.overlay.turnPlayer !== null) expect(end.turn).toBe(snap.overlay.turnPlayer === seat ? 0 : 1)

      // Vista pública: ningún id real fuera de lo revelado.
      const json = JSON.stringify(replayEnvelope(replay))
      const shown = new Set([...Object.values(replay.sides[0].reveal), ...Object.values(replay.sides[1].reveal), ...replay.steps.flatMap((step) => Object.values(step[2] ?? {}))])
      const reals = new Set(json.match(/card-\d+-\d+/g) ?? [])
      expect([...reals].filter((id) => !shown.has(id))).toEqual([])

      // Ida y vuelta.
      const payload = await encodeReplayPayload(replay)
      expect(await decodeReplayPayload(payload)).toEqual({ ok: true, replay })
      expect(parseReplayText(json)).toEqual({ ok: true, replay })

      const link = buildReplayLink('https://ygoultralab.app', '/', payload).length
      report.push(`seed ${seed}: ${replay.steps.length} jugadas, ${snap.overlay.turn} turnos, ${snap.status}; JSON ${(json.length / 1024).toFixed(1)} KB, comprimido ${(payload.length / 1024).toFixed(1)} KB, enlace ${link} (${link <= MAX_LINK_LENGTH ? 'entra' : 'no entra'}); recorrer ${walkMs.toFixed(1)} ms, saltar al final ${fullMs.toFixed(1)} ms, con fotos ${jumpMs.toFixed(2)} ms`)
      session.destroy()
    }
    writeFileSync(path.join(CORE_DATA_DIR, 'replay-report.txt'), report.join('\n'))
  }, 600_000)
})
