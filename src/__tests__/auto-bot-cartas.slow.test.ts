import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { LOCATION as L, type CoreAsk, type WireEvent } from '../app/auto/protocol'
import { CORE_DATA_DIR, hasCoreData } from './support/core-data'
import { handtrapDuels, has, type DuelScenario } from './support/handtrap-duel'

/**
 * Las cartas del bot que juega en contra que no son handtraps (Evenly Matched, …) contra el núcleo real (lento: `npm run test:auto`; se salta sin datos): cada una con su uso y su
 * no uso, en la sesión de verdad. El informe, con la oferta literal del núcleo (cada `select_chain` que la incluye y cada `select_idlecmd` del rival) y su respuesta con el motivo,
 * va a CORE_DATA_DIR (`bot-cartas-report.json`).
 */

const EVENLY = 15693423

const POT = 55144522
const KURIBOH = 40640057
const GOBLIN = 78658564

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
