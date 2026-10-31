import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { Bot, BotDecision } from '../app/auto/bot/bot'
import { BOT_DECKS } from '../app/auto/bot/decks'
import { ELFNOTE as E, ELFNOTE_DECK } from '../app/auto/bot/decks/elfnote'
import { elfnoteBot } from '../app/auto/bot/executors/elfnote'
import { localTransport, type AutoHost } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import type { CoreAnswer, CoreAsk } from '../app/auto/protocol'
import { autoRival } from '../app/handtraps'
import { cardRows, CORE_DATA_DIR, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * El ejecutor de Elfnote con el núcleo real (lento: `npm run test:auto`).
 * - **Goldfish**: el bot (primero, con el mazo de `decks/elfnote.ts` por `botDeck`, como lo arma la sesión) contra un rival pasivo de 40 Normales, en `GOLDFISH` manos con semilla.
 *   Falla si cae por debajo de los umbrales (`THRESHOLDS`, con su porqué), si el núcleo le rechaza una respuesta o si un turno suyo le cuesta al núcleo más de `CORE_TURN_MS`. Mide
 *   también cuántas preguntas contesta por turno, cuánto tarda cada decisión y cuánto tarda el núcleo en cada turno del bot (lo que encarece a un mazo de Sincronía).
 * - **Escenarios**: las decisiones clave con una mano fija, con la oferta literal del núcleo y la respuesta del bot.
 * Escribe `bot-elfnote-report.json` en CORE_DATA_DIR (nunca en el repo).
 */

const GOLDFISH = Number(process.env.ELFNOTE_GOLDFISH ?? 50)
/** `ELFNOTE_LOG=<semilla>`: escribe cada pregunta del bot de esa mano, con lo que ofrece el núcleo y lo que contestó (para mirar una mano antes de culpar a la política). */
const LOG_SEED = Number(process.env.ELFNOTE_LOG ?? 0)
/**
 * Los umbrales del goldfish (con 50 manos al escribirlo se midió 0,98 · 0,78 · 1), un poco por debajo de lo medido, para que una regla rota se note y el azar de 50 manos no.
 * - `synchro`: termina su turno 1 con una Sincronía o una Xyz en el campo. Casi todas las manos llegan: Lucina, Regina, Medius, Pendulum Treasure, Vidolium, las Ars Magna y
 *   Theorealize terminan en Power Patron; sin nada de eso (sólo handtraps y Vidolium), no.
 * - `interrupt`: termina su turno 1 con algo que te frena en el tuyo: Lars, Number 90, Zalen, Diabell o Archethys; Rhapsodia con una Sincronía; Lucina o Fortuna fuera del centro
 *   con un monstruo ahí; o Power Patron con un Nivel 6 en el centro. Los campos de Strelitzia, Regina y Psychic End Punisher (o Shooting Riser) no cuentan: unas 11 de cada 50.
 * - `damage`: con tu campo vacío, te hace daño en su turno 3.
 */
const THRESHOLDS = { synchro: 0.9, interrupt: 0.68, damage: 0.9 }
/** El tope del núcleo por turno del bot en escritorio (se midió un máximo de 0,18 s; se juega en un celular: un turno de varios segundos se nota). */
const CORE_TURN_MS = 1500
/** Lo que interrumpe tu turno desde el campo: Lars, Number 90, Zalen y Diabell (responden a lo que activás), Archethys (destruye). */
const INTERRUPTERS = new Set<number>([E.lars, E.n90, E.zalen, E.archethys, E.diabell])
const SYNCHRO_TYPE = 0x2000

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
const ACTION = { summon: 0, activate: 5 } as const
type Step = { do: keyof typeof ACTION; code: number } | { do: 'attack'; code: number } | { do: 'end' }

/** Vos: tus jugadas en orden en cada `select_idlecmd` (lo que no se puede espera), tus efectos opcionales sí, atacar con esa carta; lo demás, como el pasivo. */
function player(steps: readonly Step[], own: ReadonlySet<number>) {
  const passive = passivePolicy()
  let next = 0

  return (ask: CoreAsk): CoreAnswer => {
    const step = steps[next]

    if (ask.type === 'select_idlecmd') {
      if (step?.do === 'attack') return { type: ask.type, action: ask.to_bp ? 6 : 7, index: null }
      if (step?.do === 'end') {
        next += 1
        return { type: ask.type, action: 7, index: null }
      }
      const index = step ? ask[IDLE[ACTION[step.do]]].findIndex((card) => card.code === step.code) : -1

      if (!step || index < 0) return { type: ask.type, action: ask.to_ep ? 7 : 6, index: null }
      next += 1
      return { type: ask.type, action: ACTION[step.do], index }
    }
    if (ask.type === 'select_battlecmd') {
      const index = step?.do === 'attack' ? ask.attacks.findIndex((card) => card.code === step.code) : -1

      if (index >= 0) {
        next += 1
        return { type: ask.type, action: 1, index }
      }
      return { type: ask.type, action: ask.to_ep ? 3 : 2, index: null }
    }
    if (ask.type === 'select_effectyn') return { type: ask.type, yes: own.has(ask.code) }
    if (ask.type === 'select_chain' && ask.selects.some((card) => own.has(card.code))) return { type: ask.type, index: ask.selects.findIndex((card) => own.has(card.code)) }
    if (ask.type === 'select_card' && ask.min <= 1) {
      const index = ask.selects.findIndex((card) => own.has(card.code) && card.controller === ask.player)

      if (index >= 0) return { type: ask.type, indices: [index] }
    }
    return passive(ask)
  }
}

describe.skipIf(!hasCoreData)('el ejecutor de Elfnote con el núcleo real (npm run test:auto)', () => {
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
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'bot-elfnote-report.json'), JSON.stringify(report, null, 1))
  })

  it('la lista fija existe en el núcleo con sus scripts, tiene 42 + 15 (como se jugó) y BOT_DECKS la ofrece', () => {
    const missing = [...ELFNOTE_DECK.main, ...ELFNOTE_DECK.extra].filter(([code]) => !cards.has(code) || !store.has(`c${code}.lua`)).map(([code]) => code)
    const count = (list: readonly (readonly [number, number])[]) => list.reduce((sum, [, copies]) => sum + copies, 0)

    expect(missing).toEqual([])
    expect([count(ELFNOTE_DECK.main), count(ELFNOTE_DECK.extra)]).toEqual([42, 15])
    expect(BOT_DECKS.find((deck) => deck.id === 'elfnote')).toMatchObject({ name: 'Elfnote', ready: true })
  })

  /** Lo que se ofrecía en una pregunta, por nombre (para el registro y los escenarios). */
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
    const inner = elfnoteBot(facts, aliasOf, attributeOf)
    const times: number[] = []
    const perTurn: Record<number, number> = {}
    const log: string[] = []
    let opening: string[] | null = null
    let host: AutoHost | null = null
    const bot: Bot = (ask, view, context) => {
      const started = performance.now()
      const decision = inner(ask, view, context)

      times.push(performance.now() - started)
      opening ??= view.me.hand.map((card) => name(card.code))
      if (view.turnPlayer === 'me') perTurn[view.turn] = (perTurn[view.turn] ?? 0) + 1
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
      rival: autoRival({ enabled: false, picks: [], hand: 3, botDeck: 'elfnote' }),
      bot,
      onEvent: (event) => {
        if (event.t === 'fault') faults.push(`${event.kind}: ${event.message.slice(0, 160)}`)
      },
    })
    const passive = passivePolicy()
    /** Lo que tardó el núcleo en cada turno (las respuestas de los dos asientos entre una pregunta tuya y la siguiente, al turno en que quedó). */
    const coreMs: Record<number, number> = {}
    let counted = 0
    const tally = (turn: number) => {
      const timings = (host as AutoHost | null)?.timings ?? []

      for (; counted < timings.length; counted += 1) coreMs[turn] = (coreMs[turn] ?? 0) + timings[counted]!
    }
    let snapshot = await settled(session)
    let afterOne: { extra: number; interrupts: number; field: string[] } | null = null

    tally(snapshot.overlay.turn)
    for (let n = 0; n < 800 && snapshot.status === 'ready' && !(snapshot.overlay.turn >= 4 && snapshot.ask?.ask.type === 'select_idlecmd'); n += 1) {
      if (!afterOne && snapshot.overlay.turn === 2 && snapshot.ask?.ask.type === 'select_idlecmd') {
        const theirs = snapshot.theirs
        const code = (id: string) => session.adapter!.codeOf({ side: 'theirs', id })
        const field = [...theirs.mz, ...theirs.emz, ...theirs.st].filter((slot) => slot !== null && slot.pos !== 'set').map((slot) => code(slot!.id))
        const monsters = [...theirs.mz, ...theirs.emz].filter((slot) => slot !== null).map((slot) => code(slot!.id))
        const center = theirs.mz[2] ? code(theirs.mz[2].id) : 0
        const synchro = monsters.some((card) => ((cards.get(card)?.type ?? 0) & SYNCHRO_TYPE) !== 0)
        // Además: Rhapsodia con una Sincronía (niega), Lucina o Fortuna fuera del centro con un monstruo ahí (te devuelven una carta), Power Patron con un Nivel 6 en el centro (June
        // Pride en tu Main Phase).
        const lucinas = theirs.mz.filter((slot, i) => slot !== null && i !== 2 && [E.lucina, E.fortuna].includes(code(slot.id) as never)).length

        afterOne = {
          extra: monsters.filter((card) => ((cards.get(card)?.type ?? 0) & (SYNCHRO_TYPE | 0x800000)) !== 0).length,
          interrupts:
            monsters.filter((card) => INTERRUPTERS.has(card)).length +
            (field.includes(E.rhapsodia) && synchro ? 1 : 0) +
            (center !== 0 ? lucinas : 0) +
            (monsters.includes(E.patron) && [E.lucina, E.regina, E.fortuna].includes(center as never) ? 1 : 0),
          field: field.map(name),
        }
      }
      session.answer(passive(snapshot.ask!.ask))
      snapshot = await settled(session)
      tally(snapshot.overlay.turn)
    }
    const lp = snapshot.overlay.lp[1]
    const reasons = snapshot.answers.filter((item) => item.seat === 0 && item.reason).map((item) => item.reason!.key.replace('auto.bot.reason.', ''))
    const rules = snapshot.answers.filter((item) => item.seat === 0).length
    session.destroy()
    if (log.length > 0) writeFileSync(path.join(CORE_DATA_DIR, `bot-elfnote-log-${seed}.txt`), log.join('\n'))

    return { seed, status: snapshot.status, turn: snapshot.overlay.turn, afterOne, lp, faults, reasons, times, perTurn, opening, coreMs, rules }
  }

  it(`goldfish: ${GOLDFISH} manos contra el pasivo, sobre los umbrales y sin respuestas rechazadas`, { timeout: 60 * 60 * 1000 }, async () => {
    const hands: Awaited<ReturnType<typeof goldfish>>[] = []

    for (let seed = 1; seed <= GOLDFISH; seed += 1) hands.push(await goldfish(seed))
    const share = (test: (hand: (typeof hands)[number]) => boolean) => Math.round((hands.filter(test).length / hands.length) * 100) / 100
    const measured = { synchro: share((hand) => (hand.afterOne?.extra ?? 0) > 0), interrupt: share((hand) => (hand.afterOne?.interrupts ?? 0) > 0), damage: share((hand) => hand.lp < 8000) }
    const reasons: Record<string, number> = {}
    const times = hands.flatMap((hand) => hand.times).sort((x, y) => x - y)
    const turns = hands.flatMap((hand) => Object.values(hand.perTurn)).sort((x, y) => x - y)
    // Los turnos del bot son los impares (empieza él).
    const botCore = hands.flatMap((hand) => Object.entries(hand.coreMs).filter(([turn]) => Number(turn) % 2 === 1).map(([, ms]) => ms)).sort((x, y) => x - y)
    const at = (list: number[], p: number) => Math.round((list[Math.min(list.length - 1, Math.floor(p * list.length))] ?? 0) * 1000) / 1000

    hands.forEach((hand) => hand.reasons.forEach((key) => (reasons[key] = (reasons[key] ?? 0) + 1)))
    report.goldfish = {
      hands: hands.length,
      measured,
      thresholds: THRESHOLDS,
      msPerDecision: { decisions: times.length, median: at(times, 0.5), p99: at(times, 0.99), max: at(times, 1) },
      asksPerOwnTurn: { median: at(turns, 0.5), p99: at(turns, 0.99), max: at(turns, 1) },
      coreMsPerBotTurn: { turns: botCore.length, median: at(botCore, 0.5), p95: at(botCore, 0.95), max: at(botCore, 1) },
      reasons,
      fields: hands.map(({ seed, afterOne, lp, opening }) => ({ seed, opening, afterOne, lp })),
    }
    console.log(JSON.stringify({ ...(report.goldfish as object), fields: undefined }))

    expect(hands.flatMap((hand) => hand.faults.filter((fault) => !fault.startsWith('script')))).toEqual([])
    // Hasta tu turno 4, o el bot ya ganó (en su turno 3, con tu campo vacío, puede).
    expect(hands.filter((hand) => !(hand.status === 'ready' && hand.turn >= 4) && !(hand.status === 'ended' && hand.lp === 0)).map((hand) => hand.seed)).toEqual([])
    expect(measured.synchro).toBeGreaterThanOrEqual(THRESHOLDS.synchro)
    expect(measured.interrupt).toBeGreaterThanOrEqual(THRESHOLDS.interrupt)
    expect(measured.damage).toBeGreaterThanOrEqual(THRESHOLDS.damage)
    expect(at(botCore, 1)).toBeLessThan(CORE_TURN_MS)
  })

  /** Un duelo con la mano del bot fija (arriba de su deck): `seat` es el tuyo. Cada pregunta al bot con su respuesta, en orden. */
  async function scenario(options: { botHand: number[]; seat: 0 | 1; myHand: number[]; steps: Step[]; turns: number; myDeck?: number[] }) {
    const { filler } = await source.manifest()
    const inner = elfnoteBot(facts, aliasOf, attributeOf)
    const log: { turn: number; ask: CoreAsk; decision: BotDecision }[] = []
    const bot: Bot = (ask, view, context) => {
      const decision = inner(ask, view, context)

      if (!(ask.type === 'select_chain' && ask.selects.length === 0)) log.push({ turn: view.turn, ask, decision })
      return decision
    }
    const own = [...options.myHand, ...(options.myDeck ?? [])]
    const mine = [...own, ...filler.slice(0, 40 - own.length)]
    const session = createAutoSession({
      loader,
      deck: { main: mine.map((code) => [code, 1] as const), extra: [] },
      hand: options.myHand,
      handSize: 5,
      seed: 99,
      botSeed: 99,
      seat: options.seat,
      transport: localTransport({ wasmBinary: wasm }),
      rival: { main: ELFNOTE_DECK.main, extra: ELFNOTE_DECK.extra, hand: () => options.botHand },
      bot,
    })
    const me = player(options.steps, new Set(own))
    let snapshot = await settled(session)

    for (let n = 0; n < 500 && snapshot.status === 'ready' && snapshot.overlay.turn <= options.turns; n += 1) {
      session.answer(me(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    session.destroy()
    const rules = log.map((item) => item.decision.rule ?? '')

    return { log, rules, status: snapshot.status, fault: snapshot.fault, lp: snapshot.overlay.lp }
  }

  /** La pregunta del núcleo en que el bot usó esa regla, con lo que ofrecía (nombres) y lo que contestó. */
  const offer = (run: Awaited<ReturnType<typeof scenario>>, rule: string) => {
    const item = run.log.find((entry) => entry.decision.rule === rule)

    if (!item) return null
    const { ask, decision } = item
    const offered = ask.type === 'select_card' || ask.type === 'select_chain' ? ask.selects.map((card) => name(card.code)) : ask.type === 'select_idlecmd' ? ask.activates.map((card) => name(card.code)) : []
    const chosen =
      ask.type === 'select_card' && decision.answer.type === 'select_card'
        ? (decision.answer.indices ?? []).map((i) => name(ask.selects[i]!.code))
        : ask.type === 'select_chain' && decision.answer.type === 'select_chain' && decision.answer.index !== null
          ? [name(ask.selects[decision.answer.index]!.code)]
          : []

    return { ask: ask.type, offered, chosen, reason: decision.reason?.key }
  }

  it('la línea de Lucina: se Invoca al centro, busca a Power Patron, Power Patron le sube 3 Niveles e Invoca a June Pride en el centro', { timeout: 180_000 }, async () => {
    const run = await scenario({ botHand: [E.lucina, E.ash, E.ogre, E.veiler, E.fuwalos], seat: 1, myHand: [], steps: [], turns: 1 })
    const search = offer(run, 'elfnote.search.lucina')
    const synchro = offer(run, 'elfnote.synchro.patron')

    report.lucina = { search, synchro, rules: run.rules }
    expect(run.fault).toBeNull()
    expect(search).toMatchObject({ ask: 'select_card', chosen: [name(E.patron)], reason: 'auto.bot.reason.play.search' })
    expect(synchro).toMatchObject({ ask: 'select_card', chosen: [name(E.junePride)], reason: 'auto.bot.reason.play.synchroNext' })
    expect(run.rules.indexOf('lucina')).toBeLessThan(run.rules.indexOf('normal-patron'))
    expect(run.rules.indexOf('normal-patron')).toBeLessThan(run.rules.indexOf('patron'))
    expect(run.rules).toContain('elfnote.place.center')
  })

  it('en tu turno, Lucina fuera del centro te devuelve a la mano el monstruo recién Invocado', { timeout: 180_000 }, async () => {
    // Vorse Raider (Nivel 4, Normal).
    const VORSE = 14898066
    const run = await scenario({ botHand: [E.lucina, E.lucina, E.ash, E.ogre, E.veiler], seat: 1, myHand: [VORSE], steps: [{ do: 'summon', code: VORSE }, { do: 'end' }], turns: 2 })
    const respond = offer(run, 'elfnote.quick.lucina')
    const target = offer(run, `elfnote.target.${E.lucina}`)

    report.bounce = { respond, target, rules: run.rules }
    expect(run.fault).toBeNull()
    expect(respond).toMatchObject({ ask: 'select_chain', chosen: [name(E.lucina)] })
    expect(target).toMatchObject({ chosen: [name(VORSE)], reason: 'auto.bot.reason.target.bounce' })
  })

  it('en tu turno, Evolzar Lars niega el efecto de tu monstruo al Invocarse', { timeout: 180_000 }, async () => {
    // Elemental HERO Stratos: al Invocarse busca un HÉROE (Avian, en tu Deck).
    const STRATOS = 40044918
    const AVIAN = 21844576
    const run = await scenario({ botHand: [E.lucina, E.lucina, E.ash, E.ogre, E.veiler], seat: 1, myHand: [STRATOS], myDeck: [AVIAN], steps: [{ do: 'summon', code: STRATOS }, { do: 'end' }], turns: 2 })
    const respond = offer(run, 'elfnote.respond.lars')
    const target = offer(run, `elfnote.target.${E.lars}`)

    report.lars = { respond, target, rules: run.rules }
    expect(run.fault).toBeNull()
    expect(run.rules).toContain('xyz-lars')
    expect(respond).toMatchObject({ ask: 'select_chain', chosen: [name(E.lars)], reason: 'auto.bot.reason.handtrap.respond' })
    expect(target).toMatchObject({ chosen: [name(STRATOS)], reason: 'auto.bot.reason.target.negate' })
  })
})
