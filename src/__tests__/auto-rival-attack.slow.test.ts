import { describe, expect, it } from 'vitest'
import { mirrorApply, openMirror } from '../app/mat-public'
import { matReducer, type MatState } from '../app/practice-mat'
import { rivalAttacks } from '../app/auto/adapter'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import { randomLegalPolicy, type Policy } from '../app/auto/policies'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, slowDecklists, wasmBinary } from './support/core-data'

/**
 * El ataque del rival con el núcleo real (lento: `npm run test:auto`; se salta sin datos): el rival de relleno (40 Normales) juega al azar (`control: 'both'`), así invoca y
 * ataca. Cada ataque suyo (`rivalAttacks`) sale de un monstruo de su espejo y va a uno de tu mesa, los dos en el campo donde la mesa lo cuenta (`at`), y la tanda que lo trae
 * todavía tiene al atacante: la espada tiene de dónde salir.
 */
const DECKS = Number(process.env.RA_DECKS ?? 4)
const TURNS = 9
const CAP = 600

const settled = (session: AutoSession, seen: (snapshot: AutoSnapshot) => void) =>
  new Promise<AutoSnapshot>((resolve) => {
    const check = () => {
      const s = session.getSnapshot()

      seen(s)
      if ((s.status === 'ready' && s.ask !== null && !s.replaying) || s.status === 'ended' || s.status === 'error') {
        off()
        resolve(s)
      }
    }
    const off = session.subscribe(check)

    check()
  })
const onField = (state: MatState, id: string) => [...state.mz, ...state.emz].some((card) => card?.id === id)

describe.skipIf(!hasCoreData)('el ataque del rival con el núcleo real (npm run test:auto)', () => {
  const rows = hasCoreData ? cardRows() : []
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const loader = createDataLoader(nodeSource(rows, store), null)
  const lists = slowDecklists()
  const ok = new Set(hasCoreData ? metaDecks(cards, store).map((deck) => deck.id) : [])
  const ids = Object.keys(lists).filter((id) => ok.has(id))
  const pool = Array.from({ length: Math.min(DECKS, ids.length) }, (_, i) => ids[Math.floor((i * ids.length) / Math.min(DECKS, ids.length))]!)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const tally = { attacks: 0, direct: 0, attackerInBatch: 0 }

  it.each(pool)('deck %s: cada ataque del rival tiene atacante y objetivo donde la mesa lo cuenta', async (id) => {
    const seed = Number(id) >>> 0
    const session = createAutoSession({ loader, deck: lists[id]!, seed, control: 'both', transport: localTransport({ wasmBinary: wasm }) })
    const random = randomLegalPolicy(seed)
    // Al azar, salvo que invoca lo que puede, va a la Battle Phase y ataca con lo que puede: así hay ataques.
    const bot: Policy = (ask) => {
      if (ask.type === 'select_idlecmd' && ask.summons.length > 0) return { type: ask.type, action: 0, index: 0 }
      if (ask.type === 'select_idlecmd' && ask.to_bp) return { type: ask.type, action: 6, index: null }
      if (ask.type === 'select_battlecmd' && ask.attacks.length > 0) return { type: ask.type, action: 1, index: 0 }
      return random(ask)
    }
    // La tanda que trae cada ataque: ¿el espejo de ese momento todavía tiene al atacante?
    const firstSeen = new Map<number, boolean>()
    const seen = (s: AutoSnapshot) => {
      if (s.replaying) return
      for (const attack of rivalAttacks(s.order, s.theirsActs)) if (!firstSeen.has(attack.index)) firstSeen.set(attack.index, onField(s.theirs, attack.attackerId))
    }
    let snapshot = await settled(session, seen)

    for (let n = 0; n < CAP && snapshot.status === 'ready' && snapshot.overlay.turn < TURNS; n += 1) {
      session.answer(bot(snapshot.ask!.ask))
      snapshot = await settled(session, seen)
    }
    expect(snapshot.status).not.toBe('error')

    const attacks = rivalAttacks(snapshot.order, snapshot.theirsActs)

    for (const attack of attacks) {
      const mirror = snapshot.theirsActs.slice(0, attack.index).reduce(mirrorApply, openMirror(snapshot.initial.theirs)).state
      const mine = snapshot.mineActions.slice(0, attack.at).reduce(matReducer, snapshot.initial.mine)

      expect(onField(mirror, attack.attackerId), `atacante ${attack.attackerId}`).toBe(true)
      if (attack.targetId === undefined) tally.direct += 1
      else expect(onField(mine, attack.targetId), `objetivo ${attack.targetId}`).toBe(true)
      expect(firstSeen.get(attack.index), `tanda del ataque ${attack.index}`).toBe(true)
      tally.attackerInBatch += 1
    }
    tally.attacks += attacks.length
    session.destroy()
  }, 600_000)

  it('el rival atacó (a tus monstruos y directo)', () => {
    console.log(JSON.stringify(tally))
    expect(tally.attacks).toBeGreaterThan(tally.direct)
    expect(tally.direct).toBeGreaterThan(0)
  })
})
