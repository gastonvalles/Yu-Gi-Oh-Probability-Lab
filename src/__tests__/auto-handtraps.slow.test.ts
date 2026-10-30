import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { ChainStep } from '../app/auto/chain-feed'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { LOCATION as L, type AutoEvent, type CoreAnswer, type CoreAsk, type WireEvent } from '../app/auto/protocol'
import { AUTO_RULES, autoRival, HANDTRAP_CATALOG, type ExtraPick, type HandtrapConfig } from '../app/handtraps'
import { cardRows, CORE_DATA_DIR, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * Cada handtrap del simulador contra el núcleo real (lento: `npm run test:auto`; se salta sin datos). En un escenario armado a mano el rival
 * tiene esa carta en la mano (la sesión de verdad: su deck con el relleno, `handtrapPolicy` con su adaptador) y vos hacés la jugada que la
 * provoca: el rival la activa sola, el núcleo la acepta (sin RETRY ni errores de script) y se resuelve con su efecto. Las cartas de los
 * escenarios son de uso común (Terraforming, Foolish Burial, Monster Reborn, Elemental HERO Stratos…); el informe va a CORE_DATA_DIR.
 */

const ASH = 14558127
const MAXX = 23434538
const VEILER = 97268402
const IMPERM = 10045474
const OGRE = 59438930
const BELLE = 73642297
const MOURNER = 52038442
const NIBIRU = 27204311
const DROLL = 94145022
const GAMMA = 38814750
const CROW = 24508238
const DOMINUS = 40366667
const PURGE = 97045737
const SPARK = 6325660
const SPIRAL = 42091632
const FUWALOS = 42141493
const PURULIA = 84192580
const MEOWLS = 87126721
const DRIVER = 49036338
// Del buscador (fuera del catálogo), con su regla: Harmonia revela Sincros del Extra Deck del rival (`RIVAL_EXTRA`) y Delta Invoca a Driver.
const HARMONIA = 70088809
const DELTA = 74203495

const TERRAFORMING = 73628505
const SOGEN = 86318356
const FOOLISH = 81439173
const REBORN = 83764718
const STRATOS = 40044918
const AVIAN = 21844576
const KURIBOH = 40640057
const LINKURIBOH = 41999284
const BULB = 67441435
const OJAMA_TRIO = 29843091
const POT = 55144522

const IDLE = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
/** Una jugada tuya en un `select_idlecmd` (su `action`: 0 Normal, 1 Especial, 4 colocar una Mágica o Trampa, 5 activar). */
const ACTION = { summon: 0, spsummon: 1, set: 4, activate: 5 } as const
type Step = { do: keyof typeof ACTION; code: number }

interface Scenario {
  card: number
  /** Tu deck (sin contar la mano) y tu mano, arriba en ese orden. */
  deck: [number, number][]
  extra?: [number, number][]
  hand: number[]
  steps: Step[]
  /** Lo que tiene que haber pasado, mirando los eventos de tu asiento desde que el rival activó la handtrap. */
  check: (after: WireEvent[], all: WireEvent[]) => string | null
}

const chainingOf = (events: readonly WireEvent[], code: number, controller: 0 | 1) => events.findIndex((event) => event.type === 'chaining' && event.code === code && event.controller === controller)
const has = (events: readonly WireEvent[], test: (event: WireEvent) => boolean) => events.some(test)
const drewRival = (events: readonly WireEvent[]) => has(events, (event) => event.type === 'draw' && event.player === 1)
const negatedLink = (events: readonly WireEvent[], kind: 'chain_disabled' | 'chain_negated', link: number) => has(events, (event) => event.type === kind && event.chain_size === link)
/** Las handtraps de los escenarios que niegan un eslabón (`chain_negated` o `chain_disabled`). */
const NEGATES = new Set([ASH, VEILER, IMPERM, BELLE, GAMMA, DOMINUS, PURGE, DELTA])
/**
 * Las que niegan con un efecto que queda (los efectos del monstruo, hasta el final del turno): el núcleo dice «sin efecto» cuando le llega el turno al eslabón negado, no mientras se resuelve
 * la handtrap, así que no se sabe quién fue (sin `by`: la pantalla dice sólo «Sin efecto»).
 */
const BY_UNKNOWN = new Set([VEILER, IMPERM])
/** El código del eslabón que negó cada negación (`ChainStep.by`), en orden; null si el adaptador no lo supo, -1 si apunta al mismo eslabón o a uno que no hay. */
const negatorsOf = (steps: readonly ChainStep[]) => {
  const links: number[] = []

  return steps.flatMap((step) => {
    if (step.kind === 'chain') {
      if (step.index === 0) links.length = 0
      links[step.index] = step.link?.code ?? 0
    }
    if (step.kind !== 'negated' && step.kind !== 'disabled') return []
    if (step.by === undefined) return [null]
    return [step.by >= 1 && step.by !== step.index + 1 && step.by <= links.length ? links[step.by - 1]! : -1]
  })
}
const moved = (events: readonly WireEvent[], card: number, from: number, to: number) => has(events, (event) => event.type === 'move' && event.card === card && (event.from.location & from) !== 0 && (event.to.location & to) !== 0)

/** Relleno de tu deck: Mágicas que nunca se juegan (así Foolish Burial y Monster Reborn sólo tienen el monstruo que se quiere). */
const SPELLS: [number, number][] = [[POT, 1]]

const SCENARIOS: Scenario[] = [
  {
    card: ASH,
    deck: [[SOGEN, 1], ...SPELLS],
    hand: [TERRAFORMING],
    steps: [{ do: 'activate', code: TERRAFORMING }],
    // Niega Terraforming: el Sogen no llega a tu mano.
    check: (after) => (negatedLink(after, 'chain_disabled', 1) && !moved(after, SOGEN, L.DECK, L.HAND) ? null : 'Terraforming no quedó negada'),
  },
  {
    card: MAXX,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [FOOLISH, REBORN],
    steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }],
    // A tu primera activación; después, tu Invocación Especial le hace robar.
    check: (after) => (drewRival(after) ? null : 'el rival no robó con tu Invocación Especial'),
  },
  {
    card: VEILER,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [STRATOS],
    steps: [{ do: 'summon', code: STRATOS }],
    // Apunta a Stratos y niega su efecto en la cadena: Avian no llega a tu mano.
    check: (after) => (has(after, (event) => event.type === 'become_target') && negatedLink(after, 'chain_disabled', 1) && !moved(after, AVIAN, L.DECK, L.HAND) ? null : 'Stratos no quedó negado'),
  },
  {
    card: IMPERM,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [STRATOS],
    steps: [{ do: 'summon', code: STRATOS }],
    check: (after) => (has(after, (event) => event.type === 'become_target') && negatedLink(after, 'chain_disabled', 1) && !moved(after, AVIAN, L.DECK, L.HAND) ? null : 'Stratos no quedó negado'),
  },
  {
    card: OGRE,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [STRATOS],
    steps: [{ do: 'summon', code: STRATOS }],
    // Destruye a Stratos.
    check: (after) => (moved(after, STRATOS, L.MZONE, L.GRAVE) ? null : 'Stratos no fue destruido'),
  },
  {
    card: BELLE,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [FOOLISH, REBORN],
    steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }],
    // Niega la activación de Monster Reborn (Invoca desde el cementerio): Avian se queda ahí.
    check: (after) => (negatedLink(after, 'chain_negated', 1) && !moved(after, AVIAN, L.GRAVE, L.MZONE) ? null : 'Monster Reborn no quedó negada'),
  },
  {
    card: MOURNER,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [FOOLISH, REBORN],
    steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }],
    // Cuando Invocás de modo Especial: apunta al monstruo Invocado.
    check: (after) => (has(after, (event) => event.type === 'become_target') && has(after, (event) => event.type === 'chain_solved') ? null : 'no apuntó al monstruo Invocado'),
  },
  {
    card: NIBIRU,
    // Dos Avian: en el turno 3 robás una de las dos y la otra sigue en el deck para Foolish Burial.
    deck: [[AVIAN, 2], ...SPELLS],
    hand: [OJAMA_TRIO, KURIBOH, FOOLISH, REBORN],
    // Ojama Trio es una Trampa: se coloca en tu primer turno y en el siguiente, tres Fichas Ojama (en el campo del rival, Invocadas por vos), Kuriboh y Avian revivido: la quinta Invocación.
    steps: [{ do: 'set', code: OJAMA_TRIO }, { do: 'activate', code: OJAMA_TRIO }, { do: 'summon', code: KURIBOH }, { do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }],
    // Sacrifica lo que hay boca arriba y se Invoca al campo del rival.
    check: (after) => (has(after, (event) => event.type === 'move' && event.card === NIBIRU && event.to.controller === 1 && event.to.location === L.MZONE) ? null : 'Nibiru no se Invocó'),
  },
  {
    card: DROLL,
    deck: [[SOGEN, 1], [AVIAN, 1], ...SPELLS],
    hand: [TERRAFORMING, STRATOS],
    // Buscás con Terraforming; después, el efecto de Stratos ya no puede sumar del deck.
    steps: [{ do: 'activate', code: TERRAFORMING }, { do: 'summon', code: STRATOS }],
    check: (after) => (has(after, (event) => event.type === 'chain_solved') && !moved(after, AVIAN, L.DECK, L.HAND) ? null : 'después de Droll se sumó una carta del deck'),
  },
  {
    card: GAMMA,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [STRATOS],
    steps: [{ do: 'summon', code: STRATOS }],
    // Niega la activación de Stratos, lo destruye e Invoca a Gamma y a PSY-Frame Driver.
    check: (after) => (negatedLink(after, 'chain_negated', 1) && has(after, (event) => event.type === 'move' && event.card === DRIVER && event.to.location === L.MZONE) ? null : 'Gamma no negó a Stratos ni Invocó a Driver'),
  },
  {
    card: DELTA,
    deck: [[SOGEN, 1], ...SPELLS],
    hand: [TERRAFORMING],
    steps: [{ do: 'activate', code: TERRAFORMING }],
    // Niega Terraforming (una Mágica) e Invoca a Delta y a PSY-Frame Driver.
    check: (after) => (negatedLink(after, 'chain_negated', 1) && has(after, (event) => event.type === 'move' && event.card === DRIVER && event.to.location === L.MZONE) ? null : 'Delta no negó Terraforming ni Invocó a Driver'),
  },
  {
    card: HARMONIA,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [STRATOS],
    steps: [{ do: 'summon', code: STRATOS }],
    // Contra el efecto de Stratos en el campo: revela 5 Sincros de su Extra, se Invoca, manda una al cementerio y destruye a Stratos.
    check: (after) =>
      has(after, (event) => event.type === 'move' && event.card === HARMONIA && event.to.controller === 1 && event.to.location === L.MZONE) &&
      has(after, (event) => event.type === 'move' && event.from.controller === 1 && event.from.location === L.EXTRA && event.to.location === L.GRAVE) &&
      moved(after, STRATOS, L.MZONE, L.GRAVE)
        ? null
        : 'Harmonia no se Invocó, no mandó un Sincro al cementerio o no destruyó a Stratos',
  },
  {
    card: CROW,
    deck: [[BULB, 1], ...SPELLS],
    hand: [FOOLISH],
    // Mandás Glow-Up Bulb al cementerio y activás su efecto desde ahí: D.D. Crow lo destierra y no se Invoca.
    steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: BULB }],
    check: (after) => (moved(after, BULB, L.GRAVE, L.REMOVED) && !moved(after, BULB, L.GRAVE, L.MZONE) ? null : 'Glow-Up Bulb no quedó desterrado'),
  },
  {
    card: DOMINUS,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [FOOLISH, REBORN],
    steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }],
    // Niega Monster Reborn (incluye Invocar de modo Especial).
    check: (after) => (negatedLink(after, 'chain_disabled', 1) && !moved(after, AVIAN, L.GRAVE, L.MZONE) ? null : 'Monster Reborn no quedó negada'),
  },
  {
    card: PURGE,
    deck: [[SOGEN, 1], ...SPELLS],
    hand: [TERRAFORMING],
    steps: [{ do: 'activate', code: TERRAFORMING }],
    // Niega Terraforming (suma del deck a la mano): el Sogen no llega a tu mano.
    check: (after) => (negatedLink(after, 'chain_disabled', 1) && !moved(after, SOGEN, L.DECK, L.HAND) ? null : 'Terraforming no quedó negada'),
  },
  {
    card: SPARK,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [MAXX, STRATOS],
    // Tu Maxx "C" (un efecto de monstruo en la mano: desde ahí puede activarla de la mano) y después el efecto de Stratos en el campo.
    steps: [{ do: 'activate', code: MAXX }, { do: 'summon', code: STRATOS }],
    check: (after) => (moved(after, STRATOS, L.MZONE, L.REMOVED) ? null : 'Stratos no quedó desterrado'),
  },
  {
    card: SPIRAL,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [MAXX, STRATOS],
    steps: [{ do: 'activate', code: MAXX }, { do: 'summon', code: STRATOS }],
    check: (after) => (moved(after, STRATOS, L.MZONE, L.HAND) ? null : 'Stratos no volvió a tu mano'),
  },
  {
    card: FUWALOS,
    deck: SPELLS,
    extra: [[LINKURIBOH, 1]],
    hand: [KURIBOH],
    // A tu Invocación Normal; tu Invocación por Enlace (desde el Extra) le hace robar.
    steps: [{ do: 'summon', code: KURIBOH }, { do: 'spsummon', code: LINKURIBOH }],
    check: (after) => (drewRival(after) ? null : 'el rival no robó con tu Invocación desde el Extra'),
  },
  {
    card: PURULIA,
    deck: [[SOGEN, 1], ...SPELLS],
    hand: [TERRAFORMING, KURIBOH],
    // A tu primera activación; tu Invocación Normal (desde la mano) le hace robar.
    steps: [{ do: 'activate', code: TERRAFORMING }, { do: 'summon', code: KURIBOH }],
    check: (after) => (drewRival(after) ? null : 'el rival no robó con tu Invocación Normal'),
  },
  {
    card: MEOWLS,
    deck: [[AVIAN, 1], ...SPELLS],
    hand: [FOOLISH, REBORN],
    // A tu primera activación; revivir desde el cementerio le hace robar.
    steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }],
    check: (after) => (drewRival(after) ? null : 'el rival no robó con tu Invocación desde el cementerio'),
  },
]

/** Tus respuestas: los pasos en orden (en cada `select_idlecmd`, la jugada con esa carta); tus efectos opcionales, sí; no respondés a cadenas; lo demás, como el pasivo. */
function player(steps: readonly Step[]) {
  const passive = passivePolicy()
  let next = 0

  return {
    get done() {
      return next >= steps.length
    },
    answer(ask: CoreAsk, own: ReadonlySet<number>): CoreAnswer {
      if (ask.type === 'select_idlecmd') {
        const step = steps[next]
        const index = step ? ask[IDLE[ACTION[step.do]]].findIndex((card) => card.code === step.code) : -1

        // Lo que todavía no se puede (una Trampa recién colocada) espera al turno siguiente.
        if (!step || index < 0) return { type: ask.type, action: 7, index: null }
        next += 1

        return { type: ask.type, action: ACTION[step.do], index }
      }
      if (ask.type === 'select_effectyn') return { type: ask.type, yes: own.has(ask.code) }
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

describe.skipIf(!hasCoreData)('las handtraps del rival contra el núcleo real (npm run test:auto)', () => {
  const rows = hasCoreData ? cardRows() : []
  const store = scriptStore()
  const loader = createDataLoader(nodeSource(rows, store), null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const names = new Map(rows.map((row) => [row.id, row.name ?? String(row.id)]))
  const report: Record<string, unknown>[] = []

  afterAll(() => {
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'handtraps-report.json'), JSON.stringify(report, null, 1))
  })

  it('toda carta con regla tiene escenario, y el catálogo entero tiene regla', () => {
    expect(new Set(SCENARIOS.map((scenario) => scenario.card))).toEqual(new Set(Object.keys(AUTO_RULES).map(Number)))
    expect(HANDTRAP_CATALOG.filter((card) => !AUTO_RULES[card.id])).toEqual([])
  })

  /** Un duelo de la sesión de verdad: tu deck y tu mano, tus pasos, y el rival del simulador con `config` (sus handtraps, su mano y su Extra Deck). Termina cuando hiciste todo. */
  async function duel(scenario: Pick<Scenario, 'deck' | 'extra' | 'hand' | 'steps'>, config: HandtrapConfig) {
    const events: WireEvent[] = []
    /** Lo que el núcleo le ofreció al rival en cada ventana de cadena (códigos), en orden. */
    const offers: number[][] = []
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
      },
    })
    const me = player(scenario.steps)
    const own = new Set(deck.main.map(([code]) => code))
    let snapshot = await settled(session)
    // Su mano, como la ve él: la que repartió el simulador.
    const handAtStart = snapshot.rivalHand

    // Hasta que hiciste todo y vuelve a ser tu turno de elegir (o el tope).
    for (let n = 0; n < 120 && snapshot.status === 'ready' && !(me.done && snapshot.ask?.ask.type === 'select_idlecmd'); n += 1) {
      session.answer(me.answer(snapshot.ask!.ask, own))
      snapshot = await settled(session)
    }
    session.destroy()

    return { events, offers, snapshot, handAtStart }
  }

  it.each(SCENARIOS.map((scenario) => [names.get(scenario.card) ?? String(scenario.card), scenario] as const))('%s: el rival la usa sola y se resuelve', async (_name, scenario) => {
    // El rival de la pantalla: el del simulador con esa sola carta (con Gamma o Delta, también PSY-Frame Driver en su deck) y el Extra Deck de siempre.
    const { events, offers, snapshot, handAtStart } = await duel(scenario, { enabled: true, picks: [{ id: scenario.card, name: names.get(scenario.card) ?? '', copies: 1 }], hand: 1 })

    const at = chainingOf(events, scenario.card, 1)
    const outcome = at >= 0 ? scenario.check(events.slice(at), events) : 'el rival no la activó'
    const faults = snapshot.faults.filter((fault) => fault.kind !== 'script' || !fault.message.startsWith('card data'))

    report.push({ card: names.get(scenario.card), offers, activated: at >= 0, outcome, status: snapshot.status, faults, rival: snapshot.answers.filter((item) => item.seat === 1 && JSON.stringify(item.answer) !== '{"type":"select_chain","index":null}').map((item) => item.answer) })

    expect({ status: snapshot.status, fault: snapshot.fault, faults, outcome }).toEqual({ status: 'ready', fault: null, faults: [], outcome: null })
    // Quién negó (`ChainStep.by`, deducido por el adaptador: el núcleo no lo dice): toda negación de estos escenarios es de la handtrap y apunta a su eslabón, o no se sabe (`BY_UNKNOWN`).
    const negators = negatorsOf(snapshot.chainSteps)

    report.at(-1)!.negators = negators
    expect(negators.length > 0).toBe(NEGATES.has(scenario.card))
    expect(negators).toEqual(negators.map(() => (BY_UNKNOWN.has(scenario.card) ? null : scenario.card)))
    // Las que roban (`draw`) ya las usó en tu Standby Phase, antes de tu primera pregunta.
    expect(handAtStart).toEqual(AUTO_RULES[scenario.card] === 'draw' ? [] : [scenario.card])
    expect(snapshot.rivalHand).not.toContain(scenario.card)
  })

  it('Dominus Impulse y Dominus Purge en la misma mano: cada una tiene su «1 por turno», así que usa las dos en tu turno (antes Purge no tenía regla y la guardaba)', async () => {
    const picks = [DOMINUS, PURGE].map((id) => ({ id, name: names.get(id) ?? '', copies: 1 }))
    const steps: Step[] = [{ do: 'activate', code: TERRAFORMING }, { do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }]
    const { events, snapshot } = await duel({ deck: [[SOGEN, 1], [AVIAN, 1], ...SPELLS], hand: [TERRAFORMING, FOOLISH, REBORN], steps }, { enabled: true, picks, hand: 2 })

    expect(snapshot.fault).toBeNull()
    // Purge contra Terraforming (suma del deck) e Impulse contra Monster Reborn (Invoca).
    expect(events.flatMap((event) => (event.type === 'chaining' && event.controller === 1 ? [event.code] : []))).toEqual([PURGE, DOMINUS])
    expect(moved(events, SOGEN, L.DECK, L.HAND) || moved(events, AVIAN, L.GRAVE, L.MZONE)).toBe(false)
  })

  it('cada Dominus usada desde la mano le prohíbe al rival los efectos de monstruo de sus Atributos (Purge: OSCURIDAD, AGUA y FUEGO; Impulse: LUZ, TIERRA y VIENTO) y nada más: la otra Dominus sigue', async () => {
    const steps: Step[] = [{ do: 'activate', code: TERRAFORMING }, { do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }, { do: 'summon', code: STRATOS }]
    const scenario = { deck: [[SOGEN, 1], [AVIAN, 2], ...SPELLS] as [number, number][], hand: [TERRAFORMING, FOOLISH, REBORN, STRATOS], steps }
    const hand = (ids: number[]) => ({ enabled: true, picks: ids.map((id) => ({ id, name: names.get(id) ?? '', copies: 1 })), hand: ids.length })
    // Sin Dominus: Ash (FUEGO) contra Terraforming y Veiler (LUZ) contra el efecto de Stratos.
    const control = await duel(scenario, hand([VEILER, ASH]))
    // Con las Dominus primero: Purge contra Terraforming e Impulse contra Monster Reborn; después ni Ash ni Veiler se ofrecen.
    const { events, offers, snapshot } = await duel(scenario, hand([PURGE, DOMINUS, VEILER, ASH]))
    const used = (list: readonly WireEvent[]) => list.flatMap((event) => (event.type === 'chaining' && event.controller === 1 ? [event.code] : []))
    const after = (code: number) => offers.slice(offers.findIndex((offer) => offer.includes(code)) + 1)

    expect(used(control.events)).toEqual([ASH, VEILER])
    expect(snapshot.fault).toBeNull()
    expect(used(events)).toEqual([PURGE, DOMINUS])
    expect(after(PURGE).flat()).not.toContain(ASH)
    expect(after(PURGE).flat()).toContain(DOMINUS)
    expect(after(DOMINUS).flat()).not.toContain(VEILER)
  })

  it.each([MAXX, FUWALOS, PURULIA, MEOWLS].map((card) => [names.get(card) ?? String(card), card] as const))('%s: la usa en tu Standby Phase, como se juega (el núcleo se la ofrece ahí), no a tu primera jugada', async (_name, card) => {
    const { events } = await duel({ deck: [[AVIAN, 1], ...SPELLS], hand: [STRATOS], steps: [{ do: 'summon', code: STRATOS }] }, { enabled: true, picks: [{ id: card, name: '', copies: 1 }], hand: 1 })
    const phase = (id: number) => events.findIndex((event) => event.type === 'new_phase' && event.phase === id)
    const at = chainingOf(events, card, 1)

    // PHASE_STANDBY = 2, PHASE_MAIN1 = 4.
    expect(at).toBeGreaterThan(phase(2))
    expect(at).toBeLessThan(phase(4))
  })

  describe('el Extra Deck del rival y Fydraulis Harmonia (revela hasta 5 Sincros de su Extra y manda uno al cementerio)', () => {
    const SYNCHROS = [97204936, 45815891, 44508094, 16527176, 50091196]
    const synchros = (codes: readonly number[]): ExtraPick[] => codes.map((id) => ({ id, name: names.get(id) ?? '', kind: 'synchro' }))
    const harmonia = (extra?: ExtraPick[]) =>
      duel({ deck: [[AVIAN, 1], ...SPELLS], hand: [STRATOS], steps: [{ do: 'summon', code: STRATOS }] }, { enabled: true, picks: [{ id: HARMONIA, name: '', copies: 1 }], hand: 1, ...(extra ? { extra } : {}) })
    /** Los Sincros que mandó de su Extra al cementerio. */
    const sent = (events: readonly WireEvent[]) => events.flatMap((event) => (event.type === 'move' && event.from.controller === 1 && event.from.location === L.EXTRA && event.to.location === L.GRAVE ? [event.card] : []))

    it('sin Extra Deck el núcleo no se la ofrece (no la usa); con el de siempre, sí', async () => {
      expect(chainingOf((await harmonia([])).events, HARMONIA, 1)).toBe(-1)
      expect(chainingOf((await harmonia()).events, HARMONIA, 1)).toBeGreaterThanOrEqual(0)
    })

    it('el orden de la lista es la preferencia: manda al cementerio el primer Sincro; reordenada, otro', async () => {
      expect(sent((await harmonia(synchros(SYNCHROS))).events)).toEqual([SYNCHROS[0]])
      expect(sent((await harmonia(synchros([SYNCHROS[2]!, ...SYNCHROS.filter((_, i) => i !== 2)]))).events)).toEqual([SYNCHROS[2]])
    })
  })
})
