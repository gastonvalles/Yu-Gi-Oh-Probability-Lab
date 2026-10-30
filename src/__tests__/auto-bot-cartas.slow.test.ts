import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { LOCATION as L, type CoreAsk, type WireEvent } from '../app/auto/protocol'
import { CORE_DATA_DIR, hasCoreData } from './support/core-data'
import { handtrapDuels, has, moved, type DuelScenario } from './support/handtrap-duel'

/**
 * Las cartas del bot que juega en contra que no son handtraps (Evenly Matched, Lightning Storm, Book of Moon y Called by the Grave) contra el núcleo real (lento:
 * `npm run test:auto`; se salta sin datos): cada una con su uso y su no uso, en la sesión de verdad. El informe, con la oferta literal del núcleo (cada `select_chain` que la
 * incluye, cada `select_idlecmd` que la ofrece y cada elección del rival) y su respuesta con el motivo, va a CORE_DATA_DIR (`bot-cartas-report.json`).
 */

const EVENLY = 15693423
const STORM = 14532163
const BOOK = 14087893
const CALLED = 24224830
const INPACHI = 5464695

const POT = 55144522
const KURIBOH = 40640057
const GOBLIN = 78658564
const FOOLISH = 81439173
const BULB = 67441435
const STRATOS = 40044918
const AVIAN = 21844576

type Result = Awaited<ReturnType<ReturnType<typeof handtrapDuels>['duel']>>

interface Case {
  card: number
  what: string
  kind: 'use' | 'hold'
  /** «El rival juega su turno». */
  ownTurn: boolean
  scenario: DuelScenario
  /** Las cartas elegidas del rival (una copia de cada una, todas en su mano). */
  rival: number[]
  /** Los motivos que tiene que dar (la clave sin `auto.bot.reason.`), y los que no. */
  reasons: string[]
  never?: string[]
  /** Lo que tiene que haber pasado; `null` si está bien. */
  check: (result: Result) => string | null
}

const RELLENO: [number, number][] = [[POT, 3]]
const chained = (events: readonly WireEvent[], code: number) => has(events, (event) => event.type === 'chaining' && event.code === code && event.controller === 1)
/** Cuántas cartas tuyas del campo terminaron desterradas. */
/** Esa carta de ese asiento (tuya, si no se dice) fue de ese lugar al cementerio. */
const destroyed = (events: readonly WireEvent[], code: number, from: number, controller = 0) =>
  has(events, (event) => event.type === 'move' && event.card === code && event.from.controller === controller && event.from.location === from && event.to.location === L.GRAVE)
const banished = (events: readonly WireEvent[]) => events.filter((event) => event.type === 'move' && event.from.controller === 0 && (event.from.location & (L.MZONE | L.SZONE)) !== 0 && event.to.location === L.REMOVED).length

const CASES: Case[] = [
  {
    card: EVENLY,
    what: 'desde la mano, con su campo vacío: tenés 3 cartas y al final de tu Battle Phase desterrás 2',
    kind: 'use',
    ownTurn: false,
    scenario: { deck: RELLENO, hand: [KURIBOH, POT, POT], steps: [{ do: 'summon', code: KURIBOH }, { do: 'set', code: POT }, { do: 'set', code: POT }, { do: 'end' }, { do: 'battle' }] },
    rival: [EVENLY],
    reasons: ['handtrap.evenly'],
    check: ({ events }) => (chained(events, EVENLY) && banished(events) === 2 ? null : `no la activó o no desterraste 2 (${banished(events)})`),
  },
  {
    card: EVENLY,
    what: 'desde la mano, con 2 cartas tuyas: el núcleo la ofrece para desterrar una y no la gasta',
    kind: 'hold',
    ownTurn: false,
    scenario: { deck: RELLENO, hand: [KURIBOH, POT], steps: [{ do: 'summon', code: KURIBOH }, { do: 'set', code: POT }, { do: 'end' }, { do: 'battle' }] },
    rival: [EVENLY],
    reasons: ['hold.evenly'],
    never: ['handtrap.evenly'],
    check: ({ events, offers, snapshot }) => (offers.some((offer) => offer.includes(EVENLY)) && !chained(events, EVENLY) && snapshot.rivalHand.includes(EVENLY) ? null : 'no se la ofreció o la usó'),
  },
  {
    card: EVENLY,
    what: 'juega su turno: la coloca y, al final de tu Battle Phase, con 4 cartas tuyas contra 2 suyas, desterrás 2',
    kind: 'use',
    ownTurn: true,
    scenario: {
      deck: RELLENO,
      hand: [GOBLIN, POT, POT, POT],
      steps: [{ do: 'summon', code: GOBLIN }, { do: 'set', code: POT }, { do: 'set', code: POT }, { do: 'set', code: POT }, { do: 'end' }, { do: 'battle' }],
    },
    rival: [EVENLY],
    reasons: ['play.setEvenly', 'handtrap.evenly'],
    check: ({ events }) => (chained(events, EVENLY) && banished(events) >= 2 ? null : `no la activó o desterraste menos de 2 (${banished(events)})`),
  },
  {
    card: STORM,
    what: 'antes de Invocar, contra tu Kuriboh en ataque: elige tus monstruos, y después ataca directo',
    kind: 'use',
    ownTurn: true,
    scenario: { deck: RELLENO, hand: [KURIBOH], steps: [{ do: 'summon', code: KURIBOH }, { do: 'end' }] },
    rival: [STORM, INPACHI],
    reasons: ['play.sweep', 'play.summon', 'battle.direct'],
    check: ({ events }) => (chained(events, STORM) && destroyed(events, KURIBOH, L.MZONE) ? null : 'no la activó o no destruyó a Kuriboh'),
  },
  {
    card: STORM,
    what: 'con 2 Mágicas tuyas colocadas y un solo monstruo en ataque: elige tus Mágicas y Trampas',
    kind: 'use',
    ownTurn: true,
    scenario: { deck: RELLENO, hand: [KURIBOH, POT, POT], steps: [{ do: 'summon', code: KURIBOH }, { do: 'set', code: POT }, { do: 'set', code: POT }, { do: 'end' }] },
    rival: [STORM, INPACHI],
    reasons: ['play.sweep'],
    check: ({ events }) => (chained(events, STORM) && events.filter((event) => event.type === 'move' && event.card === POT && event.from.location === L.SZONE && event.to.location === L.GRAVE).length === 2 ? null : 'no destruyó tus dos Pot of Greed'),
  },
  {
    card: STORM,
    what: 'con tu Kuriboh boca abajo y sin Mágicas tuyas: el núcleo no la ofrece y no la gasta',
    kind: 'hold',
    ownTurn: true,
    scenario: { deck: RELLENO, hand: [KURIBOH], steps: [{ do: 'mset', code: KURIBOH }, { do: 'end' }] },
    rival: [STORM, INPACHI],
    reasons: ['play.summon'],
    never: ['play.sweep'],
    check: ({ events, rivalAsks, snapshot }) =>
      !chained(events, STORM) && snapshot.rivalHand.includes(STORM) && rivalAsks.every((ask) => ask.type !== 'select_idlecmd' || !ask.activates.some((card) => card.code === STORM)) ? null : 'la activó o se la ofreció',
  },
  {
    card: BOOK,
    what: 'la coloca y, cuando tu Goblin Attack Force (2300) ataca a su Inpachi, lo pone boca abajo',
    kind: 'use',
    ownTurn: true,
    scenario: { deck: RELLENO, hand: [GOBLIN], steps: [{ do: 'end' }, { do: 'summon', code: GOBLIN }, { do: 'battle' }, { do: 'attack', code: GOBLIN }] },
    rival: [BOOK, INPACHI],
    reasons: ['play.setMoon', 'play.moon'],
    check: ({ events }) => (chained(events, BOOK) && has(events, (event) => event.type === 'pos_change' && event.controller === 0 && event.code === GOBLIN) && !destroyed(events, INPACHI, L.MZONE, 1) ? null : 'no frenó el ataque de Goblin'),
  },
  {
    card: BOOK,
    what: 'tu Kuriboh (300) ataca a su Inpachi: no lo destruye y no la gasta',
    kind: 'hold',
    ownTurn: true,
    scenario: { deck: RELLENO, hand: [KURIBOH], steps: [{ do: 'end' }, { do: 'summon', code: KURIBOH }, { do: 'battle' }, { do: 'attack', code: KURIBOH }] },
    rival: [BOOK, INPACHI],
    reasons: ['play.setMoon'],
    never: ['play.moon'],
    check: ({ events, offers }) => (offers.some((offer) => offer.includes(BOOK)) && !chained(events, BOOK) && destroyed(events, KURIBOH, L.MZONE) ? null : 'no se la ofreció, la usó o Kuriboh no perdió'),
  },
  {
    card: CALLED,
    what: 'la coloca y, cuando activás Glow-Up Bulb en tu cementerio, la destierra y niega su efecto',
    kind: 'use',
    ownTurn: true,
    scenario: { deck: [[BULB, 3]], hand: [FOOLISH], wants: [BULB], steps: [{ do: 'end' }, { do: 'activate', code: FOOLISH }, { do: 'activate', code: BULB }] },
    rival: [CALLED, INPACHI],
    reasons: ['play.setCalled', 'play.called', 'target.link'],
    check: ({ events }) => (chained(events, CALLED) && moved(events, BULB, L.GRAVE, L.REMOVED) && !moved(events, BULB, L.GRAVE, L.MZONE) ? null : 'Glow-Up Bulb no quedó desterrada o se Invocó'),
  },
  {
    card: CALLED,
    what: 'con Avian en tu cementerio, el efecto de Stratos (en el campo): se la ofrece y la guarda',
    kind: 'hold',
    ownTurn: true,
    scenario: { deck: [[POT, 1], [AVIAN, 3]], hand: [FOOLISH, STRATOS], wants: [AVIAN], steps: [{ do: 'end' }, { do: 'activate', code: FOOLISH }, { do: 'summon', code: STRATOS }] },
    rival: [CALLED, INPACHI],
    reasons: ['play.setCalled', 'hold.graveyard'],
    never: ['play.called'],
    check: ({ events, offers }) => (offers.some((offer) => offer.includes(CALLED)) && !chained(events, CALLED) ? null : 'no se la ofreció o la usó'),
  },
]

/** La oferta de una pregunta del rival, en una línea con los códigos de cada lista. */
const offerOf = (ask: CoreAsk) =>
  ask.type === 'select_idlecmd'
    ? { idle: { summons: ask.summons.map((card) => card.code), monster_sets: ask.monster_sets.map((card) => card.code), spell_sets: ask.spell_sets.map((card) => card.code), activates: ask.activates.map((card) => card.code) } }
    : ask.type === 'select_chain'
      ? { chain: ask.selects.map((card) => ({ code: card.code, location: card.location })), hint_timing_other: ask.hint_timing_other }
      : ask.type === 'select_card' || ask.type === 'select_option'
        ? ask
        : ask.type

describe.skipIf(!hasCoreData)('las cartas del bot que no son handtraps, contra el núcleo real (npm run test:auto)', () => {
  const { duel, names } = handtrapDuels()
  const report: Record<string, unknown>[] = []

  afterAll(() => {
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'bot-cartas-report.json'), JSON.stringify(report, null, 1))
  })

  it.each(CASES.map((item) => [`${names.get(item.card) ?? item.card} · ${item.kind === 'use' ? 'la usa' : 'no la usa'}: ${item.what}`, item] as const))('%s', async (_name, item) => {
    const result = await duel(item.scenario, { enabled: true, picks: item.rival.map((id) => ({ id, name: '', copies: 1 })), hand: item.rival.length, ...(item.ownTurn ? { ownTurn: true } : {}) })
    const { snapshot } = result
    const faults = snapshot.faults.filter((fault) => fault.kind !== 'script' || !fault.message.startsWith('card data'))
    const rival = snapshot.answers.filter((answer) => answer.seat === 1)
    const keys = rival.flatMap((answer) => (answer.reason ? [answer.reason.key.replace('auto.bot.reason.', '')] : []))
    // La oferta literal de cada pregunta que nombra la carta (o la pide: elegir, una opción) y la respuesta del rival, en el mismo orden.
    const offers = result.rivalAsks.flatMap((ask, i) =>
      (ask.type === 'select_chain' && ask.selects.some((card) => card.code === item.card)) || (ask.type === 'select_idlecmd' && [...ask.spell_sets, ...ask.activates].some((card) => card.code === item.card)) || ask.type === 'select_card' || ask.type === 'select_option'
        ? [{ offer: offerOf(ask), answer: rival[i]?.answer, reason: rival[i]?.reason }]
        : [],
    )
    const outcome = item.check(result)

    report.push({ card: names.get(item.card), kind: item.kind, ownTurn: item.ownTurn, what: item.what, offers, reasons: keys, lp: snapshot.overlay.lp, outcome, faults })

    expect({ status: snapshot.status, fault: snapshot.fault, faults, outcome }).toEqual({ status: 'ready', fault: null, faults: [], outcome: null })
    expect(keys).toEqual(expect.arrayContaining(item.reasons))
    expect(keys.filter((key) => item.never?.includes(key))).toEqual([])
    // Los motivos van sólo en las respuestas del rival.
    expect(snapshot.answers.filter((answer) => answer.reason && answer.seat !== 1)).toEqual([])
  })
})
