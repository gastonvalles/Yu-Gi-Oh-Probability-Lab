import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { Bot } from '../app/auto/bot/bot'
import { botDeckOf } from '../app/auto/bot/decks'
import { ANGELECHY as A, ELFNOTE as E, SKY } from '../app/bot-deck-lists'
import { localTransport } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import type { CoreAnswer, CoreAsk } from '../app/auto/protocol'
import { cardRows, CORE_DATA_DIR, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * Cuándo gastan sus interrupciones los bots con mazo, con el núcleo real (lento: `npm run test:auto`). Vas primero con una línea guionada de dos eslabones que Ash puede negar: el
 * primero menor (Upstart Goblin, Terraforming, Foolish Burial, Reinforcement of the Army) y el segundo, Stratos al Invocarse (un cuerpo y una búsqueda). El bot tiene en la mano
 * una Ash, dos copias (una vez por turno: es la última igual) o Ash y Ghost Ogre, y nada más que responda. Mide contra qué eslabón las usa, en los tres mazos (`mayInterrupt`); aparte,
 * la línea de un solo eslabón (lo que cuesta guardarla). Antes de `mayInterrupt` se medía 0 de 12 contra Stratos, 12 de 12 contra el primero y 3 de 3 con un solo eslabón. Informe en
 * CORE_DATA_DIR.
 */

const ASH = 14558127
const OGRE = 59438930
const UPSTART = 70368879
const TERRAFORMING = 73628505
const SOGEN = 86318356
const FOOLISH = 81439173
const ROTA = 32807846
const STRATOS = 40044918
const AVIAN = 21844576
/** Lo demás de su mano: cartas que no responden en tu turno. */
const QUIET: Record<string, number[]> = { 'sky-striker': [SKY.raye, SKY.engage, SKY.rota, SKY.desires], angelechy: [A.desires, A.terraforming, A.burial, A.score], elfnote: [E.treasure, E.treasure, E.treasure, E.vidolium] }
const DECKS = ['sky-striker', 'angelechy', 'elfnote'] as const

interface Line {
  name: string
  hand: number[]
  deck: number[]
  steps: { do: 'summon' | 'activate'; code: number }[]
  /** El eslabón que importa (el código de tu carta). */
  key: number
  /** Lo que buscás primero (si no, lo primero tuyo que te ofrece). */
  pick?: number[]
}

const LINES: Line[] = [
  { name: 'Upstart Goblin y Stratos', hand: [UPSTART, STRATOS], deck: [AVIAN, AVIAN], steps: [{ do: 'activate', code: UPSTART }, { do: 'summon', code: STRATOS }], key: STRATOS },
  { name: 'Terraforming y Stratos', hand: [TERRAFORMING, STRATOS], deck: [SOGEN, AVIAN], steps: [{ do: 'activate', code: TERRAFORMING }, { do: 'summon', code: STRATOS }], key: STRATOS },
  { name: 'Foolish Burial y Stratos', hand: [FOOLISH, STRATOS], deck: [AVIAN, AVIAN], steps: [{ do: 'activate', code: FOOLISH }, { do: 'summon', code: STRATOS }], key: STRATOS },
  { name: 'Reinforcement of the Army y Stratos', hand: [ROTA], deck: [STRATOS, AVIAN], steps: [{ do: 'activate', code: ROTA }, { do: 'summon', code: STRATOS }], key: STRATOS, pick: [STRATOS] },
]
const SINGLE: Line = { name: 'sólo Stratos', hand: [STRATOS], deck: [AVIAN], steps: [{ do: 'summon', code: STRATOS }], key: STRATOS }

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

const IDLE = { summon: 'summons', activate: 'activates' } as const
const ACTION = { summon: 0, activate: 5 } as const

/** Vos: tus jugadas en orden, tus efectos opcionales sí, lo que buscás o mandás es lo tuyo; lo demás, como el pasivo. */
function player(line: Line, own: ReadonlySet<number>) {
  const passive = passivePolicy()
  let next = 0

  return {
    get done() {
      return next >= line.steps.length
    },
    answer(ask: CoreAsk): CoreAnswer {
      if (ask.type === 'select_idlecmd') {
        const step = line.steps[next]
        const index = step ? ask[IDLE[step.do]].findIndex((card) => card.code === step.code) : -1

        if (!step || index < 0) return { type: ask.type, action: 7, index: null }
        next += 1
        return { type: ask.type, action: ACTION[step.do], index }
      }
      if (ask.type === 'select_effectyn') return { type: ask.type, yes: own.has(ask.code) }
      if (ask.type === 'select_chain' && ask.selects.some((card) => own.has(card.code) && card.controller === ask.player)) return { type: ask.type, index: ask.selects.findIndex((card) => own.has(card.code) && card.controller === ask.player) }
      if (ask.type === 'select_card' && ask.min <= 1) {
        const mine = (card: (typeof ask.selects)[number]) => own.has(card.code) && card.controller === ask.player
        const wanted = ask.selects.findIndex((card) => mine(card) && (line.pick?.includes(card.code) ?? false))
        const index = wanted >= 0 ? wanted : ask.selects.findIndex(mine)

        if (index >= 0) return { type: ask.type, indices: [index] }
      }
      return passive(ask)
    },
  }
}

describe.skipIf(!hasCoreData)('cuándo interrumpe el bot con mazo (npm run test:auto)', () => {
  const rows = hasCoreData ? cardRows() : []
  const source = nodeSource(rows, hasCoreData ? scriptStore() : { read: () => null, has: () => false })
  const loader = createDataLoader(source, null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const report: Record<string, unknown> = {}

  afterAll(() => {
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'bot-interrupt-report.json'), JSON.stringify(report, null, 1))
  })

  /** Tu turno 1 con esa línea contra el bot de ese mazo con `interrupts` en la mano: contra qué eslabones tuyos (códigos) usó alguna. */
  async function duel(deck: (typeof DECKS)[number], line: Line, interrupts: number[]) {
    const { filler } = await source.manifest()
    const list = botDeckOf(deck)!.list
    const inner = botDeckOf(deck)!.bot(
      (code) => cards.get(code),
      (code) => cards.get(code)?.alias ?? 0,
      (code) => cards.get(code)?.attribute ?? 0,
    )
    const hit: number[] = []
    const bot: Bot = (ask, view, context) => {
      const decision = inner(ask, view, context)

      if (ask.type === 'select_chain' && decision.answer.type === 'select_chain' && decision.answer.index !== null && interrupts.includes(ask.selects[decision.answer.index]?.code ?? 0)) hit.push(view.chain.at(-1)?.code ?? 0)
      return decision
    }
    const own = [...line.hand, ...line.deck]
    const mine = [...own, ...filler.slice(0, 40 - own.length)]
    const session = createAutoSession({
      loader,
      deck: { main: mine.map((code) => [code, 1] as const), extra: [] },
      hand: line.hand,
      handSize: line.hand.length,
      seed: 7,
      botSeed: 7,
      seat: 0,
      transport: localTransport({ wasmBinary: wasm }),
      rival: { main: list.main, extra: list.extra, hand: () => [...interrupts, ...QUIET[deck]!].slice(0, 5) },
      bot,
    })
    const me = player(line, new Set(own))
    let snapshot = await settled(session)

    for (let n = 0; n < 150 && snapshot.status === 'ready' && !(me.done && snapshot.ask?.ask.type === 'select_idlecmd' && snapshot.overlay.turn === 1); n += 1) {
      session.answer(me.answer(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    session.destroy()

    return { hit, fault: snapshot.fault }
  }

  it('con la última (una Ash, o dos copias: es una vez por turno) la guarda para el segundo eslabón; con Ash y Ghost Ogre niega los dos; con un solo eslabón, lo deja pasar', { timeout: 15 * 60 * 1000 }, async () => {
    const hands = { one: [ASH], copies: [ASH, ASH], two: [ASH, OGRE] }
    const runs: Record<string, Record<string, number[][]>> = { one: {}, copies: {}, two: {} }
    const single: Record<string, number[]> = {}

    for (const deck of DECKS) {
      for (const [kind, interrupts] of Object.entries(hands)) {
        runs[kind]![deck] = []
        for (const line of LINES) {
          const run = await duel(deck, line, interrupts)

          expect(run.fault, `${deck}, ${kind}, ${line.name}`).toBeNull()
          runs[kind]![deck]!.push(run.hit)
        }
      }
      single[deck] = (await duel(deck, SINGLE, [ASH])).hit
    }
    const count = (kind: string, test: (hit: number[], line: Line) => boolean) => Object.values(runs[kind]!).flatMap((all) => all.filter((hit, i) => test(hit, LINES[i]!))).length
    const measured = {
      lines: LINES.length * DECKS.length,
      key: { one: count('one', (hit, line) => hit.includes(line.key)), copies: count('copies', (hit, line) => hit.includes(line.key)) },
      first: { one: count('one', (hit, line) => hit.includes(line.steps[0]!.code)), copies: count('copies', (hit, line) => hit.includes(line.steps[0]!.code)) },
      // Con otra de reserva, la primera va contra tu primer eslabón, como antes (con Reinforcement negada, Stratos no llega).
      spare: { first: count('two', (hit, line) => hit[0] === line.steps[0]!.code), both: count('two', (hit) => hit.length === 2) },
      single: Object.values(single).filter((hit) => hit.length > 0).length,
    }

    report.measured = { ...measured, runs, single }
    console.log(JSON.stringify(measured))
    expect(measured).toEqual({ lines: 12, key: { one: 12, copies: 12 }, first: { one: 0, copies: 0 }, spare: { first: 12, both: 9 }, single: 0 })
  })
})
