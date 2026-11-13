import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { Bot } from '../app/auto/bot/bot'
import { angelechyBot } from '../app/auto/bot/executors/angelechy'
import { localTransport } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import { LOCATION as L, type CoreAnswer, type CoreAsk } from '../app/auto/protocol'
import { tallyFor } from '../app/auto/tally'
import { ANGELECHY as A, ANGELECHY_DECK } from '../app/bot-deck-lists'
import { cardRows, CORE_DATA_DIR, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * Lo que cuentan las cartas (`tally.ts`) con el núcleo real (lento: `npm run test:auto`): el bot de Angelechy empieza con la línea que pone a Shatranga como Continua (Bastion) y vos, segundo,
 * activás desde la mano todo efecto de monstruo que el núcleo te ofrezca en una cadena (Ash Blossom, Effect Veiler). El número de su Shatranga, visto desde tu mesa, es lo que activaste desde que
 * llegó, en ese turno; sus Invocaciones de cada turno, las que tu mesa vio entrar.
 */

const ASH = 14558127
const VEILER = 97268402
const HANDTRAPS = new Set([ASH, VEILER])

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

describe.skipIf(!hasCoreData)('lo que cuentan las cartas, con el núcleo real (npm run test:auto)', () => {
  it('la Shatranga del bot cuenta tus efectos de monstruo del turno y sus Invocaciones son las que entraron', { timeout: 300_000 }, async () => {
    const rows = cardRows()
    const source = nodeSource(rows, scriptStore())
    const { cards } = loadCards()
    const { filler } = await source.manifest()
    const bot: Bot = angelechyBot(
      (code) => cards.get(code),
      (code) => cards.get(code)?.alias ?? 0,
      (code) => cards.get(code)?.attribute ?? 0,
    )
    const mine = [ASH, ASH, ASH, VEILER, VEILER, VEILER, ...filler.slice(0, 34)]
    /** Tus efectos de monstruo activados (los `chaining` de tu asiento con una carta de monstruo fuera de las Mágicas y Trampas), por turno. */
    const mineByTurn: Record<number, number> = {}
    let turn = 0
    const session = createAutoSession({
      loader: createDataLoader(source, null),
      deck: { main: mine.map((code) => [code, 1] as const), extra: [] },
      hand: [ASH, ASH, VEILER, VEILER, VEILER],
      handSize: 5,
      seed: 99,
      botSeed: 99,
      seat: 1,
      transport: localTransport({ wasmBinary: wasmBinary() }),
      rival: { main: ANGELECHY_DECK.main, extra: ANGELECHY_DECK.extra, hand: () => [A.score, A.disturbance, A.ash, A.purge, A.fuwalos] },
      bot,
      onEvent: (event) => {
        if (event.t !== 'events' || event.seat !== 1) return
        for (const item of event.events) {
          if (item.type === 'new_turn') turn += 1
          if (item.type === 'chaining' && item.controller === 1 && HANDTRAPS.has(item.code) && (item.location & L.SZONE) === 0) mineByTurn[turn] = (mineByTurn[turn] ?? 0) + 1
        }
      },
    })
    const passive = passivePolicy()
    /** Desde tu segundo turno, una cadena con una handtrap tuya se activa. */
    const me = (ask: CoreAsk, snapshot: AutoSnapshot): CoreAnswer => {
      if (ask.type === 'select_chain' && snapshot.overlay.turn >= 2) {
        const index = ask.selects.findIndex((card) => HANDTRAPS.has(card.code) && card.location === L.HAND)

        if (index >= 0) return { type: 'select_chain', index }
      }
      return passive(ask)
    }
    const seen: { turn: number; shatranga: number; mine: number }[] = []
    let snapshot = await settled(session)

    for (let n = 0; n < 600 && snapshot.status === 'ready' && snapshot.overlay.turn <= 3; n += 1) {
      const id = snapshot.theirs.st.find((placed) => placed && placed.pos !== 'set' && session.adapter?.codeOf({ side: 'theirs', id: placed.id }) === A.shatranga)?.id
      const view = id ? tallyFor(snapshot.overlay.tally, 'theirs', id, A.shatranga, 'st') : null

      if (view) seen.push({ turn: snapshot.overlay.turn, shatranga: view.count, mine: mineByTurn[snapshot.overlay.turn] ?? 0 })
      session.answer(me(snapshot.ask!.ask, snapshot))
      snapshot = await settled(session)
    }
    session.destroy()

    writeFileSync(path.join(CORE_DATA_DIR, 'tally-report.json'), JSON.stringify({ seen, mineByTurn, summons: snapshot.overlay.tally.turn.summons, turn: snapshot.overlay.turn }, null, 1))
    expect(snapshot.fault).toBeNull()
    // Shatranga llegó en su turno 1 y desde ahí, en cada punto, su número es lo que activaste en ese turno (llegó antes de tus turnos).
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.filter((item) => item.turn >= 2).every((item) => item.shatranga === item.mine)).toBe(true)
    expect(Math.max(...seen.map((item) => item.shatranga))).toBeGreaterThan(0)
  })
})
