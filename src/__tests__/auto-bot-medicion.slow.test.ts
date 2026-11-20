import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { botViewOf, type Bot } from '../app/auto/bot/bot'
import { BOT_DECKS } from '../app/auto/bot/decks'
import { localTransport, type AutoHost } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import type { CoreAsk } from '../app/auto/protocol'
import { autoRival, DOMINUS_LOCKS } from '../app/handtraps'
import { mulberry32 } from '../app/practice-mat'
import { cardRows, CORE_DATA_DIR, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * La vara de los tres bots (lento, a mano: `npm run test:auto -- src/__tests__/auto-bot-medicion.slow.test.ts`; `BOT_HANDS` manos por bot, 30 si no se dice). Cada bot empieza, con
 * semilla, hasta que alguien gana o el turno `LAST_TURN`, en dos mesas:
 * - **Contra el pasivo** de 40 Normales (no Invoca, no ataca, no activa nada: toda vida que pierde el bot se la sacó él). Por bot: el **campo** al terminar su turno 1 (monstruos,
 *   ATK total, cartas colocadas en la Zona de Mágicas y Trampas); **sin usar**, lo que el núcleo le ofrecía (activar, Invocar de modo Normal o Especial) en la `select_idlecmd` con
 *   la que terminó cada turno suyo, por carta; **vidas propias**, por la carta de su última jugada antes de perderlas (el costo se paga al activarla); en qué turno **gana**; si
 *   **se mata** y los turnos **secos** (uno suyo desde el 3 sin hacerte daño); los **ms** del núcleo y del bot por turno suyo.
 * - **Contra otro bot** (`RIVAL_OF`: el otro mazo juega el asiento de la persona con su ejecutor y la vista de ese asiento, sin historial): **gana** o **pierde**, los **candados**
 *   que se puso él mismo (una Dominus activada desde la mano: le prohíbe Atributos el resto del duelo) y los **regalos** (monstruos de su Extra Deck en tu campo: Opposition).
 * No falla por los números (es la tabla de antes y después de un cambio en los bots): sólo por una respuesta que el núcleo rechaza. Escribe `bot-medicion.json` en CORE_DATA_DIR.
 */

const HANDS = Number(process.env.BOT_HANDS ?? 30)
const LAST_TURN = 9
const IDLE_OFFERS = ['summons', 'special_summons', 'activates'] as const
const IDLE_LISTS = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
/** El rival de cada bot en la mesa contra otro bot (nunca el mismo mazo: los regalos se cuentan por código). */
const RIVAL_OF: Record<string, string> = { 'sky-striker': 'elfnote', angelechy: 'elfnote', elfnote: 'sky-striker' }

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

describe.skipIf(!hasCoreData)('la vara de los bots con el núcleo real (npm run test:auto)', () => {
  const rows = hasCoreData ? cardRows() : []
  const store = hasCoreData ? scriptStore() : { read: () => null, has: () => false }
  const source = nodeSource(rows, store)
  const loader = createDataLoader(source, null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const { cards, names } = hasCoreData ? loadCards() : { cards: new Map(), names: new Map<number, string>() }
  const report: Record<string, unknown> = {}
  const name = (code: number) => names.get(code) ?? String(code)
  const facts = (code: number) => cards.get(code)
  const aliasOf = (code: number) => cards.get(code)?.alias ?? 0
  const attributeOf = (code: number) => cards.get(code)?.attribute ?? 0
  const deckOf = (id: string) => BOT_DECKS.find((deck) => deck.id === id)!

  afterAll(() => {
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'bot-medicion.json'), JSON.stringify(report, null, 1))
  })

  /** Un duelo del bot `deckId` (empieza él) contra el pasivo o, con `rivalId`, contra ese bot. */
  async function duel(deckId: string, seed: number, rivalId?: string) {
    const { filler } = await source.manifest()
    const inner = deckOf(deckId).bot(facts, aliasOf, attributeOf)
    const rival = rivalId ? deckOf(rivalId) : null
    const rivalBot = rival?.bot(facts, aliasOf, attributeOf)
    const rivalContext = { random: mulberry32(seed + 1000), level: 'normal' as const }
    // Los regalos, por código: sin los que el rival también trae en su Extra Deck.
    const ownExtra = new Set(deckOf(deckId).list.extra.map(([code]) => code).filter((code) => !rival?.list.extra.some(([other]) => other === code)))
    const faults: string[] = []
    const unused: string[] = []
    const selfLp: Record<string, number> = {}
    const botMs: Record<number, number> = {}
    const gifted = new Set<string>()
    let lastPlay = 0
    let lastLp = 8000
    let lastIdle: { turn: number; ask: Extract<CoreAsk, { type: 'select_idlecmd' }>; action: number } | null = null
    const closeIdle = () => {
      if (lastIdle && lastIdle.action === 7) for (const key of IDLE_OFFERS) for (const card of lastIdle.ask[key]) unused.push(`${key === 'activates' ? 'activa' : key === 'summons' ? 'Normal' : 'Especial'} ${name(card.code)}`)
      lastIdle = null
    }
    const lost = (lp: number) => {
      if (lp < lastLp) selfLp[name(lastPlay)] = (selfLp[name(lastPlay)] ?? 0) + lastLp - lp
      lastLp = lp
    }
    let host: AutoHost | null = null
    const bot: Bot = (ask, view, context) => {
      const started = performance.now()
      const decision = inner(ask, view, context)

      if (view.turnPlayer === 'me') botMs[view.turn] = (botMs[view.turn] ?? 0) + performance.now() - started
      lost(view.lp.me)
      if (lastIdle && lastIdle.turn !== view.turn) closeIdle()
      if (ask.type === 'select_idlecmd' && decision.answer.type === 'select_idlecmd') {
        const { action, index } = decision.answer
        const list = IDLE_LISTS[action]

        lastIdle = { turn: view.turn, ask, action }
        if (list && index !== null && (action <= 1 || action === 5)) lastPlay = ask[list][index]!.code
      }
      if (ask.type === 'select_chain' && decision.answer.type === 'select_chain' && decision.answer.index !== null) lastPlay = ask.selects[decision.answer.index]!.code
      return decision
    }
    const session = createAutoSession({
      loader,
      deck: rival ? { main: rival.list.main, extra: rival.list.extra } : { main: filler.map((code) => [code, 1] as const), extra: [] },
      seed,
      botSeed: seed,
      seat: 1,
      transport: localTransport({ wasmBinary: wasm }, (made) => void (host = made)),
      rival: autoRival({ enabled: false, picks: [], hand: 3, botDeck: deckId }),
      bot,
      onEvent: (event) => {
        if (event.t === 'fault') faults.push(`${event.kind}: ${event.message.slice(0, 160)}`)
      },
    })
    const passive = passivePolicy()
    const coreMs: Record<number, number> = {}
    let counted = 0
    const tally = (turn: number) => {
      const timings = (host as AutoHost | null)?.timings ?? []

      for (; counted < timings.length; counted += 1) coreMs[turn] = (coreMs[turn] ?? 0) + timings[counted]!
    }
    let snapshot = await settled(session)
    let afterOne: { monsters: number; atk: number; set: number } | null = null
    const yourLp: Record<number, number> = {}

    tally(snapshot.overlay.turn)
    for (let n = 0; n < 3000 && snapshot.status === 'ready' && snapshot.overlay.turn <= LAST_TURN; n += 1) {
      const turn = snapshot.overlay.turn
      const adapter = session.adapter!

      yourLp[turn] ??= snapshot.overlay.lp[1]
      for (const slot of [...snapshot.mine.mz, ...snapshot.mine.emz]) if (slot && ownExtra.has(adapter.codeOf({ side: 'mine', id: slot.id }))) gifted.add(slot.id)
      if (!afterOne && turn === 2) {
        const theirs = snapshot.theirs
        const monsters = [...theirs.mz, ...theirs.emz].filter((slot) => slot !== null)

        afterOne = {
          monsters: monsters.length,
          atk: monsters.reduce((sum, slot) => sum + (slot!.pos === 'set' ? 0 : (snapshot.overlay.stats.theirs[slot!.id]?.attack ?? facts(adapter.codeOf({ side: 'theirs', id: slot!.id }))?.attack ?? 0)), 0),
          set: theirs.st.filter((slot) => slot !== null && slot.pos === 'set').length,
        }
      }
      const ask = snapshot.ask!.ask

      session.answer(rivalBot ? rivalBot(ask, botViewOf(adapter, 1, []), rivalContext).answer : passive(ask))
      snapshot = await settled(session)
      tally(snapshot.overlay.turn)
    }
    closeIdle()
    if (!rival) lost(snapshot.overlay.lp[0])
    session.destroy()
    const end = snapshot.overlay.end
    // Seco: un turno suyo desde el 3 en que tus vidas no bajaron (las del arranque de tu turno siguiente contra las de tu turno anterior).
    const dry = Object.keys(yourLp)
      .map(Number)
      .filter((turn) => turn % 2 === 1 && turn >= 3 && yourLp[turn + 1] !== undefined && yourLp[turn + 1]! >= (yourLp[turn - 1] ?? 8000)).length
    const locks = snapshot.overlay.limits[0].map((description) => Number(BigInt(description) >> 20n)).filter((code) => DOMINUS_LOCKS[code] !== undefined)

    return {
      seed,
      afterOne,
      unused,
      selfLp,
      won: end && end.winner === 0 ? snapshot.overlay.turn : null,
      lost: snapshot.overlay.lp[0] === 0 || (end !== null && end.winner === 1),
      dry,
      locks: locks.map(name),
      gifted: gifted.size,
      faults: faults.filter((fault) => !fault.startsWith('script')),
      coreMs: Object.entries(coreMs).filter(([turn]) => Number(turn) % 2 === 1).map(([, ms]) => ms),
      botMs: Object.values(botMs),
    }
  }

  const avg = (list: number[]) => Math.round((list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length)) * 100) / 100
  const at = (list: number[], p: number) => {
    const sorted = [...list].sort((x, y) => x - y)

    return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0)
  }
  const count = (list: string[]) => Object.fromEntries(Object.entries(list.reduce<Record<string, number>>((out, item) => ({ ...out, [item]: (out[item] ?? 0) + 1 }), {})).sort((x, y) => y[1] - x[1]))

  it.each(BOT_DECKS.map((deck) => [deck.id] as const))(`%s: ${HANDS} manos contra el pasivo y ${HANDS} contra otro bot`, { timeout: 60 * 60 * 1000 }, async (deckId) => {
    const hands: Awaited<ReturnType<typeof duel>>[] = []
    const versus: Awaited<ReturnType<typeof duel>>[] = []

    for (let seed = 1; seed <= HANDS; seed += 1) hands.push(await duel(deckId, seed))
    for (let seed = 1; seed <= HANDS; seed += 1) versus.push(await duel(deckId, seed, RIVAL_OF[deckId]))
    const lpBy = hands.reduce<Record<string, number>>((out, item) => {
      for (const [card, lp] of Object.entries(item.selfLp)) out[card] = (out[card] ?? 0) + lp
      return out
    }, {})
    const won = hands.flatMap((item) => (item.won === null ? [] : [item.won]))
    const row = {
      hands: hands.length,
      field: { monsters: avg(hands.map((item) => item.afterOne?.monsters ?? 0)), atk: avg(hands.map((item) => item.afterOne?.atk ?? 0)), set: avg(hands.map((item) => item.afterOne?.set ?? 0)) },
      unusedPerHand: avg(hands.map((item) => item.unused.length)),
      unused: count(hands.flatMap((item) => item.unused)),
      selfLpPerHand: avg(hands.map((item) => Object.values(item.selfLp).reduce((sum, lp) => sum + lp, 0))),
      selfLp: lpBy,
      wins: won.length,
      winTurn: avg(won),
      died: hands.filter((item) => item.lost).map((item) => item.seed),
      dryTurns: hands.reduce((sum, item) => sum + item.dry, 0),
      coreMsPerTurn: { median: at(hands.flatMap((item) => item.coreMs), 0.5), p95: at(hands.flatMap((item) => item.coreMs), 0.95) },
      botMsPerTurn: { median: at(hands.flatMap((item) => item.botMs), 0.5), p95: at(hands.flatMap((item) => item.botMs), 0.95) },
      versus: {
        rival: RIVAL_OF[deckId],
        wins: versus.filter((item) => item.won !== null).length,
        losses: versus.filter((item) => item.lost).length,
        locks: count(versus.flatMap((item) => item.locks)),
        gifted: versus.reduce((sum, item) => sum + item.gifted, 0),
      },
    }

    report[deckId] = { ...row, perHand: hands.map(({ seed, afterOne, unused, selfLp, won, lost, dry }) => ({ seed, afterOne, unused, selfLp, won, lost, dry })), versus: { ...row.versus, perHand: versus.map(({ seed, won, lost, locks, gifted }) => ({ seed, won, lost, locks, gifted })) } }
    console.log(deckId, JSON.stringify({ ...row, unused: undefined }))
    expect([...hands, ...versus].flatMap((item) => item.faults)).toEqual([])
  })
})
