import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { botViewOf, type Bot } from '../app/auto/bot/bot'
import { BOT_DECKS } from '../app/auto/bot/decks'
import { localTransport, type AutoHost } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import type { CoreAsk } from '../app/auto/protocol'
import { copyIds } from '../app/auto/adapter'
import { ANGELECHY as A } from '../app/bot-deck-lists'
import { autoRival, DOMINUS_LOCKS } from '../app/handtraps'
import { createMatState, matReducer, mulberry32 } from '../app/practice-mat'
import { turnBot } from '../app/auto/bot/turn'
import { cardRows, CORE_DATA_DIR, hasCoreData, loadCards, nodeSource, scriptStore, slowDecklists, wasmBinary } from './support/core-data'

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
 * El cuarto, `generico`, es el rival de «El rival juega su turno» (`turnBot`, sin ejecutor) con una lista fija de `slow-decklists.json`: Phantom Knights (`GENERIC_LIST`), con 13
 * monstruos de Nivel 3 o 4 que Invoca de modo Normal y un Extra Deck de Xyz y Enlaces que salen de ellos (el de cualquier mazo que no tiene ejecutor).
 */
const GENERIC_LIST = '735410'

const HANDS = Number(process.env.BOT_HANDS ?? 30)
/** `BOT_LOG=<mazo>:<semilla>` (o `<mazo>:<semilla>:vs`, contra otro bot): escribe cada pregunta del bot en ese duelo, con lo que ofrece el núcleo y lo que contestó. */
const LOG = process.env.BOT_LOG ?? ''
/** `BOT_DECK=<mazo>`: mide sólo ése. */
const ONLY = process.env.BOT_DECK ?? ''
/** `BOT_FROM=<semilla>`: la primera semilla (1 si no se dice), para mirar otra tanda de manos. */
const FROM = Number(process.env.BOT_FROM ?? 1)
const LAST_TURN = 9
const IDLE_OFFERS = ['summons', 'special_summons', 'activates'] as const
const IDLE_LISTS = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
/** El rival de cada bot en la mesa contra otro bot (nunca el mismo mazo: los regalos se cuentan por código). */
const RIVAL_OF: Record<string, string> = { 'sky-striker': 'elfnote', angelechy: 'elfnote', elfnote: 'sky-striker', generico: 'elfnote' }

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
  const listed = hasCoreData ? slowDecklists()[GENERIC_LIST] : undefined
  const generic = { main: [...(listed?.main ?? [])], extra: [...(listed?.extra ?? [])] }
  const DECKS = [
    ...BOT_DECKS.map(({ id, list, bot }) => ({ id, list: { main: list.main, extra: list.extra }, bot })),
    { id: 'generico', list: generic, bot: (f: typeof facts, a: typeof aliasOf, at: typeof attributeOf) => turnBot(generic.main.map(([code]) => code), [], a, at, f) },
  ]
  const deckOf = (id: string) => DECKS.find((deck) => deck.id === id)!
  /** El rival de la sesión: el bot con su lista, o el genérico con la suya y su turno. */
  const rivalOf = (id: string) => (id === 'generico' ? { main: [...generic.main], extra: [...generic.extra], hand: () => [], ownTurn: true } : autoRival({ enabled: false, picks: [], hand: 3, botDeck: id }))
  /** Lo que se ofrecía en una pregunta, por nombre (para el registro). */
  const offeredOf = (ask: CoreAsk) =>
    ask.type === 'select_card' || ask.type === 'select_chain'
      ? ask.selects.map((card) => `${name(card.code)}@${card.location}`)
      : ask.type === 'select_unselect_card'
        ? ask.select_cards.map((card) => `${name(card.code)}@${card.location}`)
        : ask.type === 'select_idlecmd'
          ? IDLE_LISTS.flatMap((key) => ask[key].map((card) => `${key}:${name(card.code)}`))
          : ask.type === 'select_effectyn'
            ? [name(ask.code)]
            : []

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
    const logging = LOG === `${deckId}:${seed}${rivalId ? ':vs' : ''}`
    const log: string[] = []
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
      if (logging && !(ask.type === 'select_chain' && ask.selects.length === 0)) log.push(`t${view.turn} lp${view.lp.me}/${view.lp.them} ${ask.type} [${offeredOf(ask).join(', ')}] -> ${JSON.stringify(decision.answer)} ${decision.rule ?? ''}`)
      return decision
    }
    const session = createAutoSession({
      loader,
      deck: rival ? { main: rival.list.main, extra: rival.list.extra } : { main: filler.map((code) => [code, 1] as const), extra: [] },
      seed,
      botSeed: seed,
      seat: 1,
      transport: localTransport({ wasmBinary: wasm }, (made) => void (host = made)),
      rival: rivalOf(deckId),
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
    if (logging) writeFileSync(path.join(CORE_DATA_DIR, `bot-medicion-${LOG.replaceAll(':', '-')}.txt`), log.join('\n'))
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

  it.each(DECKS.filter((deck) => !ONLY || deck.id === ONLY).map((deck) => [deck.id] as const))(`%s: ${HANDS} manos contra el pasivo y ${HANDS} contra otro bot`, { timeout: 60 * 60 * 1000 }, async (deckId) => {
    const hands: Awaited<ReturnType<typeof duel>>[] = []
    const versus: Awaited<ReturnType<typeof duel>>[] = []

    for (let seed = FROM; seed < FROM + HANDS; seed += 1) hands.push(await duel(deckId, seed))
    for (let seed = FROM; seed < FROM + HANDS; seed += 1) versus.push(await duel(deckId, seed, RIVAL_OF[deckId]))
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

  /**
   * Los castigos del rival (el duelo del video de Gastón): vos empezás con Black-Winged Assault Dragon en el campo (700 de daño cada vez que el rival activa un efecto de monstruo)
   * y, con `destrier`, activás Angelechy Problem para poner a Angelechy Destrier como Continua (500 cada vez que el rival activa una carta o efecto, al resolverse); el bot (con una
   * mano de 5 de su lista, barajada con la semilla) juega su turno 2. Cuenta el daño de efecto que recibe en su turno (fuera del paso de daño: no la batalla), lo que deja en el campo
   * y si te sacó las cartas que castigan.
   */
  async function punished(deckId: string, seed: number, destrier: boolean) {
    const deck = deckOf(deckId)
    const inner = deck.bot(facts, aliasOf, attributeOf)
    const { filler } = await source.manifest()
    const main = [A.terraforming, A.problem, ...filler.slice(0, 38)]
    const extra = [A.assaultDragon, A.enlisted, A.destrier, A.castellan, A.shatranga]
    const ids = copyIds([...main, ...extra])
    const codeOfId = (id: string) => Number(id.split('-')[1] ?? 0)
    const idOf = (code: number) => ids.find((id) => codeOfId(id) === code)!
    let state = createMatState(ids.slice(0, main.length), ids.slice(main.length), 1)

    state = matReducer(state, { type: 'place', id: idOf(A.problem), zone: 'field', index: 0, pos: 'atk' })
    state = matReducer(state, { type: 'place', id: idOf(A.assaultDragon), zone: 'mz', index: 2, pos: 'atk' })
    state = { ...matReducer(state, { type: 'phase', phase: 'main1' }), turn: 1 }
    const random = mulberry32(seed)
    const pool = deck.list.main.flatMap(([code, copies]) => Array.from({ length: copies }, () => code))

    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))

      ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
    }
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
      deck: { main: main.map((code) => [code, 1] as const), extra: extra.map((code) => [code, 1] as const) },
      seed,
      botSeed: seed,
      seat: 0,
      transport: localTransport({ wasmBinary: wasm }),
      rival: autoRival({ enabled: false, picks: [], hand: 3, botDeck: deckId }),
      resume: { mine: state, codeOf: (_side, id) => codeOfId(id), lp: [8000, 8000], rivalHand: pool.slice(0, 5) },
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
    let problem = destrier

    for (let n = 0; n < 1500 && snapshot.status === 'ready' && snapshot.overlay.turn < 3; n += 1) {
      const ask = snapshot.ask!.ask
      const pick = ask.type === 'select_card' ? ask.selects.findIndex((card) => card.code === A.destrier) : -1
      const activate = problem && ask.type === 'select_idlecmd' ? ask.activates.findIndex((card) => card.code === A.problem) : -1

      if (activate >= 0) problem = false
      session.answer(activate >= 0 ? { type: 'select_idlecmd', action: 5, index: activate } : pick >= 0 ? { type: 'select_card', indices: [pick] } : passive(ask))
      snapshot = await settled(session)
    }
    const adapter = session.adapter!
    const mineCodes = [...snapshot.mine.mz, ...snapshot.mine.emz, ...snapshot.mine.st].flatMap((slot) => (slot && slot.pos !== 'set' ? [adapter.codeOf({ side: 'mine', id: slot.id })] : []))
    const theirs = [...snapshot.theirs.mz, ...snapshot.theirs.emz].filter((slot) => slot !== null)
    const result = {
      seed,
      damage,
      lp: snapshot.overlay.lp[1],
      monsters: theirs.length,
      dragon: mineCodes.includes(A.assaultDragon),
      destrier: mineCodes.includes(A.destrier),
      priced: reasons.filter((key) => key.includes('price')).length,
      faults: snapshot.faults.filter((fault) => fault.kind === 'retry' || fault.kind === 'unhandled').map((fault) => fault.message),
    }

    session.destroy()
    return result
  }

  it.each([['Black-Winged Assault Dragon', false], ['Assault Dragon y Destrier', true]] as const)(`castigos, Elfnote contra %s: ${HANDS} manos`, { timeout: 60 * 60 * 1000 }, async (label, destrier) => {
    const runs: Awaited<ReturnType<typeof punished>>[] = []

    for (let seed = FROM; seed < FROM + HANDS; seed += 1) runs.push(await punished('elfnote', seed, destrier))
    const row = {
      hands: runs.length,
      damagePerHand: avg(runs.map((run) => run.damage)),
      maxDamage: Math.max(...runs.map((run) => run.damage)),
      dead: runs.filter((run) => run.lp <= 0).length,
      monsters: avg(runs.map((run) => run.monsters)),
      removedDragon: runs.filter((run) => !run.dragon).length,
      removedDestrier: destrier ? runs.filter((run) => !run.destrier).length : null,
      priced: runs.reduce((sum, run) => sum + run.priced, 0),
    }

    report[`castigos ${label}`] = { ...row, perHand: runs.map(({ faults: _, ...run }) => run) }
    console.log(label, JSON.stringify(row))
    expect(runs.flatMap((run) => run.faults)).toEqual([])
  })
})
