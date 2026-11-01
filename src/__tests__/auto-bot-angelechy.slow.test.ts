import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { Bot, BotDecision } from '../app/auto/bot/bot'
import { BOT_DECKS } from '../app/auto/bot/decks'
import { ANGELECHY as A, ANGELECHY_DECK } from '../app/bot-deck-lists'
import { angelechyBot } from '../app/auto/bot/executors/angelechy'
import { localTransport, type AutoHost } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import type { CoreAsk } from '../app/auto/protocol'
import { autoRival } from '../app/handtraps'
import { cardRows, CORE_DATA_DIR, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * El ejecutor de Angelechy con el núcleo real (lento: `npm run test:auto`).
 * - **Goldfish**: el bot (primero, con el mazo de `bot-deck-lists.ts` por `botDeck`, como lo arma la sesión) contra un rival pasivo de 40 Normales, en `GOLDFISH` manos con semilla.
 *   Falla si cae por debajo de los umbrales (`THRESHOLDS`, con su porqué), si el núcleo le rechaza una respuesta o si un turno suyo le cuesta al núcleo más de `CORE_TURN_MS`. Mide
 *   también cuánto tarda cada decisión y cuánto tarda el núcleo en cada turno del bot (sus Sincronías sin materiales).
 * - **Escenarios**, con una mano fija: la línea de arranque (Strategy Score busca a Problem, Problem Invoca y pone otra Continua) y Opening to e4 colocada, en tu turno.
 * Escribe `bot-angelechy-report.json` en CORE_DATA_DIR (nunca en el repo).
 */

const GOLDFISH = Number(process.env.ANGELECHY_GOLDFISH ?? 50)
/** `ANGELECHY_LOG=<semilla>`: escribe cada pregunta del bot de esa mano, con lo que ofrece el núcleo y lo que contestó. */
const LOG_SEED = Number(process.env.ANGELECHY_LOG ?? 0)
/**
 * Los umbrales del goldfish (con 50 manos al escribirlo se midió 0,9 · 0,92 · 1 · 0,9), un poco por debajo de lo medido, para que una regla rota se note y el azar de 50 manos no.
 * - `monster`: termina su turno 1 con una Angelechy en su Zona de Monstruos (Problem o Endgame Problem la Invocan).
 * - `continuous`: termina su turno 1 con al menos 2 Angelechy como Continuas (Problem, Opposition, Verdict y Bastion las ponen).
 * - `ready`: termina su turno 1 con algo para tu turno: Opening to e4 o Verdict colocadas, o una Dominus o una handtrap en la mano.
 * - `damage`: con tu campo vacío, te hace daño en su turno 3.
 */
const THRESHOLDS = { monster: 0.82, continuous: 0.85, ready: 0.95, damage: 0.82 }
/** El tope del núcleo por turno del bot (se midió un máximo de 0,09 s; se juega en un celular: un turno de varios segundos se nota). */
const CORE_TURN_MS = 1500
const MONSTERS = new Set<number>([A.shatranga, A.enlisted, A.castellan, A.seneschal, A.bastion, A.destrier])
const FOR_YOUR_TURN = new Set<number>([A.ash, A.ogre, A.droll, A.fuwalos, A.purge, A.impulse, A.spark])

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

const IDLE = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const

describe.skipIf(!hasCoreData)('el ejecutor de Angelechy con el núcleo real (npm run test:auto)', () => {
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

  afterAll(() => {
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'bot-angelechy-report.json'), JSON.stringify(report, null, 1))
  })

  it('la lista fija existe en el núcleo con sus scripts (las de preestreno, por su código final), tiene 40 + 15 y BOT_DECKS la ofrece', () => {
    const missing = [...ANGELECHY_DECK.main, ...ANGELECHY_DECK.extra].filter(([code]) => !cards.has(code) || !store.has(`c${code}.lua`)).map(([code]) => code)
    const count = (list: readonly (readonly [number, number])[]) => list.reduce((sum, [, copies]) => sum + copies, 0)

    expect(missing).toEqual([])
    expect([count(ANGELECHY_DECK.main), count(ANGELECHY_DECK.extra)]).toEqual([40, 15])
    expect(BOT_DECKS.find((deck) => deck.id === 'angelechy')).toMatchObject({ name: 'Angelechy', ready: true })
  })

  const offeredOf = (ask: CoreAsk) =>
    ask.type === 'select_card' || ask.type === 'select_chain'
      ? ask.selects.map((card) => `${name(card.code)}@${card.location}`)
      : ask.type === 'select_unselect_card'
        ? ask.select_cards.map((card) => `${name(card.code)}@${card.location}`)
        : ask.type === 'select_idlecmd'
          ? IDLE.flatMap((key) => ask[key].map((card) => `${key}:${name(card.code)}`))
          : ask.type === 'select_effectyn'
            ? [name(ask.code)]
            : ask.type === 'select_option'
              ? ask.options
              : []

  /** Una mano del goldfish: el bot empieza (vos vas segundo, pasivo, con 40 Normales); hasta tu turno 4. */
  async function goldfish(seed: number) {
    const { filler } = await source.manifest()
    const faults: string[] = []
    const inner = angelechyBot(facts, aliasOf, attributeOf)
    const times: number[] = []
    const log: string[] = []
    let opening: string[] | null = null
    let host: AutoHost | null = null
    const bot: Bot = (ask, view, context) => {
      const started = performance.now()
      const decision = inner(ask, view, context)

      times.push(performance.now() - started)
      opening ??= view.me.hand.map((card) => name(card.code))
      if (seed === LOG_SEED && !(ask.type === 'select_chain' && ask.selects.length === 0)) log.push(`t${view.turn} ${ask.type} [${offeredOf(ask).join(', ')}] -> ${JSON.stringify(decision.answer)} ${decision.rule ?? ''}`)
      return decision
    }
    const session = createAutoSession({
      loader,
      deck: { main: filler.map((code) => [code, 1] as const), extra: [] },
      seed,
      botSeed: seed,
      seat: 1,
      transport: localTransport({ wasmBinary: wasm }, (made) => void (host = made)),
      rival: autoRival({ enabled: false, picks: [], hand: 3, botDeck: 'angelechy' }),
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
    let afterOne: { monster: number; continuous: number; ready: number; field: string[] } | null = null

    tally(snapshot.overlay.turn)
    for (let n = 0; n < 800 && snapshot.status === 'ready' && !(snapshot.overlay.turn >= 4 && snapshot.ask?.ask.type === 'select_idlecmd'); n += 1) {
      if (!afterOne && snapshot.overlay.turn === 2 && snapshot.ask?.ask.type === 'select_idlecmd') {
        const theirs = snapshot.theirs
        const code = (id: string) => session.adapter!.codeOf({ side: 'theirs', id })
        const monsters = [...theirs.mz, ...theirs.emz].filter((slot) => slot !== null).map((slot) => code(slot!.id))
        const st = theirs.st.filter((slot) => slot !== null)
        const hand = snapshot.rivalHand

        afterOne = {
          monster: monsters.filter((card) => MONSTERS.has(card)).length,
          continuous: st.filter((slot) => slot!.pos !== 'set' && MONSTERS.has(code(slot!.id))).length,
          ready: st.filter((slot) => slot!.pos === 'set').length + hand.filter((card) => FOR_YOUR_TURN.has(card)).length,
          field: [...monsters, ...st.map((slot) => (slot!.pos === 'set' ? -1 : code(slot!.id)))].map((card) => (card === -1 ? 'set' : name(card))),
        }
      }
      session.answer(passive(snapshot.ask!.ask))
      snapshot = await settled(session)
      tally(snapshot.overlay.turn)
    }
    const lp = snapshot.overlay.lp[1]
    const rules = snapshot.answers.filter((item) => item.seat === 0).map((item) => item.reason?.key ?? '')
    session.destroy()
    if (log.length > 0) writeFileSync(path.join(CORE_DATA_DIR, `bot-angelechy-log-${seed}.txt`), log.join('\n'))

    return { seed, status: snapshot.status, turn: snapshot.overlay.turn, afterOne, lp, faults, times, opening, coreMs, rules }
  }

  it(`goldfish: ${GOLDFISH} manos contra el pasivo, sobre los umbrales y sin respuestas rechazadas`, { timeout: 60 * 60 * 1000 }, async () => {
    const hands: Awaited<ReturnType<typeof goldfish>>[] = []

    for (let seed = 1; seed <= GOLDFISH; seed += 1) hands.push(await goldfish(seed))
    const share = (test: (hand: (typeof hands)[number]) => boolean) => Math.round((hands.filter(test).length / hands.length) * 100) / 100
    const measured = {
      monster: share((hand) => (hand.afterOne?.monster ?? 0) > 0),
      continuous: share((hand) => (hand.afterOne?.continuous ?? 0) >= 2),
      ready: share((hand) => (hand.afterOne?.ready ?? 0) > 0),
      damage: share((hand) => hand.lp < 8000),
    }
    const times = hands.flatMap((hand) => hand.times).sort((x, y) => x - y)
    const botCore = hands.flatMap((hand) => Object.entries(hand.coreMs).filter(([turn]) => Number(turn) % 2 === 1).map(([, ms]) => ms)).sort((x, y) => x - y)
    const at = (list: number[], p: number) => Math.round((list[Math.min(list.length - 1, Math.floor(p * list.length))] ?? 0) * 1000) / 1000

    report.goldfish = {
      hands: hands.length,
      measured,
      thresholds: THRESHOLDS,
      msPerDecision: { decisions: times.length, median: at(times, 0.5), p95: at(times, 0.95), max: at(times, 1) },
      coreMsPerBotTurn: { turns: botCore.length, median: at(botCore, 0.5), p95: at(botCore, 0.95), max: at(botCore, 1) },
      fields: hands.map(({ seed, afterOne, lp, opening }) => ({ seed, opening, afterOne, lp })),
    }
    console.log(JSON.stringify({ ...(report.goldfish as object), fields: undefined }))

    expect(hands.flatMap((hand) => hand.faults.filter((fault) => !fault.startsWith('script')))).toEqual([])
    expect(hands.filter((hand) => !(hand.status === 'ready' && hand.turn >= 4) && !(hand.status === 'ended' && hand.lp === 0)).map((hand) => hand.seed)).toEqual([])
    expect(measured.monster).toBeGreaterThanOrEqual(THRESHOLDS.monster)
    expect(measured.continuous).toBeGreaterThanOrEqual(THRESHOLDS.continuous)
    expect(measured.ready).toBeGreaterThanOrEqual(THRESHOLDS.ready)
    expect(measured.damage).toBeGreaterThanOrEqual(THRESHOLDS.damage)
    expect(at(botCore, 1)).toBeLessThan(CORE_TURN_MS)
  })

  /** Un duelo con la mano del bot fija (empieza él); vos invocás `summon` (si no es `0`) en tu turno 2 y terminás. Cada pregunta al bot con su respuesta, en orden. */
  async function scenario(botHand: number[], summon: number, turns: number) {
    const { filler } = await source.manifest()
    const inner = angelechyBot(facts, aliasOf, attributeOf)
    const log: { turn: number; ask: CoreAsk; decision: BotDecision }[] = []
    const bot: Bot = (ask, view, context) => {
      const decision = inner(ask, view, context)

      if (!(ask.type === 'select_chain' && ask.selects.length === 0)) log.push({ turn: view.turn, ask, decision })
      return decision
    }
    const mine = summon ? [summon, ...filler.slice(0, 39)] : filler
    const session = createAutoSession({
      loader,
      deck: { main: mine.map((code) => [code, 1] as const), extra: [] },
      ...(summon ? { hand: [summon] } : {}),
      handSize: 5,
      seed: 99,
      botSeed: 99,
      seat: 1,
      transport: localTransport({ wasmBinary: wasm }),
      rival: { main: ANGELECHY_DECK.main, extra: ANGELECHY_DECK.extra, hand: () => botHand },
      bot,
    })
    const passive = passivePolicy()
    let summoned = false
    let snapshot = await settled(session)

    for (let n = 0; n < 500 && snapshot.status === 'ready' && snapshot.overlay.turn <= turns; n += 1) {
      const ask = snapshot.ask!.ask
      const index: number = ask.type === 'select_idlecmd' && summon && !summoned ? ask.summons.findIndex((card) => card.code === summon) : -1

      summoned ||= index >= 0
      session.answer(index >= 0 ? { type: 'select_idlecmd', action: 0, index } : passive(ask))
      snapshot = await settled(session)
    }
    session.destroy()
    const rules = log.map((item) => item.decision.rule ?? '')
    const chosen = (rule: string) => {
      const item = log.find((entry) => entry.decision.rule === rule)

      return item && item.ask.type === 'select_card' && item.decision.answer.type === 'select_card' ? (item.decision.answer.indices ?? []).map((i) => name((item.ask as Extract<CoreAsk, { type: 'select_card' }>).selects[i]!.code)) : null
    }

    return { log, rules, chosen, fault: snapshot.fault }
  }

  it('la línea de arranque: Strategy Score busca a Problem, Problem descarta, Invoca a Enlisted y pone a Bastion, que pone a Shatranga', { timeout: 180_000 }, async () => {
    const run = await scenario([A.score, A.disturbance, A.ash, A.purge, A.fuwalos], 0, 1)

    report.opening = { rules: run.rules }
    expect(run.fault).toBeNull()
    expect(run.chosen(`angelechy.search.${A.score}`)).toEqual([name(A.problem)])
    expect(run.rules.indexOf('score')).toBeLessThan(run.rules.indexOf('field-problem'))
    expect(run.rules.indexOf('field-problem')).toBeLessThan(run.rules.indexOf('problem'))
    expect(run.chosen(`angelechy.place.${A.problem}`)).toEqual([name(A.bastion)])
    expect(run.rules).toContain('angelechy.place.bastion')
  })

  it('en tu turno, Opening to e4 colocada se activa: pone Endgame Problem e Invoca en la Zona de Monstruos Extra', { timeout: 180_000 }, async () => {
    // Vorse Raider (Nivel 4, Normal).
    const run = await scenario([A.problem, A.e4, A.ash, A.purge, A.fuwalos], 14898066, 2)
    const e4 = run.log.find((item) => item.decision.rule === 'angelechy.quick.e4')

    report.e4 = { rules: run.log.map((item) => `t${item.turn} ${item.decision.rule ?? ''}`) }
    expect(run.fault).toBeNull()
    expect(e4?.turn).toBe(2)
    expect(run.chosen('angelechy.field.e4')).toEqual([name(A.endgame)])
    expect(run.rules).toContain(`angelechy.summon.${A.e4}`)
  })
})
