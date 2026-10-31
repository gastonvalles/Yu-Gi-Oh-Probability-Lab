import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { Bot } from '../app/auto/bot/bot'
import { botDeckOf } from '../app/auto/bot/decks'
import { handtrapBot } from '../app/auto/bot/rivals'
import { turnBot } from '../app/auto/bot/turn'
import { localTransport } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import type { AutoEvent, CoreAnswer, CoreAsk } from '../app/auto/protocol'
import { autoRival, type HandtrapConfig } from '../app/handtraps'
import { shuffleWithSeed } from '../app/practice-mat'
import { cardRows, CORE_DATA_DIR, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * La privacidad del bot, capa 3 (metamórfica, con el núcleo real; lento: `npm run test:auto`). Tres líneas tuyas guionadas por código (buscar con una Mágica, el efecto de un monstruo al
 * Invocarse y una Battle Phase con ataques), cada una en 8 versiones con lo público igual y lo oculto distinto (las cartas de tu mano que no se juegan, la que colocás, el resto del Deck y
 * el Extra), con la misma semilla del duelo y el mismo rival de handtraps (la sesión de verdad). En cada decisión del bot, su vista y lo que decidió (respuesta y motivo) tienen que ser
 * iguales en las 8. El control: un bot tramposo (no usa nada si tu mano real tiene Called by the Grave) tiene que fallar la misma prueba; si deja de fallar, la prueba no prueba nada.
 * Límite: demuestra que el bot no depende de lo oculto en estos escenarios; lo general lo dicen la capa 1 y la 2 (`auto-bot-privacy.test.ts`, `auto-bot.test.ts`) y el oráculo del fuzz.
 * Aparte informa cuánto difiere lo que le llega a su asiento tal cual (los `waiting` y `stats`: el canal lateral que la vista no deja pasar), en CORE_DATA_DIR.
 * Todo dos veces: con el rival de handtraps y con el que además juega su turno (`turnBot`: Invoca, barre, Tributa tus monstruos y ataca; su tramposo, con Called by the Grave
 * en tu mano, termina su turno sin jugar), y una tercera con Evenly Matched en su mano (cuenta tus cartas del campo, la oculta también). Sin Harpie's Feather Duster: destruir lo que colocaste lo mostraría, y desde ahí lo público ya sería distinto.
 */

const ASH = 14558127
const MAXX = 23434538
const VEILER = 97268402
const IMPERM = 10045474
const OGRE = 59438930
const CALLED = 24224830
const TERRAFORMING = 73628505
const SOGEN = 86318356
const ROTA = 32807846
const CELTIC = 91152256
const STRATOS = 40044918
const AVIAN = 21844576
const MIRROR = 44095762
const SOLEMN = 41420027
const TORRENTIAL = 53582587

const IDLE = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
const ACTION = { summon: 0, set: 4, activate: 5 } as const
type Step = { do: keyof typeof ACTION; code: number } | { do: 'battle' }

interface Line {
  name: string
  /** Lo que jugás de la mano y lo que buscás del deck: igual en las 8 versiones. */
  hand: number[]
  deck: number[]
  /** En orden: lo que no se puede todavía espera al turno siguiente; `set` sin código coloca la carta oculta de la versión. */
  steps: (Step | { do: 'set' })[]
  /** Lo que se elige al buscar y los efectos propios que sí se activan. */
  wants: number[]
}

const LINES: Line[] = [
  { name: 'buscar con una Mágica', hand: [TERRAFORMING, ROTA], deck: [SOGEN, CELTIC, CELTIC], steps: [{ do: 'activate', code: TERRAFORMING }, { do: 'set' }, { do: 'activate', code: ROTA }, { do: 'summon', code: CELTIC }], wants: [SOGEN, CELTIC] },
  { name: 'el efecto de un monstruo al Invocarse', hand: [STRATOS], deck: [AVIAN], steps: [{ do: 'summon', code: STRATOS }, { do: 'set' }, { do: 'battle' }], wants: [STRATOS, AVIAN] },
  { name: 'una Battle Phase con ataques', hand: [CELTIC, CELTIC], deck: [], steps: [{ do: 'summon', code: CELTIC }, { do: 'set' }, { do: 'summon', code: CELTIC }, { do: 'battle' }], wants: [] },
]

/** Lo oculto que se sortea: dos cartas de la mano que nunca se juegan (con respuestas, para que el núcleo te pregunte de más), la que colocás, dos del Extra y el resto del Deck. */
const HAND_POOL = [CALLED, ASH, VEILER, IMPERM, MIRROR, SOLEMN]
const SET_POOL = [MIRROR, SOLEMN, TORRENTIAL, CALLED, IMPERM]
const EXTRA_POOL = [41999284, 44508094, 97204936, 45815891, 50091196]
const VERSIONS = 8
/** El rival: las cinco en la mano, siempre (cinco copias y mano de cinco). */
const RIVAL: HandtrapConfig = { enabled: true, picks: [ASH, MAXX, VEILER, IMPERM, OGRE].map((id) => ({ id, name: '', copies: 1 })), hand: 5 }
/** El que juega su turno: Ash, Blazing Inpachi (un Normal para Invocar y atacar), Raigeki, Lava Golem y Gallant Bandit en la mano. */
const RIVAL_TURN: HandtrapConfig = { enabled: true, picks: [ASH, 5464695, 12580477, 102380, 24203749].map((id) => ({ id, name: '', copies: 1 })), hand: 5, ownTurn: true }
/** Evenly Matched cuenta tus cartas del campo, también la que colocás (oculta): con Ash y Veiler, en la mano y sin jugar su turno. */
const RIVAL_EVENLY: HandtrapConfig = { enabled: true, picks: [15693423, ASH, VEILER].map((id) => ({ id, name: '', copies: 1 })), hand: 3 }
/** El ejecutor de Sky Striker (`botDeck`): su lista fija, su mano del barajado de su deck (la misma semilla en las 8) y su turno entero (Enlaces, Mágicas, ataques). */
const RIVAL_SKY: HandtrapConfig = { enabled: false, picks: [], hand: 3, botDeck: 'sky-striker' }
/** El ejecutor de Despia Branded: igual (Fusiones del Deck, Mirrorjade y lo colocado en tu turno). */
const RIVAL_BRANDED: HandtrapConfig = { enabled: false, picks: [], hand: 3, botDeck: 'branded' }
/**
 * El ejecutor de Elfnote: igual (Sincronías en el centro, Lars, Lucina y Fortuna en tu turno), pero empieza él (`seat: 1` es el tuyo): yendo segundo te gana en su primer turno con
 * casi cualquier mano y la línea no llega a jugarse. Así la jugás en tus turnos 2 y 4 contra su campo; si te gana en su turno 3, se compara hasta ahí.
 */
const RIVAL_ELFNOTE: HandtrapConfig = { enabled: false, picks: [], hand: 3, botDeck: 'elfnote' }
const MODES: { name: string; config: HandtrapConfig; file: string; seat?: 0 | 1 }[] = [
  { name: 'el rival de handtraps', config: RIVAL, file: 'bot-privacy-report.json' },
  { name: 'el rival que juega su turno', config: RIVAL_TURN, file: 'bot-privacy-turn-report.json' },
  { name: 'el rival con Evenly Matched', config: RIVAL_EVENLY, file: 'bot-privacy-evenly-report.json' },
  { name: 'el bot de Sky Striker', config: RIVAL_SKY, file: 'bot-privacy-sky-report.json' },
  { name: 'el bot de Despia Branded', config: RIVAL_BRANDED, file: 'bot-privacy-branded-report.json' },
  { name: 'el bot de Elfnote', config: RIVAL_ELFNOTE, file: 'bot-privacy-elfnote-report.json', seat: 1 },
]

function player(line: Line, setCode: number) {
  const passive = passivePolicy()
  const steps = line.steps.map((step) => (step.do === 'set' ? { do: 'set' as const, code: setCode } : step))
  const own = new Set([...line.hand, ...line.deck])
  let next = 0

  return {
    get done() {
      return next >= steps.length
    },
    answer(ask: CoreAsk): CoreAnswer {
      if (ask.type === 'select_idlecmd') {
        const step = steps[next]

        if (step?.do === 'battle') {
          if (!ask.to_bp) return { type: ask.type, action: 7, index: null }
          next += 1
          return { type: ask.type, action: 6, index: null }
        }
        const index = step ? ask[IDLE[ACTION[step.do]]].findIndex((card) => card.code === step.code) : -1

        if (!step || index < 0) return { type: ask.type, action: 7, index: null }
        next += 1
        return { type: ask.type, action: ACTION[step.do], index }
      }
      if (ask.type === 'select_battlecmd') return ask.attacks.length > 0 ? { type: ask.type, action: 1, index: 0 } : { type: ask.type, action: ask.to_ep ? 3 : 2, index: null }
      if (ask.type === 'select_effectyn') return { type: ask.type, yes: own.has(ask.code) }
      if (ask.type === 'select_card') {
        const index = ask.selects.findIndex((card) => line.wants.includes(card.code))

        if (index >= 0 && ask.min <= 1) return { type: ask.type, indices: [index] }
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

describe.skipIf(!hasCoreData).each(MODES)('el bot no depende de lo que no ve (metamórfica, npm run test:auto): $name', ({ config, file, seat = 0 }) => {
  const rows = hasCoreData ? cardRows() : []
  const facts = new Map(rows.map((row) => [row.id, { type: row.type, attack: row.atk, defense: row.def, level: row.level & 0xff }]))
  const store = scriptStore()
  const source = nodeSource(rows, store)
  const loader = createDataLoader(source, null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const rival = autoRival(config)!
  const report: Record<string, unknown> = {}

  afterAll(() => {
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, file), JSON.stringify(report, null, 1))
  })

  /** Las 8 versiones de lo oculto, con semilla fija; la 0 lleva Called by the Grave en la mano y la 1 no (lo que mira el bot tramposo). */
  async function versionsOf(line: Line) {
    const { filler } = await source.manifest()
    const used = new Set([...line.hand, ...line.deck, ...HAND_POOL, ...SET_POOL])
    const free = filler.filter((code) => !used.has(code))

    return Array.from({ length: VERSIONS }, (_, k) => {
      const mixed = shuffleWithSeed(HAND_POOL, 100 + k)
      const hidden = k === 0 ? [CALLED, ...mixed.filter((code) => code !== CALLED)].slice(0, 2) : k === 1 ? mixed.filter((code) => code !== CALLED).slice(0, 2) : mixed.slice(0, 2)
      const set = shuffleWithSeed(SET_POOL, 200 + k)[0]!
      const extra = shuffleWithSeed(EXTRA_POOL, 300 + k).slice(0, 2)
      const hand = [...line.hand, set, ...hidden]
      const rest = shuffleWithSeed(free, 400 + k).slice(0, 40 - hand.length - line.deck.length)

      return { hidden, set, extra, hand, main: [...hand, ...line.deck, ...rest] }
    })
  }

  /** Un duelo de la sesión de verdad hasta tu turno 3 hecho: lo que el bot vio y decidió en cada pregunta suya (con `cheat`, el tramposo), y lo que le llegó a su asiento tal cual. */
  async function duel(line: Line, version: Awaited<ReturnType<typeof versionsOf>>[number], cheat = false) {
    const deck = botDeckOf(rival.botDeck)
    const honest = deck ? deck.bot((code) => facts.get(code)) : rival.ownTurn ? turnBot(rival.main.map(([code]) => code), rival.extra.map(([code]) => code), undefined, undefined, (code) => facts.get(code)) : handtrapBot(rival.main.map(([code]) => code), rival.extra.map(([code]) => code))
    const decisions: string[] = []
    const bot: Bot = (ask, view, context) => {
      const decision = honest(ask, view, context)
      // Hace trampa: mira tu mano real (lo que sabe la prueba, no la vista) y, si tenés Called by the Grave, no usa nada (ni juega su turno).
      const peeks = cheat && version.hidden.includes(CALLED)
      const out =
        peeks && ask.type === 'select_chain' && !ask.forced
          ? { answer: { type: 'select_chain' as const, index: null } }
          : peeks && ask.type === 'select_idlecmd' && view.turnPlayer === 'me' && ask.to_ep
            ? { answer: { type: 'select_idlecmd' as const, action: 7, index: null } }
            : decision

      decisions.push(JSON.stringify({ ask, view, decision: out }))
      return out
    }
    const raw: string[] = []
    const session = createAutoSession({
      loader,
      deck: { main: version.main.map((code) => [code, 1] as [number, number]), extra: version.extra.map((code) => [code, 1] as [number, number]) },
      hand: version.hand,
      handSize: version.hand.length,
      seed: 4242,
      botSeed: 7,
      seat,
      transport: localTransport({ wasmBinary: wasm }),
      rival,
      bot,
      onEvent: (event: AutoEvent) => {
        if (event.t === 'events' && event.seat === 1) raw.push(...event.events.map((item) => JSON.stringify(item)))
        if (event.t === 'stats' && event.seat === 1) raw.push(`stats ${JSON.stringify(event.cards)}`)
      },
    })
    const me = player(line, version.set)
    let snapshot = await settled(session)

    for (let n = 0; n < 200 && snapshot.status === 'ready' && snapshot.overlay.turn <= 3 + seat; n += 1) {
      session.answer(me.answer(snapshot.ask!.ask))
      snapshot = await settled(session)
    }
    session.destroy()

    return { decisions, raw, done: me.done, status: snapshot.status, fault: snapshot.fault, turn: snapshot.overlay.turn, reasons: snapshot.answers.flatMap((item) => (item.reason ? [item.reason.key] : [])) }
  }

  const firstDiff = (runs: string[][]) => {
    for (let k = 1; k < runs.length; k += 1) {
      const at = runs[k]!.findIndex((item, i) => item !== runs[0]![i])

      if (at >= 0 || runs[k]!.length !== runs[0]!.length) return { version: k, at: at >= 0 ? at : Math.min(runs[k]!.length, runs[0]!.length), lengths: [runs[0]!.length, runs[k]!.length] }
    }
    return null
  }

  it.each(LINES.map((line) => [line.name, line] as const))('%s: en las 8 versiones el bot ve y decide lo mismo', async (name, line) => {
    const versions = await versionsOf(line)
    const runs = []

    for (const version of versions) runs.push(await duel(line, version))
    // La línea se jugó entera y hasta tu turno 3 (o, si empieza el bot, hasta que te ganó), sin errores, en todas.
    expect(runs.map((run) => [(seat === 1 && run.status === 'ended') || (run.status === 'ready' && run.turn > 3 + seat && run.done), run.fault])).toEqual(runs.map(() => [true, null]))
    const noSide = (run: { raw: string[] }) => run.raw.filter((item) => !item.includes('"waiting"') && !item.startsWith('stats'))

    report[name] = {
      decisions: runs.map((run) => run.decisions.length),
      reasons: runs[0]!.reasons,
      rawItems: runs.map((run) => run.raw.length),
      rawDiffers: firstDiff(runs.map((run) => run.raw)) !== null,
      rawWithoutWaitingAndStatsDiffers: firstDiff(runs.map(noSide)) !== null,
    }
    expect(runs[0]!.decisions.length).toBeGreaterThan(5)
    expect(firstDiff(runs.map((run) => run.decisions))).toBeNull()
  })

  it('el control: un bot tramposo (mira tu mano real) falla la misma prueba en cada línea donde el bot usa algo', async () => {
    const caught: string[] = []

    for (const line of LINES) {
      const [withCalled, without] = (await versionsOf(line)).slice(0, 2) as [Awaited<ReturnType<typeof versionsOf>>[number], Awaited<ReturnType<typeof versionsOf>>[number]]
      const honest = await duel(line, withCalled)
      const runs = [await duel(line, withCalled, true), await duel(line, without, true)]
      const uses = honest.reasons.some((key) => /^auto\.bot\.reason\.(handtrap|play|battle)\./.test(key))

      if (firstDiff(runs.map((run) => run.decisions)) !== null) caught.push(line.name)
      if (uses) expect(caught).toContain(line.name)
    }
    report.cheatCaught = caught
    expect(caught.length).toBeGreaterThan(0)
  })
})
