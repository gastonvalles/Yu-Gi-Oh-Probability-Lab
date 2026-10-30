import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { Bot, BotDecision } from '../app/auto/bot/bot'
import { BOT_DECKS } from '../app/auto/bot/decks'
import { SKY, SKY_STRIKER_DECK } from '../app/auto/bot/decks/sky-striker'
import { skyStrikerBot } from '../app/auto/bot/executors/sky-striker'
import { localTransport } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import type { CoreAnswer, CoreAsk } from '../app/auto/protocol'
import { autoRival } from '../app/handtraps'
import { cardRows, CORE_DATA_DIR, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * El ejecutor de Sky Striker con el núcleo real (lento: `npm run test:auto`).
 * - **Goldfish**: el bot (primero, con el mazo de `decks/sky-striker.ts` por `botDeck`, como lo arma la sesión) contra un rival pasivo de 40 Normales, en `GOLDFISH` manos con
 *   semilla. Mide tres cosas y falla si caen por debajo del umbral (`THRESHOLDS`, con su porqué): termina su turno 1 con un Sky Striker Ace de Enlace en el campo, termina su turno 1
 *   con al menos 2 cartas colocadas para tu turno, y te hace daño en su turno 3. Ninguna respuesta suya rechazada por el núcleo.
 * - **Escenarios**: las decisiones clave con una mano fija, con la oferta literal del núcleo y la respuesta del bot: la línea de Engage!, subir a Zero por Enlace, Widow Anchor
 *   contra el efecto de tu monstruo, The Fallen & The Virtuous contra tu atacante, y atacar o no según tu monstruo.
 * Escribe `bot-sky-report.json` en CORE_DATA_DIR (nunca en el repo).
 */

const GOLDFISH = Number(process.env.SKY_GOLDFISH ?? 50)
/**
 * Los umbrales del goldfish (con 50 manos al escribirlo se midió 0,94 · 0,94 · 0,98): un poco por debajo de lo medido, para que una regla rota se note y el azar de 50 manos no.
 * - `link`: con 3 Raye, 2 Roze, 3 Engage! y Reinforcement of the Army (y Pot of Desires y Vision para robar), casi toda mano llega a un Sky Striker Ace; la que no, no tiene con qué.
 * - `set`: las Mágicas Rápidas (13 en el mazo) se colocan para tu turno: con 2 o más, el bot interactúa.
 * - `damage`: con tu campo vacío, cualquier Enlace ataca directo en su turno 3.
 */
const THRESHOLDS = { link: 0.85, set: 0.85, damage: 0.9 }

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

/** Vos: tus jugadas en orden en cada `select_idlecmd` (lo que no se puede espera), tus efectos opcionales (también en una ventana de cadena) sí, atacar con esa carta; lo demás, como el pasivo. */
function player(steps: readonly Step[], own: ReadonlySet<number>) {
  const passive = passivePolicy()
  let next = 0

  return (ask: CoreAsk): CoreAnswer => {
    const step = steps[next]

    if (ask.type === 'select_idlecmd') {
      if (step?.do === 'attack') {
        if (!ask.to_bp) return { type: ask.type, action: 7, index: null }
        return { type: ask.type, action: 6, index: null }
      }
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
    // Tus disparos (el de Stratos al Invocarse) también llegan como una ventana de cadena.
    if (ask.type === 'select_chain' && ask.selects.some((card) => own.has(card.code))) return { type: ask.type, index: ask.selects.findIndex((card) => own.has(card.code)) }
    if (ask.type === 'select_card' && ask.min <= 1) {
      const index = ask.selects.findIndex((card) => own.has(card.code) && card.controller === ask.player)

      if (index >= 0) return { type: ask.type, indices: [index] }
    }
    return passive(ask)
  }
}

describe.skipIf(!hasCoreData)('el ejecutor de Sky Striker con el núcleo real (npm run test:auto)', () => {
  const rows = hasCoreData ? cardRows() : []
  const store = hasCoreData ? scriptStore() : { read: () => null, has: () => false }
  const source = nodeSource(rows, store)
  const loader = createDataLoader(source, null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const { cards, names } = hasCoreData ? loadCards() : { cards: new Map(), names: new Map<number, string>() }
  const report: Record<string, unknown> = {}
  const name = (code: number) => names.get(code) ?? String(code)

  afterAll(() => {
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'bot-sky-report.json'), JSON.stringify(report, null, 1))
  })

  it('la lista fija existe en el núcleo con sus scripts, tiene 40 + 15 y BOT_DECKS la ofrece', () => {
    const missing = [...SKY_STRIKER_DECK.main, ...SKY_STRIKER_DECK.extra].filter(([code]) => !cards.has(code) || !store.has(`c${code}.lua`)).map(([code]) => code)
    const count = (list: readonly (readonly [number, number])[]) => list.reduce((sum, [, copies]) => sum + copies, 0)

    expect(missing).toEqual([])
    expect([count(SKY_STRIKER_DECK.main), count(SKY_STRIKER_DECK.extra)]).toEqual([40, 15])
    expect(BOT_DECKS.map(({ id, name: deck, ready }) => ({ id, deck, ready }))).toEqual([{ id: 'sky-striker', deck: 'Sky Striker', ready: true }])
  })

  /** Una mano del goldfish: el bot empieza (vos vas segundo, pasivo, con 40 Normales); hasta tu turno 4. */
  async function goldfish(seed: number) {
    const { filler } = await source.manifest()
    const faults: string[] = []
    const session = createAutoSession({
      loader,
      deck: { main: filler.map((code) => [code, 1] as const), extra: [] },
      seed,
      botSeed: seed,
      seat: 1,
      transport: localTransport({ wasmBinary: wasm }),
      rival: autoRival({ enabled: false, picks: [], hand: 3, botDeck: 'sky-striker' }),
      onEvent: (event) => {
        if (event.t === 'fault') faults.push(`${event.kind}: ${event.message.slice(0, 160)}`)
      },
    })
    const passive = passivePolicy()
    let snapshot = await settled(session)
    let afterOne: { links: number; set: number; hand: number } | null = null

    for (let n = 0; n < 400 && snapshot.status === 'ready' && !(snapshot.overlay.turn >= 4 && snapshot.ask?.ask.type === 'select_idlecmd'); n += 1) {
      if (!afterOne && snapshot.overlay.turn === 2 && snapshot.ask?.ask.type === 'select_idlecmd') {
        const theirs = snapshot.theirs
        const code = (id: string) => session.adapter!.codeOf({ side: 'theirs', id })
        const links = [...theirs.mz, ...theirs.emz].filter((slot) => slot !== null && ((cards.get(code(slot.id))?.type ?? 0) & 0x4000000) !== 0).length

        afterOne = { links, set: theirs.st.filter((slot) => slot?.pos === 'set').length, hand: theirs.hand.length }
      }
      session.answer(passive(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    const lp = snapshot.overlay.lp[1]
    const reasons = snapshot.answers.filter((item) => item.seat === 0 && item.reason).map((item) => item.reason!.key.replace('auto.bot.reason.', ''))
    session.destroy()

    return { seed, status: snapshot.status, turn: snapshot.overlay.turn, afterOne, lp, faults, reasons }
  }

  it(`goldfish: ${GOLDFISH} manos contra el pasivo, sobre los umbrales y sin respuestas rechazadas`, { timeout: 30 * 60 * 1000 }, async () => {
    const hands: Awaited<ReturnType<typeof goldfish>>[] = []

    for (let seed = 1; seed <= GOLDFISH; seed += 1) hands.push(await goldfish(seed))
    const share = (test: (hand: (typeof hands)[number]) => boolean) => Math.round((hands.filter(test).length / hands.length) * 100) / 100
    const measured = { link: share((hand) => (hand.afterOne?.links ?? 0) > 0), set: share((hand) => (hand.afterOne?.set ?? 0) >= 2), damage: share((hand) => hand.lp < 8000) }
    const reasons: Record<string, number> = {}

    hands.forEach((hand) => hand.reasons.forEach((key) => (reasons[key] = (reasons[key] ?? 0) + 1)))
    report.goldfish = { hands: hands.length, measured, thresholds: THRESHOLDS, reasons, misses: hands.filter((hand) => !hand.afterOne?.links || hand.lp >= 8000).map(({ seed, afterOne, lp }) => ({ seed, afterOne, lp })) }
    console.log(JSON.stringify(report.goldfish))

    expect(hands.flatMap((hand) => hand.faults.filter((fault) => !fault.startsWith('script')))).toEqual([])
    expect(hands.filter((hand) => hand.status !== 'ready' || hand.turn < 4).map((hand) => hand.seed)).toEqual([])
    expect(measured.link).toBeGreaterThanOrEqual(THRESHOLDS.link)
    expect(measured.set).toBeGreaterThanOrEqual(THRESHOLDS.set)
    expect(measured.damage).toBeGreaterThanOrEqual(THRESHOLDS.damage)
  })

  /** Un duelo con la mano del bot fija (arriba de su deck): `seat` es el tuyo. Cada pregunta al bot con su respuesta, en orden. */
  async function scenario(options: { botHand: number[]; seat: 0 | 1; myHand: number[]; steps: Step[]; turns: number; without?: number[]; myDeck?: number[] }) {
    const { filler } = await source.manifest()
    const facts = (code: number) => cards.get(code)
    const inner = skyStrikerBot(facts, (code) => cards.get(code)?.alias ?? 0, (code) => cards.get(code)?.attribute ?? 0)
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
      // `without`: esas cartas del mazo del bot cambiadas por Normales (para mirar una decisión sin que otra regla se cruce).
      rival: { main: SKY_STRIKER_DECK.main.map(([code, copies]) => (options.without?.includes(code) ? ([filler[code % filler.length]!, copies] as const) : ([code, copies] as const))), extra: SKY_STRIKER_DECK.extra, hand: () => options.botHand },
      bot,
    })
    const me = player(options.steps, new Set(own))
    let snapshot = await settled(session)

    for (let n = 0; n < 300 && snapshot.status === 'ready' && snapshot.overlay.turn <= options.turns; n += 1) {
      session.answer(me(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    session.destroy()
    const rules = log.map((item) => item.decision.rule ?? '')

    return { log, rules, status: snapshot.status, fault: snapshot.fault, lp: snapshot.overlay.lp }
  }

  /** La pregunta del núcleo en que el bot usó esa regla, con lo que ofrecía (códigos) y lo que contestó. */
  const offer = (run: Awaited<ReturnType<typeof scenario>>, rule: string) => {
    const item = run.log.find((entry) => entry.decision.rule === rule)

    if (!item) return null
    const { ask, decision } = item
    const offered = ask.type === 'select_card' ? ask.selects.map((card) => name(card.code)) : ask.type === 'select_chain' ? ask.selects.map((card) => name(card.code)) : ask.type === 'select_idlecmd' ? ask.activates.map((card) => name(card.code)) : []
    const chosen = ask.type === 'select_card' && decision.answer.type === 'select_card' ? (decision.answer.indices ?? []).map((i) => name(ask.selects[i]!.code)) : ask.type === 'select_chain' && decision.answer.type === 'select_chain' && decision.answer.index !== null ? [name(ask.selects[decision.answer.index]!.code)] : []

    return { ask: ask.type, offered, chosen, reason: decision.reason?.key }
  }

  it('la línea de Engage!: busca a Raye (no tiene a quién Invocar), la Invoca, la Tributa por Kagari y Kagari recupera Engage!', { timeout: 120_000 }, async () => {
    const run = await scenario({ botHand: [SKY.engage, SKY.widow, SKY.hornet, SKY.crown, SKY.mst], seat: 1, myHand: [], steps: [], turns: 1 })
    const search = offer(run, 'sky.search.engage')

    report.engage = { search, recover: offer(run, 'sky.recover.kagari'), rules: run.rules }
    expect(run.fault).toBeNull()
    expect(search).toMatchObject({ ask: 'select_card', chosen: [name(SKY.raye)], reason: 'auto.bot.reason.play.search' })
    expect(search!.offered).toContain(name(SKY.widow))
    expect(run.rules).toEqual(expect.arrayContaining(['engage', 'normal-raye', 'raye', 'sky.extra.26077387', 'sky.recover.kagari']))
    expect(run.rules.indexOf('engage')).toBeLessThan(run.rules.indexOf('normal-raye'))
    expect(offer(run, 'sky.recover.kagari')).toMatchObject({ chosen: [name(SKY.engage)] })
    // Con Kagari en la Zona Extra, su Zona Principal vacía: vuelve a activar Engage! y coloca sus Mágicas Rápidas para tu turno.
    expect(run.rules.filter((rule) => rule === 'engage').length).toBeGreaterThanOrEqual(2)
    expect(run.rules.some((rule) => rule.startsWith('set-'))).toBe(true)
  })

  it('sube a Zero por Enlace: Raye Invocada de modo Normal llama a Roze de la mano y las dos son Zero, que busca una Mágica', { timeout: 120_000 }, async () => {
    const run = await scenario({ botHand: [SKY.raye, SKY.roze, SKY.widow, SKY.crown, SKY.mst], seat: 1, myHand: [], steps: [], turns: 1 })

    report.zero = { rules: run.rules, search: offer(run, 'sky.search.zero') }
    expect(run.fault).toBeNull()
    expect(run.rules.indexOf('normal-raye')).toBeGreaterThanOrEqual(0)
    expect(run.rules).toContain(`sky.trigger.${SKY.roze}.0`)
    expect(run.rules.indexOf('link-zero')).toBeGreaterThan(run.rules.indexOf('normal-raye'))
    expect(run.rules).toContain('sky.search.zero')
    // Zero antes que el efecto de Raye: con Raye y Roze, el Enlace 2.
    expect(run.rules).not.toContain('raye')
  })

  it('en tu turno, Widow Anchor colocada responde al efecto de tu monstruo en el campo y lo apunta', { timeout: 120_000 }, async () => {
    // Elemental HERO Stratos (al Invocarse busca un HÉROE, Avian, de tu Deck: un efecto de monstruo en el campo).
    const STRATOS = 40044918
    const run = await scenario({ botHand: [SKY.raye, SKY.widow, SKY.crown, SKY.hornet, SKY.linkage], seat: 1, myHand: [STRATOS], myDeck: [21844576], steps: [], turns: 1 })
    const run2 = await scenario({ botHand: [SKY.raye, SKY.widow, SKY.crown, SKY.hornet, SKY.linkage], seat: 1, myHand: [STRATOS], myDeck: [21844576], steps: [{ do: 'summon', code: STRATOS }], turns: 2 })
    const respond = offer(run2, `sky.respond.${SKY.widow}`)
    const target = offer(run2, `sky.target.${SKY.widow}`)

    report.widow = { respond, target, setTurn1: run.rules.filter((rule) => rule.startsWith('set-')) }
    expect(run2.fault).toBeNull()
    expect(run.rules).toContain(`set-${SKY.widow}`)
    expect(respond).toMatchObject({ ask: 'select_chain', chosen: [name(SKY.widow)] })
    expect(target).toMatchObject({ ask: 'select_card', chosen: [name(STRATOS)], reason: 'auto.bot.reason.target.negate' })
  })

  it('en tu turno, The Fallen & The Virtuous colocada destruye al monstruo que te declara un ataque', { timeout: 120_000 }, async () => {
    // Vorse Raider (1900, Normal): atacás a su Enlace.
    const VORSE = 14898066
    const run = await scenario({ botHand: [SKY.raye, SKY.fallen, SKY.crown, SKY.mst, SKY.linkage], seat: 1, myHand: [VORSE], steps: [{ do: 'summon', code: VORSE }, { do: 'attack', code: VORSE }], turns: 2 })
    const respond = offer(run, 'sky.attack.fallen')
    const target = offer(run, `sky.target.${SKY.fallen}`)

    report.fallen = { respond, target }
    expect(run.fault).toBeNull()
    expect(respond).toMatchObject({ ask: 'select_chain', chosen: [name(SKY.fallen)] })
    expect(target).toMatchObject({ chosen: [name(VORSE)], reason: 'auto.bot.reason.target.destroy' })
  })

  it('ataca a tu monstruo sólo si lo destruye sin perder el suyo; si no, termina sin atacar y dice por qué', { timeout: 120_000 }, async () => {
    // Vos primero: un Normal de 1000 o menos (lo destruye) o Gene-Warped Warwolf (2000: Zero empata y sus Enlace de 1 no llegan). Sin lo que destruye o se lleva tu monstruo.
    const { filler } = await source.manifest()
    const weak = filler.find((code) => (cards.get(code)?.attack ?? 9999) <= 1000 && (cards.get(code)?.level ?? 9) <= 4)!
    const strong = 69247929
    const without = [SKY.fallen, SKY.crown, SKY.widow, SKY.mst, SKY.talent, SKY.called, SKY.shark, SKY.lemnisgate]
    const hand = [SKY.engage, SKY.raye, SKY.hornet, SKY.linkage, 14558127]
    const beats = await scenario({ botHand: hand, seat: 0, myHand: [weak], steps: [{ do: 'summon', code: weak }, { do: 'end' }], turns: 2, without })
    const holds = await scenario({ botHand: hand, seat: 0, myHand: [strong], steps: [{ do: 'summon', code: strong }, { do: 'end' }], turns: 2, without })

    report.battle = { beats: { attack: offer(beats, 'executor.attack.safe'), rules: beats.rules.filter((rule) => rule.startsWith('executor')) }, holds: holds.log.filter((item) => item.decision.rule?.startsWith('executor')).map((item) => [item.decision.rule, item.decision.reason?.key]) }
    expect([beats.fault, holds.fault]).toEqual([null, null])
    expect(offer(beats, 'executor.attack.safe')).toMatchObject({ chosen: [name(weak)], reason: 'auto.bot.reason.battle.safe' })
    expect(holds.rules).not.toContain('executor.attack.safe')
    expect(holds.rules).not.toContain('executor.battle')
    expect(holds.log.find((item) => item.decision.rule === 'executor.end' && item.turn === 2)?.decision.reason?.key).toBe('auto.bot.reason.end.noSafeAttack')
  })
})
