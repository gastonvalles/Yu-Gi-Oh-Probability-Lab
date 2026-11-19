import { type OcgCardData } from 'ocgcore-wasm'
import { describe, expect, it } from 'vitest'
import { copyIds, createAdapter } from '../app/auto/adapter'
import { botViewOf, type Bot, type BotDecision } from '../app/auto/bot/bot'
import { executorBot } from '../app/auto/bot/executors/executor'
import { turnBot } from '../app/auto/bot/turn'
import { createAutoHost } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import { LOCATION as L, POSITION as P, type AutoEvent, type CoreAsk, type EventOf, type WireEvent } from '../app/auto/protocol'
import { RESUME_FLAGS, setupOf } from '../app/auto/resume'
import { createMatState, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * El bot invoca por Péndulo (`pendulumIndex` de `bot/turn.ts`), con el núcleo y los scripts de verdad (lento: `npm run test:auto`): el bot (asiento 0, `turnBot` y el marco de los
 * ejecutores) arranca en su Main Phase 1 con dos Escalas (1 y 8) y contesta con su vista (`botViewOf`, desde su adaptador). Con un monstruo que entra, la Invocación sale con la
 * marca `pendulum` del anfitrión y en ataque; con sólo una handtrap que entra (el núcleo igual la ofrece), no la gasta.
 */

const DRAGONPULSE = 15146890 // Normal de Péndulo, escala 1
const DRAGONPIT = 51531505 // Normal de Péndulo, escala 8
const ARC = 14105623 // Normal de Péndulo, Nivel 7
const GOLDRIVER = 33256280 // Normal de Péndulo, Nivel 4 (boca arriba en el Extra)
const ASH = 14558127 // handtrap, Nivel 3
const BEWD = 89631139

describe.skipIf(!hasCoreData)('el bot invoca por Péndulo, con el núcleo real', () => {
  const { cards } = hasCoreData ? loadCards() : { cards: new Map<number, OcgCardData>() }
  const store = scriptStore()
  const facts = (code: number) => cards.get(code)
  const typeOf = (code: number) => cards.get(code)?.type ?? 0
  const codeOf = (_side: unknown, id: string) => Number(id.split('-')[1] ?? 0)
  const bots: [string, () => Bot][] = [
    ['turnBot', () => turnBot([ASH], [], undefined, undefined, facts)],
    ['ejecutor', () => executorBot({ plays: [], chain: () => null, choose: () => null }, facts, turnBot([ASH], [], undefined, undefined, facts))],
  ]

  /** La mesa del bot: 8 Blue-Eyes en el deck, las Escalas en las Zonas de Péndulo, `hand` en la mano y `extraUp` boca arriba en el Extra Deck; Main Phase 1. */
  function table(hand: number[], extraUp: number[]): MatState {
    const ids = copyIds([...Array(8).fill(BEWD), DRAGONPULSE, DRAGONPIT, ...hand, ...extraUp])
    const extra = ids.slice(10 + hand.length)
    let state = { ...createMatState(ids.slice(0, 10 + hand.length), [], 0), extra, extraUp: extra }
    const play = (action: MatAction) => void (state = matReducer(state, action))

    play({ type: 'place', id: ids[8]!, zone: 'st', index: 0, pos: 'atk' })
    play({ type: 'place', id: ids[9]!, zone: 'st', index: 4, pos: 'atk' })
    for (const id of ids.slice(10, 10 + hand.length)) play({ type: 'move', id, to: 'hand' })
    play({ type: 'phase', phase: 'main1' })
    return state
  }

  /** El turno del bot hasta que pasa a la Battle Phase o termina: sus decisiones, sus preguntas y lo que vio. */
  async function botTurn(bot: Bot, hand: number[], extraUp: number[] = []) {
    const mine = table(hand, extraUp)
    const theirs = createMatState(copyIds(Array(8).fill(BEWD)), [], 0)
    const adapter = createAdapter({ seat: 0, mine: { deck: [], extra: [] }, theirs: { deck: 8, extra: 0 }, typeOf, setup: { mine, theirs, codeOf } })
    const events: AutoEvent[] = []
    const auto = createAutoHost({
      core: { wasmBinary: wasmBinary() },
      cardReader: (code) => cards.get(code) ?? null,
      scriptReader: store.read,
      emit: (event) => {
        events.push(event)
        if (event.t === 'events') adapter.apply(event)
      },
    })
    const deck = (codes: number[]) => ({ main: codes, extra: [], hand: [] })
    const own = [...Array(8).fill(BEWD), DRAGONPULSE, DRAGONPIT, ...hand, ...extraUp]
    const still = { lp: 8000, hand: 0, draw: 1 }

    await auto.handle({ t: 'create', seed: 7, flags: RESUME_FLAGS, players: [still, still], decks: [deck(own), deck(Array(8).fill(BEWD))], setup: setupOf([{ state: mine, codeOf: (id) => codeOf(0, id) }, { state: theirs, codeOf: (id) => codeOf(1, id) }], [8000, 8000]) })
    const asks: CoreAsk[] = []
    const decisions: BotDecision[] = []
    const context = { random: () => 0.5, level: 'normal' as const }

    for (let i = 0; i < 60; i += 1) {
      const asked = events.findLast((event): event is Extract<AutoEvent, { t: 'ask' }> => event.t === 'ask')!

      if (asked.seat !== 0) {
        await auto.handle({ t: 'answer', askId: asked.askId, answer: passivePolicy()(asked.ask) })
        continue
      }
      const decision = bot(asked.ask, botViewOf(adapter, 0, []), context)

      asks.push(asked.ask)
      decisions.push(decision)
      const { answer } = decision

      if (answer.type === 'select_idlecmd' && answer.action >= 6) break
      await auto.handle({ t: 'answer', askId: asked.askId, answer })
    }
    expect(events.filter((event) => event.t === 'fault')).toEqual([])
    const seen = events.flatMap((event) => (event.t === 'events' && event.seat === 0 ? event.events : []))

    return { asks, decisions, seen }
  }
  const of = <K extends WireEvent['type']>(events: WireEvent[], type: K) => events.filter((event): event is EventOf<K> => event.type === type)
  const offered = (asks: CoreAsk[]) => asks.some((ask) => ask.type === 'select_idlecmd' && ask.special_summons.some((card) => card.location === L.SZONE))

  it.each(bots)('%s: con un monstruo en la mano y otro boca arriba en el Extra Deck, Invoca por Péndulo a los dos, con la marca `pendulum` y en ataque', { timeout: 120_000 }, async (_name, make) => {
    const { asks, decisions, seen } = await botTurn(make(), [ARC], [GOLDRIVER])

    expect(offered(asks)).toBe(true)
    expect(decisions.filter((decision) => decision.reason?.key === 'auto.bot.reason.play.pendulum')).toHaveLength(1)
    expect(of(seen, 'spsummoning').map((event) => [event.code, event.pendulum])).toEqual([
      [ARC, true],
      [GOLDRIVER, true],
    ])
    expect(of(seen, 'move').filter((event) => event.to.location === L.MZONE).map((event) => [event.card, event.to.position])).toEqual([
      [ARC, P.FACEUP_ATTACK],
      [GOLDRIVER, P.FACEUP_ATTACK],
    ])
  })

  it.each(bots)('%s: con sólo una handtrap que entra (el núcleo la ofrece igual), no Invoca por Péndulo', { timeout: 120_000 }, async (_name, make) => {
    const { asks, decisions, seen } = await botTurn(make(), [ASH])

    expect(offered(asks)).toBe(true)
    expect(decisions.some((decision) => decision.reason?.key === 'auto.bot.reason.play.pendulum')).toBe(false)
    expect(of(seen, 'spsummoning')).toEqual([])
  })
})
