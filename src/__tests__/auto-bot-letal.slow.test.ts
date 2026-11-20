import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { Bot } from '../app/auto/bot/bot'
import { BOT_DECKS } from '../app/auto/bot/decks'
import { CAP } from '../app/auto/bot/punish'
import { localTransport } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import { copyIds } from '../app/auto/adapter'
import { ANGELECHY as A } from '../app/bot-deck-lists'
import { autoRival } from '../app/handtraps'
import { createMatState, matReducer, mulberry32 } from '../app/practice-mat'
import { cardRows, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * La excepción de letal con el núcleo real (lento: `npm run test:auto -- src/__tests__/auto-bot-letal.slow.test.ts`). Vos tenés Black-Winged Assault Dragon (3200/2800: 700 de daño
 * cada vez que el bot activa un efecto de monstruo) y 8000 vidas; el bot de Elfnote juega su turno 2 con una mano de 5 de su lista y monstruos ya en su campo, que no son de su mazo:
 * - **Con letal:** tu Dragón en defensa y Blue-Eyes White Dragon (3000), Blue-Eyes Ultimate Dragon (4500) y Five-Headed Dragon (5000). Sólo con Blue-Eyes rompiendo tu Dragón entran
 *   9500 directos (con Five-Headed, 7500): lo toma ese turno, sin quedar en 0, y lo dice.
 * - **Sin letal:** tu Dragón en ataque y Blue-Eyes con Red-Eyes Black Dragon (2400): paga lo de siempre, dentro del tope, y no dice letal.
 */

const BLUE_EYES = 89631139
const ULTIMATE = 23995346
const FIVE_HEADED = 99267150
const RED_EYES = 74677422
const SEEDS = [1, 2, 3]

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

describe.skipIf(!hasCoreData)('el bot va por el letal con un castigo tuyo enfrente (núcleo real)', () => {
  const rows = hasCoreData ? cardRows() : []
  const source = nodeSource(rows, hasCoreData ? scriptStore() : { read: () => null, has: () => false })
  const loader = createDataLoader(source, null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const facts = (code: number) => cards.get(code)
  const deck = BOT_DECKS.find((item) => item.id === 'elfnote')!
  const codeOfId = (id: string) => Number(id.split('-')[1] ?? 0)

  async function turnTwo(seed: number, dragon: 'atk' | 'def', board: readonly number[]) {
    const { filler } = await source.manifest()
    const main = filler.slice(0, 40)
    const ids = copyIds([...main, A.assaultDragon])
    let mine = createMatState(ids.slice(0, main.length), ids.slice(main.length), 0)

    mine = matReducer(mine, { type: 'place', id: ids.at(-1)!, zone: 'mz', index: 2, pos: dragon })
    mine = { ...matReducer(mine, { type: 'phase', phase: 'main1' }), turn: 1 }
    // Su mano: 5 de su lista barajada con la semilla; `board`, ya en su campo.
    const random = mulberry32(seed)
    const pool = deck.list.main.flatMap(([code, copies]) => Array.from({ length: copies }, () => code))

    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))

      ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
    }
    const theirIds = copyIds([...pool, ...board, ...deck.list.extra.flatMap(([code, copies]) => Array.from({ length: copies }, () => code))])
    let theirs = createMatState(theirIds.slice(0, pool.length + board.length), theirIds.slice(pool.length + board.length), 5)

    board.forEach((_, i) => (theirs = matReducer(theirs, { type: 'place', id: theirIds[pool.length + i]!, zone: 'mz', index: i, pos: 'atk' })))
    const inner = deck.bot(facts, (code) => cards.get(code)?.alias ?? 0, (code) => cards.get(code)?.attribute ?? 0)
    const reasons: string[] = []
    const bot: Bot = (ask, view, context) => {
      const decision = inner(ask, view, context)

      if (decision.reason && view.turn === 2) reasons.push(decision.reason.key)
      return decision
    }
    let botTurn = false
    let battle = false
    let damage = 0
    const session = createAutoSession({
      loader,
      // Lo de su campo no está en ningún mazo: va acá para que el anfitrión cargue sus datos.
      deck: { main: [...main, ...board].map((code) => [code, 1] as const), extra: [[A.assaultDragon, 1]] },
      seed,
      botSeed: seed,
      seat: 0,
      transport: localTransport({ wasmBinary: wasm }),
      rival: autoRival({ enabled: false, picks: [], hand: 3, botDeck: 'elfnote' }),
      // Las dos en 8000: con otras vidas, el asiento del bot las ve cruzadas al rearmar (`auto-session.ts`, el `lp` de cada adaptador).
      resume: { mine, theirs, codeOf: (_side, id) => codeOfId(id), lp: [8000, 8000] },
      bot,
      onEvent: (event) => {
        if (event.t !== 'events' || event.seat !== 0) return
        for (const wire of event.events as { type: string; player?: number; amount?: number }[]) {
          if (wire.type === 'new_turn') botTurn = wire.player === 1
          else if (wire.type === 'damage_step_start') battle = true
          else if (wire.type === 'damage_step_end') battle = false
          else if (wire.type === 'damage' && wire.player === 1 && botTurn && !battle) damage += wire.amount ?? 0
        }
      },
    })
    const passive = passivePolicy()
    let snapshot = await settled(session)

    for (let n = 0; n < 1500 && snapshot.status === 'ready' && snapshot.overlay.turn < 3; n += 1) {
      session.answer(passive(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    const result = {
      status: snapshot.status,
      won: snapshot.overlay.end?.winner === 1 && snapshot.overlay.turn === 2,
      lp: snapshot.overlay.lp[1],
      damage,
      reasons,
      faults: [...(snapshot.fault ? [snapshot.fault] : []), ...snapshot.faults.filter((fault) => fault.kind === 'retry' || fault.kind === 'unhandled')],
    }

    session.destroy()
    return result
  }

  it.each(SEEDS)('semilla %i: con letal en la mesa lo toma ese turno, sin quedar en 0, y dice por qué', { timeout: 10 * 60 * 1000 }, async (seed) => {
    const run = await turnTwo(seed, 'def', [BLUE_EYES, ULTIMATE, FIVE_HEADED])

    expect(run.faults).toEqual([])
    expect(run).toMatchObject({ status: 'ended', won: true })
    expect(run.lp).toBeGreaterThan(0)
    expect(run.reasons).toContain('auto.bot.reason.battle.lethal')
    // Paga a lo sumo la primera activación (la que le enseña el precio) y va a la batalla: no sigue su línea hasta el tope.
    expect(run.damage).toBeLessThanOrEqual(700)
  })

  it.each(SEEDS)('semilla %i: sin letal sigue respetando el tope (y no dice letal)', { timeout: 10 * 60 * 1000 }, async (seed) => {
    const run = await turnTwo(seed, 'atk', [BLUE_EYES, RED_EYES])

    expect(run.faults).toEqual([])
    expect(run.won).toBe(false)
    expect(run.reasons.filter((key) => key.includes('lethal'))).toEqual([])
    // El tope del turno (`CAP` de sus vidas al empezarlo); lo que puede sacarte cartas lo pasa a lo sumo por el precio de una activación.
    expect(run.damage).toBeLessThanOrEqual(8000 * CAP + 700)
  })
})
