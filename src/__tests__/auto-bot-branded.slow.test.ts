import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { Bot, BotDecision } from '../app/auto/bot/bot'
import { BOT_DECKS } from '../app/auto/bot/decks'
import { BRANDED as B, BRANDED_DECK } from '../app/bot-deck-lists'
import { brandedBot } from '../app/auto/bot/executors/branded'
import { localTransport } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import type { CoreAnswer, CoreAsk } from '../app/auto/protocol'
import { autoRival } from '../app/handtraps'
import { cardRows, CORE_DATA_DIR, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * El ejecutor de Despia Branded con el núcleo real (lento: `npm run test:auto`).
 * - **Goldfish**: el bot (primero, con el mazo de `bot-deck-lists.ts` por `botDeck`, como lo arma la sesión) contra un rival pasivo de 40 Normales, en `GOLDFISH` manos con semilla.
 *   Falla si cae por debajo de los umbrales (`THRESHOLDS`, con su porqué) o si el núcleo le rechaza una respuesta. Mide también cuántas preguntas contesta por turno y cuánto tarda
 *   cada decisión.
 * - **Escenarios**: las decisiones clave con una mano fija, con la oferta literal del núcleo y la respuesta del bot: Aluber busca Branded Fusion, Branded Fusion a Lubellion y
 *   Lubellion a Mirrorjade; Mirrorjade destierra tu monstruo en tu turno; The Fallen & The Virtuous destruye a tu atacante; Albaz Fusiona con tu monstruo.
 * Escribe `bot-branded-report.json` en CORE_DATA_DIR (nunca en el repo).
 */

const GOLDFISH = Number(process.env.BRANDED_GOLDFISH ?? 50)
/** `BRANDED_LOG=<semilla>`: escribe cada pregunta del bot de esa mano, con lo que ofrece el núcleo y lo que contestó (para mirar una mano antes de culpar a la política). */
const LOG_SEED = Number(process.env.BRANDED_LOG ?? 0)
/**
 * Los umbrales del goldfish (con 50 manos al escribirlo se midió 0,72 · 0,98 · 0,98; 15 de las 50 ganan en su turno 3), un poco por debajo de lo medido, para que una regla rota se
 * note y el azar de 50 manos no.
 * - `fusion`: termina su turno 1 con una Fusión en el campo. Arranca con Branded Fusion o lo que la busca (Aluber ×3, Branded Opening, Gold Sarcophagus con Mercourier) o con
 *   Fallen of the White Dragon y Cartesia; sin nada de eso (una mano de handtraps, Nadir Servant y Super Polymerization), no: unas 14 de cada 50.
 * - `interrupt`: termina su turno 1 con al menos una interrupción para tu turno: Mirrorjade, Quaeritis, Rindbrumm o Granguignol en el campo, o una Mágica o Trampa colocada.
 * - `damage`: con tu campo vacío, te hace daño en su turno 3.
 */
const THRESHOLDS = { fusion: 0.62, interrupt: 0.9, damage: 0.9 }
const INTERRUPTERS = new Set<number>([B.mirrorjade, B.quaeritis, B.rindbrumm, B.granguignol])

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

describe.skipIf(!hasCoreData)('el ejecutor de Despia Branded con el núcleo real (npm run test:auto)', () => {
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
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'bot-branded-report.json'), JSON.stringify(report, null, 1))
  })

  it('la lista fija existe en el núcleo con sus scripts, tiene 41 + 15 (como se jugó) y BOT_DECKS la ofrece', () => {
    const missing = [...BRANDED_DECK.main, ...BRANDED_DECK.extra].filter(([code]) => !cards.has(code) || !store.has(`c${code}.lua`)).map(([code]) => code)
    const count = (list: readonly (readonly [number, number])[]) => list.reduce((sum, [, copies]) => sum + copies, 0)

    expect(missing).toEqual([])
    expect([count(BRANDED_DECK.main), count(BRANDED_DECK.extra)]).toEqual([41, 15])
    expect(BOT_DECKS.find((deck) => deck.id === 'branded')).toMatchObject({ name: 'Despia Branded', ready: true })
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
    const inner = brandedBot(facts, aliasOf, attributeOf)
    const times: number[] = []
    const perTurn: Record<number, number> = {}
    const log: string[] = []
    let opening: string[] | null = null
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
      transport: localTransport({ wasmBinary: wasm }),
      rival: autoRival({ enabled: false, picks: [], hand: 3, botDeck: 'branded' }),
      bot,
      onEvent: (event) => {
        if (event.t === 'fault') faults.push(`${event.kind}: ${event.message.slice(0, 160)}`)
      },
    })
    const passive = passivePolicy()
    let snapshot = await settled(session)
    let afterOne: { fusions: number; interrupts: number; set: number; field: string[] } | null = null

    for (let n = 0; n < 600 && snapshot.status === 'ready' && !(snapshot.overlay.turn >= 4 && snapshot.ask?.ask.type === 'select_idlecmd'); n += 1) {
      if (!afterOne && snapshot.overlay.turn === 2 && snapshot.ask?.ask.type === 'select_idlecmd') {
        const theirs = snapshot.theirs
        const code = (id: string) => session.adapter!.codeOf({ side: 'theirs', id })
        const field = [...theirs.mz, ...theirs.emz].filter((slot) => slot !== null).map((slot) => code(slot!.id))
        const set = theirs.st.filter((slot) => slot?.pos === 'set').length

        afterOne = { fusions: field.filter((card) => ((cards.get(card)?.type ?? 0) & 0x40) !== 0).length, interrupts: field.filter((card) => INTERRUPTERS.has(card)).length + set, set, field: field.map(name) }
      }
      session.answer(passive(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    const lp = snapshot.overlay.lp[1]
    const reasons = snapshot.answers.filter((item) => item.seat === 0 && item.reason).map((item) => item.reason!.key.replace('auto.bot.reason.', ''))
    session.destroy()
    if (log.length > 0) writeFileSync(path.join(CORE_DATA_DIR, `bot-branded-log-${seed}.txt`), log.join('\n'))

    return { seed, status: snapshot.status, turn: snapshot.overlay.turn, afterOne, lp, faults, reasons, times, perTurn, opening }
  }

  it(`goldfish: ${GOLDFISH} manos contra el pasivo, sobre los umbrales y sin respuestas rechazadas`, { timeout: 60 * 60 * 1000 }, async () => {
    const hands: Awaited<ReturnType<typeof goldfish>>[] = []

    for (let seed = 1; seed <= GOLDFISH; seed += 1) hands.push(await goldfish(seed))
    const share = (test: (hand: (typeof hands)[number]) => boolean) => Math.round((hands.filter(test).length / hands.length) * 100) / 100
    const measured = { fusion: share((hand) => (hand.afterOne?.fusions ?? 0) > 0), interrupt: share((hand) => (hand.afterOne?.interrupts ?? 0) > 0), damage: share((hand) => hand.lp < 8000) }
    const reasons: Record<string, number> = {}
    const times = hands.flatMap((hand) => hand.times).sort((x, y) => x - y)
    const turns = hands.flatMap((hand) => Object.values(hand.perTurn)).sort((x, y) => x - y)
    const at = (list: number[], p: number) => Math.round((list[Math.min(list.length - 1, Math.floor(p * list.length))] ?? 0) * 1000) / 1000

    hands.forEach((hand) => hand.reasons.forEach((key) => (reasons[key] = (reasons[key] ?? 0) + 1)))
    report.goldfish = {
      hands: hands.length,
      measured,
      thresholds: THRESHOLDS,
      msPerDecision: { decisions: times.length, median: at(times, 0.5), p99: at(times, 0.99), max: at(times, 1) },
      asksPerOwnTurn: { median: at(turns, 0.5), p99: at(turns, 0.99), max: at(turns, 1) },
      reasons,
      fields: hands.map(({ seed, afterOne, lp, opening }) => ({ seed, opening, afterOne, lp })),
    }
    console.log(JSON.stringify({ ...(report.goldfish as object), fields: undefined }))

    expect(hands.flatMap((hand) => hand.faults.filter((fault) => !fault.startsWith('script')))).toEqual([])
    // Hasta tu turno 4, o el bot ya ganó (en su turno 3, con tu campo vacío, puede).
    expect(hands.filter((hand) => !(hand.status === 'ready' && hand.turn >= 4) && !(hand.status === 'ended' && hand.lp === 0)).map((hand) => hand.seed)).toEqual([])
    expect(measured.fusion).toBeGreaterThanOrEqual(THRESHOLDS.fusion)
    expect(measured.interrupt).toBeGreaterThanOrEqual(THRESHOLDS.interrupt)
    expect(measured.damage).toBeGreaterThanOrEqual(THRESHOLDS.damage)
  })

  /** Un duelo con la mano del bot fija (arriba de su deck): `seat` es el tuyo. Cada pregunta al bot con su respuesta, en orden. */
  async function scenario(options: { botHand: number[]; seat: 0 | 1; myHand: number[]; steps: Step[]; turns: number; myDeck?: number[] }) {
    const { filler } = await source.manifest()
    const inner = brandedBot(facts, aliasOf, attributeOf)
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
      rival: { main: BRANDED_DECK.main, extra: BRANDED_DECK.extra, hand: () => options.botHand },
      bot,
    })
    const me = player(options.steps, new Set(own))
    let snapshot = await settled(session)

    for (let n = 0; n < 400 && snapshot.status === 'ready' && snapshot.overlay.turn <= options.turns; n += 1) {
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

  it('la línea de Branded Fusion: Aluber busca Branded Fusion, Branded Fusion trae a Lubellion del Deck y Lubellion a Mirrorjade desde el cementerio', { timeout: 180_000 }, async () => {
    const run = await scenario({ botHand: [B.aluber, B.superPoly, B.virtuous, B.nadir, B.kitt], seat: 1, myHand: [], steps: [], turns: 1 })
    const search = offer(run, 'branded.search.aluber')
    const fused = offer(run, `branded.fuse.${B.fusion}`)
    const again = offer(run, `branded.fuse.${B.lubellion}`)

    report.fusion = { search, fused, again, rules: run.rules }
    expect(run.fault).toBeNull()
    expect(search).toMatchObject({ ask: 'select_card', chosen: [name(B.fusion)], reason: 'auto.bot.reason.play.search' })
    expect(fused).toMatchObject({ chosen: [name(B.lubellion)], reason: 'auto.bot.reason.play.fusion' })
    expect(again).toMatchObject({ chosen: [name(B.mirrorjade)] })
    expect(run.rules.indexOf('normal-aluber')).toBeLessThan(run.rules.indexOf('fusion'))
    // Antes de terminar coloca lo que usa en tu turno.
    expect(run.rules.some((rule) => rule.startsWith('set-'))).toBe(true)
  })

  it('en tu turno, Mirrorjade destierra a tu monstruo recién Invocado', { timeout: 180_000 }, async () => {
    // Vorse Raider (1900, Normal).
    const VORSE = 14898066
    const run = await scenario({ botHand: [B.aluber, B.ash, B.ogre, B.droll, B.kitt], seat: 1, myHand: [VORSE], steps: [{ do: 'summon', code: VORSE }, { do: 'end' }], turns: 2 })
    const respond = offer(run, 'branded.quick.mirrorjade')
    const target = offer(run, `branded.target.${B.mirrorjade}`)

    report.mirrorjade = { respond, target, rules: run.rules }
    expect(run.fault).toBeNull()
    expect(respond).toMatchObject({ ask: 'select_chain', chosen: [name(B.mirrorjade)] })
    expect(target).toMatchObject({ chosen: [name(VORSE)], reason: 'auto.bot.reason.target.banish' })
  })

  it('en tu turno, The Fallen & The Virtuous colocada destruye al monstruo que te declara un ataque', { timeout: 180_000 }, async () => {
    // Vorse Raider: atacás a su campo. Sin Branded Fusion (Gold Sarcophagus y Nadir no la traen): queda Albaz Invocada en ataque o el campo vacío.
    const VORSE = 14898066
    const run = await scenario({ botHand: [B.virtuous, B.ash, B.ogre, B.droll, B.fuwalos], seat: 1, myHand: [VORSE], steps: [{ do: 'summon', code: VORSE }, { do: 'attack', code: VORSE }], turns: 2 })
    const respond = offer(run, 'branded.attack.virtuous')
    const target = offer(run, `branded.target.${B.virtuous}`)

    report.virtuous = { respond, target, rules: run.rules }
    expect(run.fault).toBeNull()
    expect(run.rules).toContain(`set-${B.virtuous}`)
    expect(respond).toMatchObject({ ask: 'select_chain', chosen: [name(B.virtuous)] })
    expect(target).toMatchObject({ chosen: [name(VORSE)], reason: 'auto.bot.reason.target.destroy' })
  })

  it('con tu monstruo en el campo, Fallen of Albaz lo usa de material de Fusión', { timeout: 180_000 }, async () => {
    // Vos primero: Vorse Raider (OSCURIDAD) en el campo; el bot tiene a Albaz y algo que descartar.
    const VORSE = 14898066
    const run = await scenario({ botHand: [B.albaz, B.fuwalos, B.ash, B.ogre, B.droll], seat: 0, myHand: [VORSE], steps: [{ do: 'summon', code: VORSE }, { do: 'end' }], turns: 2 })
    const materials = run.log.find((entry) => entry.decision.rule === 'branded.material.yours')

    report.albaz = { rules: run.rules, fused: offer(run, `branded.fuse.${B.albaz}`) }
    expect(run.fault).toBeNull()
    expect(run.rules).toContain('normal-albaz')
    expect(materials?.decision.reason).toMatchObject({ key: 'auto.bot.reason.play.fusionYours', cards: [B.albaz, VORSE] })
  })
})
