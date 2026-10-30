import { createDataLoader } from '../../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../../app/auto/auto-session'
import { localTransport } from '../../app/auto/core-host'
import type { DeckList } from '../../app/auto/deck-map'
import { passivePolicy } from '../../app/auto/policies'
import type { AutoEvent, CoreAnswer, CoreAsk, WireEvent } from '../../app/auto/protocol'
import { autoRival, type HandtrapConfig } from '../../app/handtraps'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './core-data'

/**
 * El arnés de las handtraps del rival contra el núcleo real (`auto-handtraps*.slow.test.ts`): un duelo de la sesión de verdad con tu deck, tu mano y tus pasos, y el rival del
 * simulador. Tus pasos van en orden: en cada `select_idlecmd`, la jugada con esa carta (lo que todavía no se puede espera al turno siguiente); `battle` pasa a tu Battle Phase y
 * `attack` ataca con esa carta. Tus efectos opcionales, sí; no respondés a cadenas; lo demás, como el pasivo.
 */

const IDLE = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
/** Una jugada tuya en un `select_idlecmd` (su `action`: 0 Normal, 1 Especial, 4 colocar una Mágica o Trampa, 5 activar). */
const ACTION = { summon: 0, spsummon: 1, mset: 3, set: 4, activate: 5 } as const
/** `end` termina tu turno (para que juegue el rival el suyo) y `mset` coloca un monstruo. */
export type Step = { do: keyof typeof ACTION; code: number } | { do: 'battle' | 'end' } | { do: 'attack'; code: number }

export interface DuelScenario {
  /** Tu deck (sin contar la mano) y tu mano, arriba en ese orden. */
  deck: [number, number][]
  extra?: [number, number][]
  hand: number[]
  steps: Step[]
  /** Lo que elegís al buscar, mandar al cementerio o revivir (`select_card` de una), en orden de preferencia; sin esto, la primera. */
  wants?: number[]
}

/** Las cartas de H3 (bot para jugar en contra): cada una con su uso y su no uso en `auto-handtraps-h3.slow.test.ts`. */
export const H3_CARDS = [67750322, 46502744, 68144894, 14965712, 33854624, 6637331, 60242223, 91800273, 69680031, 17266660, 21074344, 94689635]
/** Las de `AUTO_RULES` que el bot decide con su vista (Evenly Matched): cada una con su uso y su no uso en `auto-bot-cartas.slow.test.ts`. */
export const BOT_CARDS = [15693423]

const END = (type: 'select_idlecmd'): CoreAnswer => ({ type, action: 7, index: null })

function player(steps: readonly Step[], wants: readonly number[] = []) {
  const passive = passivePolicy()
  let next = 0

  return {
    get done() {
      return next >= steps.length
    },
    answer(ask: CoreAsk, own: ReadonlySet<number>): CoreAnswer {
      const step = steps[next]

      if (ask.type === 'select_idlecmd') {
        if (step?.do === 'end') {
          next += 1

          return END(ask.type)
        }
        if (step?.do === 'battle') {
          if (!ask.to_bp) return END(ask.type)
          next += 1

          return { type: ask.type, action: 6, index: null }
        }
        const index = step && 'code' in step && step.do !== 'attack' ? ask[IDLE[ACTION[step.do]]].findIndex((card) => card.code === step.code) : -1

        // Lo que todavía no se puede (una Trampa recién colocada) espera al turno siguiente.
        if (!step || index < 0) return END(ask.type)
        next += 1

        return { type: ask.type, action: ACTION[step.do as keyof typeof ACTION], index }
      }
      if (ask.type === 'select_battlecmd' && step?.do === 'attack') {
        const index = ask.attacks.findIndex((card) => card.code === step.code)

        if (index >= 0) {
          next += 1

          return { type: ask.type, action: 1, index }
        }
      }
      if (ask.type === 'select_effectyn') return { type: ask.type, yes: own.has(ask.code) }
      if (ask.type === 'select_card' && ask.min <= 1) {
        const index = ask.selects.findIndex((card) => card.code === wants.find((code) => ask.selects.some((other) => other.code === code)))

        if (index >= 0) return { type: ask.type, indices: [index] }
      }
      return passive(ask)
    },
  }
}

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

/** Lo que el núcleo le preguntó al rival, en una línea: `select_chain [códigos]`, `select_effectyn <código>`; lo demás, sólo el tipo. */
const askLine = (ask: CoreAsk) => (ask.type === 'select_chain' ? `select_chain [${ask.selects.map((card) => card.code).join(',')}]` : ask.type === 'select_effectyn' ? `select_effectyn ${ask.code}` : ask.type)

/** El duelo con los datos del núcleo (`hasCoreData`): `duel(escenario, config)` juega hasta que hiciste todo y vuelve a ser tu turno de elegir (o el tope). */
export function handtrapDuels() {
  const rows = hasCoreData ? cardRows() : []
  const loader = createDataLoader(nodeSource(rows, scriptStore()), null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const names = new Map(rows.map((row) => [row.id, row.name ?? String(row.id)]))

  async function duel(scenario: DuelScenario, config: HandtrapConfig) {
    const events: WireEvent[] = []
    /** Lo que el núcleo le ofreció al rival en cada ventana de cadena (códigos), en orden. */
    const offers: number[][] = []
    /** Cada pregunta al rival, en orden (sin las ventanas de cadena vacías): sus respuestas están en `snapshot.answers`. */
    const asks: string[] = []
    /** Cada pregunta al rival tal cual, en orden (también las ventanas de cadena vacías): van una a una con sus respuestas de `snapshot.answers`. */
    const rivalAsks: CoreAsk[] = []
    const deck: DeckList = { main: [...scenario.hand.map((code) => [code, 1] as [number, number]), ...scenario.deck], extra: scenario.extra ?? [] }
    const session = createAutoSession({
      loader,
      deck,
      hand: scenario.hand,
      handSize: scenario.hand.length,
      seed: 1,
      transport: localTransport({ wasmBinary: wasm }),
      rival: autoRival(config),
      onEvent: (event: AutoEvent) => {
        if (event.t === 'events' && event.seat === 0) events.push(...event.events)
        if (event.t === 'ask' && event.seat === 1 && event.ask.type === 'select_chain') offers.push(event.ask.selects.map((card) => card.code))
        if (event.t === 'ask' && event.seat === 1 && !(event.ask.type === 'select_chain' && event.ask.selects.length === 0)) asks.push(askLine(event.ask))
        if (event.t === 'ask' && event.seat === 1) rivalAsks.push(event.ask)
      },
    })
    const me = player(scenario.steps, scenario.wants)
    const own = new Set(deck.main.map(([code]) => code))
    let snapshot = await settled(session)
    /** Cada mesa en que el núcleo esperó una respuesta tuya, en orden (la prueba de pantalla del turno del rival la reproduce). */
    const history = [snapshot]
    // Su mano, como la ve él: la que repartió el simulador.
    const handAtStart = snapshot.rivalHand

    for (let n = 0; n < 120 && snapshot.status === 'ready' && !(me.done && snapshot.ask?.ask.type === 'select_idlecmd'); n += 1) {
      session.answer(me.answer(snapshot.ask!.ask, own))
      snapshot = await settled(session)
      history.push(snapshot)
    }
    const adapter = session.adapter!
    session.destroy()

    return { events, offers, asks, rivalAsks, snapshot, handAtStart, history, adapter }
  }

  return { duel, names }
}

export const chainingOf = (events: readonly WireEvent[], code: number, controller: 0 | 1) => events.findIndex((event) => event.type === 'chaining' && event.code === code && event.controller === controller)
export const has = (events: readonly WireEvent[], test: (event: WireEvent) => boolean) => events.some(test)
export const moved = (events: readonly WireEvent[], card: number, from: number, to: number) =>
  has(events, (event) => event.type === 'move' && event.card === card && (event.from.location & from) !== 0 && (event.to.location & to) !== 0)
