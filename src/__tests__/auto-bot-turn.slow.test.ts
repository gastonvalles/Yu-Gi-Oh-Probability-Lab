import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { LOCATION as L, type CoreAsk, type WireEvent } from '../app/auto/protocol'
import { CORE_DATA_DIR, hasCoreData } from './support/core-data'
import { handtrapDuels, has, moved, type DuelScenario } from './support/handtrap-duel'

/**
 * «El rival juega su turno» (H4 del bot para jugar en contra) contra el núcleo real (lento: `npm run test:auto`; se salta sin datos): cada decisión importante de su turno con su uso
 * y su no uso, en la sesión de verdad (`turnBot`). Vos jugás tu línea y terminás el turno; el rival juega el suyo con la mano que le da el simulador (sus cartas elegidas) y roba del
 * relleno. El informe, con la oferta literal de cada `select_idlecmd` / `select_battlecmd` suyo y su respuesta con el motivo, va a CORE_DATA_DIR (`bot-turn-report.json`).
 */

const GOLEM = 102380
const SPHERE = 10000080
const RA = 10000010
const BANDIT = 24203749
const RAIGEKI = 12580477
const SOLEMN_STRIKE = 40605147
const SOLEMN_JUDGMENT = 41420027
const ASH = 14558127
const INPACHI = 5464695

const FOOLISH = 81439173
const REBORN = 83764718
const AVIAN = 21844576
const CELTIC = 91152256
const KURIBOH = 40640057
const GOBLIN = 78658564
const BULB = 67441435
const STRATOS = 40044918
const POT = 55144522

type Result = Awaited<ReturnType<ReturnType<typeof handtrapDuels>['duel']>>

interface Case {
  /** Qué decide el rival y si lo hace (`use`) o no (`hold`). */
  what: string
  kind: 'use' | 'hold'
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
/** Tus monstruos en el turno 1, boca arriba en ataque: dos (Avian 1000 y Kuriboh 300) o tres (con Celtic Guardian 1400), y terminás. */
const TWO: DuelScenario = { deck: [[AVIAN, 1], ...RELLENO], hand: [FOOLISH, REBORN, KURIBOH], wants: [AVIAN], steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }, { do: 'summon', code: KURIBOH }, { do: 'end' }] }
const THREE: DuelScenario = {
  deck: [[AVIAN, 1], [CELTIC, 1], ...RELLENO],
  hand: [FOOLISH, FOOLISH, REBORN, REBORN, KURIBOH],
  wants: [CELTIC, AVIAN],
  steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }, { do: 'activate', code: REBORN }, { do: 'summon', code: KURIBOH }, { do: 'end' }],
}
const ONE: DuelScenario = { deck: RELLENO, hand: [KURIBOH], steps: [{ do: 'summon', code: KURIBOH }, { do: 'end' }] }
const NONE: DuelScenario = { deck: RELLENO, hand: [], steps: [{ do: 'end' }] }

/** El rival (asiento 1) movió esa carta tuya al cementerio. */
const toGrave = (events: readonly WireEvent[], code: number) => has(events, (event) => event.type === 'move' && event.card === code && event.from.controller === 0 && event.from.location === L.MZONE && event.to.location === L.GRAVE)
const summonedBy = (events: readonly WireEvent[], code: number, controller: 0 | 1) => has(events, (event) => event.type === 'move' && event.card === code && event.to.controller === controller && event.to.location === L.MZONE)
const rivalAttacked = (events: readonly WireEvent[]) => has(events, (event) => event.type === 'attack' && event.card.controller === 1)
/** Lo que el rival hizo antes que otra cosa: el índice del primer evento que cumple. */
const first = (events: readonly WireEvent[], test: (event: WireEvent) => boolean) => events.findIndex(test)

const CASES: Case[] = [
  {
    what: 'Invoca de modo Normal su monstruo de más ATK y, sin monstruos tuyos, ataca directo',
    kind: 'use',
    scenario: NONE,
    rival: [INPACHI],
    reasons: ['play.summon', 'battle.direct', 'end.done'],
    check: ({ events, snapshot }) => (has(events, (event) => event.type === 'summoning' && event.controller === 1) && rivalAttacked(events) && snapshot.overlay.lp[0] < 8000 ? null : 'no Invocó, no atacó o no bajaron tus vidas'),
  },
  {
    what: 'ataque seguro: con más ATK que tu Kuriboh (300) lo ataca y lo destruye',
    kind: 'use',
    scenario: ONE,
    rival: [INPACHI],
    reasons: ['battle.safe'],
    check: ({ events }) => (toGrave(events, KURIBOH) && rivalAttacked(events) ? null : 'no destruyó a Kuriboh'),
  },
  {
    what: 'no ataca a un monstruo con más ATK (Goblin Attack Force, 2300): coloca el suyo boca abajo',
    kind: 'hold',
    scenario: { deck: RELLENO, hand: [GOBLIN], steps: [{ do: 'summon', code: GOBLIN }, { do: 'end' }] },
    rival: [INPACHI],
    reasons: ['play.set'],
    never: ['battle.safe', 'battle.direct', 'play.summon'],
    check: ({ events }) => (!rivalAttacked(events) && has(events, (event) => event.type === 'set' && event.controller === 1 && event.location === L.MZONE) ? null : 'atacó o no colocó'),
  },
  {
    what: 'no ataca lo boca abajo (no sabe qué es): Invoca y termina sin atacar',
    kind: 'hold',
    scenario: { deck: RELLENO, hand: [CELTIC], steps: [{ do: 'mset', code: CELTIC }, { do: 'end' }] },
    rival: [INPACHI],
    reasons: ['play.summon', 'end.faceDown'],
    never: ['battle.safe', 'battle.direct'],
    check: ({ events }) => (!rivalAttacked(events) ? null : 'atacó'),
  },
  {
    what: 'barrido: Raigeki con un monstruo tuyo, y después ataca directo',
    kind: 'use',
    scenario: ONE,
    rival: [RAIGEKI, INPACHI],
    reasons: ['play.sweep', 'battle.direct'],
    check: ({ events }) => (toGrave(events, KURIBOH) && has(events, (event) => event.type === 'chaining' && event.code === RAIGEKI) ? null : 'no activó Raigeki'),
  },
  {
    what: 'barrido: sin monstruos tuyos no gasta Raigeki',
    kind: 'hold',
    scenario: NONE,
    rival: [RAIGEKI, INPACHI],
    reasons: ['play.summon'],
    never: ['play.sweep'],
    check: ({ events, snapshot }) => (!has(events, (event) => event.type === 'chaining' && event.code === RAIGEKI) && snapshot.rivalHand.includes(RAIGEKI) ? null : 'activó Raigeki'),
  },
  {
    what: 'negación colocada: coloca Solemn Judgment en su turno y niega tu Invocación Normal de Kuriboh en el tuyo',
    kind: 'use',
    scenario: { deck: RELLENO, hand: [KURIBOH], steps: [{ do: 'end' }, { do: 'summon', code: KURIBOH }] },
    rival: [SOLEMN_JUDGMENT, INPACHI],
    reasons: ['play.setCounter', 'play.counterSummon'],
    check: ({ events }) => (has(events, (event) => event.type === 'chaining' && event.code === SOLEMN_JUDGMENT) && toGrave(events, KURIBOH) ? null : 'no negó la Invocación'),
  },
  {
    what: 'negación colocada: Solemn Strike niega el efecto de Stratos al Invocarse (en esta versión del script no niega una Invocación Normal)',
    kind: 'use',
    scenario: { deck: [[AVIAN, 1], ...RELLENO], hand: [STRATOS], steps: [{ do: 'end' }, { do: 'summon', code: STRATOS }] },
    rival: [SOLEMN_STRIKE, INPACHI],
    reasons: ['play.setCounter', 'handtrap.respond'],
    check: ({ events }) => (has(events, (event) => event.type === 'chain_negated') && toGrave(events, STRATOS) ? null : 'no negó el efecto de Stratos'),
  },
  {
    what: 'Lava Golem con 3 monstruos tuyos: antes de su Invocación Normal, Tributando los dos de más ATK (Celtic y Avian)',
    kind: 'use',
    scenario: THREE,
    rival: [GOLEM, INPACHI],
    reasons: ['play.golem', 'target.threat'],
    never: ['play.summon'],
    check: ({ events }) => {
      const golem = first(events, (event) => event.type === 'spsummoning' && event.code === GOLEM)

      return golem >= 0 && summonedBy(events, GOLEM, 0) && toGrave(events, CELTIC) && toGrave(events, AVIAN) && !toGrave(events, KURIBOH) && first(events, (event) => event.type === 'summoning' && event.controller === 1) < 0
        ? null
        : 'no Invocó a Lava Golem en tu campo con Celtic y Avian, o Invocó de modo Normal'
    },
  },
  {
    what: 'Lava Golem con un solo monstruo tuyo: el núcleo no la ofrece; Invoca de modo Normal y ataca',
    kind: 'hold',
    scenario: ONE,
    rival: [GOLEM, INPACHI],
    reasons: ['play.summon', 'battle.safe'],
    never: ['play.golem'],
    check: ({ rivalAsks }) => (idles(rivalAsks).every((ask) => !ask.special_summons.some((card) => card.code === GOLEM)) ? null : 'el núcleo la ofreció'),
  },
  {
    what: 'Sphere Mode con 3 monstruos tuyos y Ra en la mano: los Tributa, y a su vuelta la Tributa para traer a Ra',
    kind: 'use',
    scenario: { ...THREE, steps: [...THREE.steps, { do: 'end' }] },
    rival: [SPHERE, RA],
    reasons: ['play.sphere', 'target.threat', 'play.ra'],
    check: ({ events }) => (toGrave(events, CELTIC) && toGrave(events, AVIAN) && toGrave(events, KURIBOH) && summonedBy(events, RA, 1) ? null : 'no Tributó tus tres o no trajo a Ra'),
  },
  {
    what: 'Sphere Mode sin Ra: barre tus tres, pero a su vuelta no hay nada que traer',
    kind: 'hold',
    scenario: { ...THREE, steps: [...THREE.steps, { do: 'end' }] },
    rival: [SPHERE],
    reasons: ['play.sphere'],
    never: ['play.ra'],
    check: ({ events, rivalAsks }) => (toGrave(events, KURIBOH) && idles(rivalAsks).every((ask) => !ask.activates.some((card) => card.code === SPHERE)) ? null : 'no la Invocó o se la ofreció'),
  },
  {
    what: 'Sphere Mode con 2 monstruos tuyos: el núcleo no la ofrece',
    kind: 'hold',
    scenario: TWO,
    rival: [SPHERE],
    reasons: [],
    never: ['play.sphere'],
    check: ({ rivalAsks }) => (idles(rivalAsks).every((ask) => !ask.summons.some((card) => card.code === SPHERE)) ? null : 'el núcleo la ofreció'),
  },
  {
    what: 'Gallant Bandit con 2 monstruos tuyos: los Tributa a ellos y no a su Inpachi',
    kind: 'use',
    scenario: TWO,
    rival: [BANDIT, INPACHI],
    reasons: ['play.bandit', 'target.threat'],
    check: ({ events, snapshot }) => (summonedBy(events, BANDIT, 1) && toGrave(events, AVIAN) && toGrave(events, KURIBOH) && snapshot.rivalHand.includes(INPACHI) ? null : 'no Tributó tus dos o gastó su Inpachi'),
  },
  {
    what: 'Gallant Bandit con un monstruo tuyo: Tributa el tuyo primero y después su relleno',
    kind: 'use',
    scenario: ONE,
    rival: [BANDIT, INPACHI],
    reasons: ['play.bandit'],
    check: ({ events }) => (summonedBy(events, BANDIT, 1) && toGrave(events, KURIBOH) ? null : 'no Tributó a tu Kuriboh'),
  },
  {
    what: 'Gallant Bandit sin monstruos tuyos y con una handtrap en la mano: no la gasta de Tributo',
    kind: 'hold',
    scenario: NONE,
    rival: [BANDIT, ASH],
    reasons: [],
    never: ['play.bandit'],
    check: ({ events, snapshot }) => (!summonedBy(events, BANDIT, 1) && snapshot.rivalHand.includes(ASH) ? null : 'la Invocó o gastó a Ash'),
  },
  {
    what: 'Gallant Bandit en el campo niega tu Glow-Up Bulb, que activás en el cementerio',
    kind: 'use',
    // Con tres Glow-Up Bulb en el deck: si robás una, Foolish Burial sigue teniendo qué mandar.
    scenario: { deck: [[AVIAN, 1], [BULB, 3]], hand: [FOOLISH, REBORN, KURIBOH, FOOLISH], wants: [AVIAN, BULB], steps: [...TWO.steps, { do: 'activate', code: FOOLISH }, { do: 'activate', code: BULB }] },
    rival: [BANDIT, INPACHI],
    reasons: ['play.bandit', 'handtrap.respond'],
    check: ({ events }) => (has(events, (event) => event.type === 'chain_disabled') && !moved(events, BULB, L.GRAVE, L.MZONE) ? null : 'Glow-Up Bulb se Invocó'),
  },
  {
    what: 'Gallant Bandit en tu Battle Phase: revela su mano y pasa tus monstruos a defensa',
    kind: 'use',
    scenario: { deck: [[AVIAN, 1], [CELTIC, 1], ...RELLENO], hand: [FOOLISH, REBORN, KURIBOH, CELTIC], wants: [AVIAN], steps: [...TWO.steps, { do: 'summon', code: CELTIC }, { do: 'battle' }] },
    rival: [BANDIT, INPACHI],
    reasons: ['play.bandit', 'play.banditDefense'],
    check: ({ events }) => (has(events, (event) => event.type === 'pos_change' && event.controller === 0 && event.code === CELTIC) ? null : 'Celtic no pasó a defensa'),
  },
]

const idles = (asks: readonly CoreAsk[]) => asks.filter((ask): ask is Extract<CoreAsk, { type: 'select_idlecmd' }> => ask.type === 'select_idlecmd')
/** La oferta de un `select_idlecmd` o `select_battlecmd` del rival, en una línea con los códigos de cada lista. */
const offerOf = (ask: CoreAsk) =>
  ask.type === 'select_idlecmd'
    ? { summons: ask.summons.map((card) => card.code), special_summons: ask.special_summons.map((card) => card.code), monster_sets: ask.monster_sets.map((card) => card.code), spell_sets: ask.spell_sets.map((card) => card.code), activates: ask.activates.map((card) => card.code), to_bp: ask.to_bp, to_ep: ask.to_ep }
    : ask.type === 'select_battlecmd'
      ? { attacks: ask.attacks.map((card) => [card.code, card.can_direct]), to_m2: ask.to_m2, to_ep: ask.to_ep }
      : ask.type

describe.skipIf(!hasCoreData)('el rival juega su turno, contra el núcleo real (npm run test:auto)', () => {
  const { duel } = handtrapDuels()
  const report: Record<string, unknown>[] = []

  afterAll(() => {
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'bot-turn-report.json'), JSON.stringify(report, null, 1))
  })

  it.each(CASES.map((item) => [`${item.kind === 'use' ? 'lo hace' : 'no lo hace'}: ${item.what}`, item] as const))('%s', async (_name, item) => {
    const result = await duel(item.scenario, { enabled: true, picks: item.rival.map((id) => ({ id, name: '', copies: 1 })), hand: item.rival.length, ownTurn: true })
    const { snapshot } = result
    const faults = snapshot.faults.filter((fault) => fault.kind !== 'script' || !fault.message.startsWith('card data'))
    const rival = snapshot.answers.filter((answer) => answer.seat === 1)
    const keys = rival.flatMap((answer) => (answer.reason ? [answer.reason.key.replace('auto.bot.reason.', '')] : []))
    // Cada jugada de su turno con lo que le ofreció el núcleo: las preguntas del rival y sus respuestas van en el mismo orden.
    const plays = result.rivalAsks.flatMap((ask, i) => (ask.type === 'select_idlecmd' || ask.type === 'select_battlecmd' ? [{ offer: offerOf(ask), i }] : []))
    const outcome = item.check(result)

    report.push({ what: item.what, kind: item.kind, plays: plays.map(({ offer, i }) => ({ offer, answer: rival[i]?.answer, reason: rival[i]?.reason?.key })), reasons: keys, lp: snapshot.overlay.lp, outcome, faults })

    expect({ status: snapshot.status, fault: snapshot.fault, faults, outcome }).toEqual({ status: 'ready', fault: null, faults: [], outcome: null })
    expect(keys).toEqual(expect.arrayContaining(item.reasons))
    expect(keys.filter((key) => item.never?.includes(key))).toEqual([])
    // Los motivos van sólo en las respuestas del rival.
    expect(snapshot.answers.filter((answer) => answer.reason && answer.seat !== 1)).toEqual([])
  })
})
