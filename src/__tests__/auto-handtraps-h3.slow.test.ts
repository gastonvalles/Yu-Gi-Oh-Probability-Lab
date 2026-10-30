import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { LOCATION as L, type WireEvent } from '../app/auto/protocol'
import { AUTO_RULES } from '../app/handtraps'
import { CORE_DATA_DIR, hasCoreData } from './support/core-data'
import { chainingOf, H3_CARDS, handtrapDuels, has, moved, type DuelScenario } from './support/handtrap-duel'

/**
 * Las reacciones de H3 (el bot para jugar en contra) contra el núcleo real (lento: `npm run test:auto`; se salta sin datos). Cada carta, dos escenarios: uno donde el núcleo se la
 * ofrece y el rival la usa (con su motivo) y otro donde no (el núcleo no se la ofrece, o se la ofrece y su regla dice que no conviene). El informe, con la oferta literal del núcleo
 * y las respuestas del rival, va a CORE_DATA_DIR (`handtraps-h3-report.json`).
 */

const SKULL = 67750322
const RETALIATING = 46502744
const CONTACT = 87170768
const GODOS = 68144894
const MULTIPLYING = 14965712
const MAGNAMHUT = 33854624
const DRUISWURM = 6637331
const SARONIR = 60242223
const SHIFTER = 91800273
const FLEURDELIS = 69680031

const TERRAFORMING = 73628505
const SOGEN = 86318356
const FOOLISH = 81439173
const REBORN = 83764718
const STRATOS = 40044918
const AVIAN = 21844576
const KURIBOH = 40640057
const LINKURIBOH = 41999284
const BULB = 67441435
/** Plaguespreader Zombie: OSCURIDAD, se Invoca desde tu cementerio (lo que destierran las Bystial). */
const PLAGUE = 33420078
const POT = 55144522

type Result = Awaited<ReturnType<ReturnType<typeof handtrapDuels>['duel']>>

interface Case {
  card: number
  /** `use`: el núcleo se la ofrece y la usa; `hold`: no la usa. */
  kind: 'use' | 'hold'
  what: string
  scenario: DuelScenario
  /** Copias en su deck y en su mano (1 y 1 si no se dice). */
  copies?: number
  /** El motivo esperado (la clave sin `auto.bot.reason.`), con la carta primero; en `hold` sin motivo, `null`. */
  reason: string | null
  /** Lo que tiene que haber pasado; `null` si está bien. */
  check: (result: Result) => string | null
}

const SPELLS: [number, number][] = [[POT, 1]]
const bystialUse = (card: number): Case => ({
  card,
  kind: 'use',
  what: 'contra Plaguespreader Zombie (OSCURIDAD) que activás en tu cementerio: lo destierra y no se Invoca',
  scenario: { deck: [[PLAGUE, 1]], hand: [KURIBOH, FOOLISH, POT], steps: [{ do: 'summon', code: KURIBOH }, { do: 'activate', code: FOOLISH }, { do: 'activate', code: PLAGUE }] },
  reason: 'handtrap.bystial',
  check: ({ events }) => (moved(events, PLAGUE, L.GRAVE, L.REMOVED) && !moved(events, PLAGUE, L.GRAVE, L.MZONE) && rivalSummoned(events, card) ? null : 'no desterró a Plaguespreader o no se Invocó'),
})
const used = (events: readonly WireEvent[], card: number) => chainingOf(events, card, 1) >= 0
const rivalSummoned = (events: readonly WireEvent[], card: number) => has(events, (event) => event.type === 'move' && event.card === card && event.to.controller === 1 && event.to.location === L.MZONE)
const neverOffered = ({ offers }: Result, card: number) => offers.every((offer) => !offer.includes(card))

const CASES: Case[] = [
  {
    card: SKULL,
    kind: 'use',
    what: 'contra Glow-Up Bulb, que activás en tu cementerio: niega su efecto',
    scenario: { deck: [[BULB, 1], ...SPELLS], hand: [FOOLISH], steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: BULB }] },
    reason: 'handtrap.respond',
    check: ({ events }) => (has(events, (event) => event.type === 'chain_disabled') && !moved(events, BULB, L.GRAVE, L.MZONE) ? null : 'Glow-Up Bulb se Invocó'),
  },
  {
    card: SKULL,
    kind: 'hold',
    what: 'Terraforming no se activa en el cementerio: el núcleo no se la ofrece',
    scenario: { deck: [[SOGEN, 1], ...SPELLS], hand: [TERRAFORMING], steps: [{ do: 'activate', code: TERRAFORMING }] },
    reason: null,
    check: (result) => (neverOffered(result, SKULL) && moved(result.events, SOGEN, L.DECK, L.HAND) ? null : 'se la ofreció o Terraforming no buscó'),
  },
  {
    card: RETALIATING,
    kind: 'use',
    what: 'contra Monster Reborn (una Mágica que Invoca): se Invoca',
    scenario: { deck: [[AVIAN, 1], ...SPELLS], hand: [FOOLISH, REBORN], steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }] },
    reason: 'handtrap.respond',
    check: ({ events }) => (rivalSummoned(events, RETALIATING) ? null : 'Retaliating «C» no se Invocó'),
  },
  {
    card: RETALIATING,
    kind: 'hold',
    what: 'Terraforming no Invoca: el núcleo no se la ofrece',
    scenario: { deck: [[SOGEN, 1], ...SPELLS], hand: [TERRAFORMING], steps: [{ do: 'activate', code: TERRAFORMING }] },
    reason: null,
    check: (result) => (neverOffered(result, RETALIATING) ? null : 'se la ofreció'),
  },
  {
    card: CONTACT,
    kind: 'use',
    what: 'cuando Invocás a Kuriboh: se Invoca a tu campo, boca arriba en defensa',
    scenario: { deck: SPELLS, hand: [KURIBOH], steps: [{ do: 'summon', code: KURIBOH }] },
    reason: 'handtrap.offered',
    check: ({ events }) => (has(events, (event) => event.type === 'move' && event.card === CONTACT && event.to.controller === 0 && event.to.location === L.MZONE) ? null : 'Contact «C» no llegó a tu campo'),
  },
  {
    card: CONTACT,
    kind: 'hold',
    what: 'sin una Invocación tuya el núcleo no se la ofrece',
    scenario: { deck: [[SOGEN, 1], ...SPELLS], hand: [TERRAFORMING], steps: [{ do: 'activate', code: TERRAFORMING }] },
    reason: null,
    check: (result) => (neverOffered(result, CONTACT) ? null : 'se la ofreció'),
  },
  {
    card: GODOS,
    kind: 'use',
    what: 'cuando sumás Sogen a tu mano con Terraforming: se Invoca',
    scenario: { deck: [[SOGEN, 1], ...SPELLS], hand: [TERRAFORMING], steps: [{ do: 'activate', code: TERRAFORMING }] },
    reason: 'handtrap.offered',
    check: ({ events }) => (rivalSummoned(events, GODOS) ? null : 'Hecahands Godos no se Invocó'),
  },
  {
    card: GODOS,
    kind: 'hold',
    what: 'ya en el campo, el núcleo le ofrece llevarse a Avian de tu cementerio y no lo hace (sólo usa el efecto de la mano)',
    scenario: { deck: [[SOGEN, 1], [AVIAN, 1], ...SPELLS], hand: [TERRAFORMING, FOOLISH], steps: [{ do: 'activate', code: TERRAFORMING }, { do: 'activate', code: FOOLISH }] },
    reason: 'handtrap.offered',
    check: ({ events, offers }) => {
      const after = offers.slice(offers.findIndex((offer) => offer.includes(GODOS)) + 1)

      return after.some((offer) => offer.includes(GODOS)) && !moved(events, AVIAN, L.GRAVE, L.MZONE) && chainingOf(events, GODOS, 1) === events.findLastIndex((event) => event.type === 'chaining' && event.code === GODOS) ? null : 'no se le ofreció el del campo o se llevó a Avian'
    },
  },
  {
    card: MULTIPLYING,
    kind: 'use',
    what: 'cuando atacás con Kuriboh en el turno 3: se Invoca',
    // Con relleno para robar hasta tu turno 5 (después del ataque la mesa sigue).
    scenario: { deck: [[POT, 3]], hand: [KURIBOH], steps: [{ do: 'summon', code: KURIBOH }, { do: 'battle' }, { do: 'attack', code: KURIBOH }] },
    reason: 'handtrap.attack',
    check: ({ events }) => (rivalSummoned(events, MULTIPLYING) && has(events, (event) => event.type === 'attack') ? null : 'Multiplying Kuriboh! no se Invocó al ataque'),
  },
  {
    card: MULTIPLYING,
    kind: 'hold',
    what: 'contra el efecto de Stratos (un efecto de monstruo): el núcleo se la ofrece y la guarda para tu ataque',
    scenario: { deck: [[AVIAN, 1], ...SPELLS], hand: [STRATOS], steps: [{ do: 'summon', code: STRATOS }] },
    reason: 'hold.attack',
    check: (result) => (result.offers.some((offer) => offer.includes(MULTIPLYING)) && !used(result.events, MULTIPLYING) ? null : 'no se la ofreció o la usó'),
  },
  bystialUse(MAGNAMHUT),
  bystialUse(DRUISWURM),
  bystialUse(SARONIR),
  {
    card: MAGNAMHUT,
    kind: 'hold',
    what: 'contra Terraforming (no está en el cementerio), con Plaguespreader en tu cementerio: el núcleo se la ofrece y la guarda',
    scenario: { deck: [[PLAGUE, 1], [SOGEN, 1], ...SPELLS], hand: [KURIBOH, FOOLISH, TERRAFORMING], steps: [{ do: 'summon', code: KURIBOH }, { do: 'activate', code: FOOLISH }, { do: 'activate', code: TERRAFORMING }] },
    reason: 'hold.graveyard',
    check: (result) => (result.offers.some((offer) => offer.includes(MAGNAMHUT)) && !used(result.events, MAGNAMHUT) ? null : 'no se la ofreció o la usó'),
  },
  {
    card: SHIFTER,
    kind: 'use',
    what: 'en tu Draw Phase (su cementerio vacío): lo que mandás al cementerio con Foolish Burial queda desterrado',
    scenario: { deck: [[AVIAN, 1], ...SPELLS], hand: [FOOLISH], steps: [{ do: 'activate', code: FOOLISH }] },
    reason: 'handtrap.floodgate',
    check: ({ events }) => (moved(events, AVIAN, L.DECK, L.REMOVED) ? null : 'Avian no quedó desterrado'),
  },
  {
    card: SHIFTER,
    kind: 'hold',
    what: 'con dos en la mano: la segunda no se la ofrece (su cementerio ya no está vacío) y queda en la mano',
    scenario: { deck: [[AVIAN, 1], ...SPELLS], hand: [FOOLISH], steps: [{ do: 'activate', code: FOOLISH }] },
    copies: 2,
    reason: 'handtrap.floodgate',
    check: ({ events, offers, snapshot }) => {
      const first = offers.findIndex((offer) => offer.includes(SHIFTER))

      return events.filter((event) => event.type === 'chaining' && event.code === SHIFTER).length === 1 && offers.slice(first + 1).every((offer) => !offer.includes(SHIFTER)) && snapshot.rivalHand.includes(SHIFTER) ? null : 'usó las dos o se le ofreció la segunda'
    },
  },
  {
    card: FLEURDELIS,
    kind: 'use',
    what: 'cuando Invocás por Enlace a Linkuriboh (desde el Extra Deck): se Invoca',
    scenario: { deck: SPELLS, extra: [[LINKURIBOH, 1]], hand: [KURIBOH], steps: [{ do: 'summon', code: KURIBOH }, { do: 'spsummon', code: LINKURIBOH }] },
    reason: 'handtrap.extra',
    check: ({ events }) => (rivalSummoned(events, FLEURDELIS) ? null : 'Fleurdelis no se Invocó'),
  },
  {
    card: FLEURDELIS,
    kind: 'hold',
    what: 'con sólo una Invocación Normal (nada del Extra Deck) el núcleo no se la ofrece',
    scenario: { deck: SPELLS, hand: [KURIBOH], steps: [{ do: 'summon', code: KURIBOH }] },
    reason: null,
    check: (result) => (neverOffered(result, FLEURDELIS) ? null : 'se la ofreció'),
  },
]

describe.skipIf(!hasCoreData)('las reacciones de H3 contra el núcleo real (npm run test:auto)', () => {
  const { duel, names } = handtrapDuels()
  const report: Record<string, unknown>[] = []

  afterAll(() => {
    if (hasCoreData) writeFileSync(path.join(CORE_DATA_DIR, 'handtraps-h3-report.json'), JSON.stringify(report, null, 1))
  })

  it('cada carta de H3 tiene su regla y sus dos escenarios', () => {
    expect(H3_CARDS.filter((card) => !AUTO_RULES[card])).toEqual([])
    expect(new Set(CASES.map((item) => item.card))).toEqual(new Set(H3_CARDS))
    expect(H3_CARDS.filter((card) => !CASES.some((item) => item.card === card && item.kind === 'use'))).toEqual([])
  })

  it.each(CASES.map((item) => [`${names.get(item.card) ?? item.card} · ${item.kind === 'use' ? 'la usa' : 'no la usa'}: ${item.what}`, item] as const))('%s', async (_name, item) => {
    const copies = item.copies ?? 1
    const result = await duel(item.scenario, { enabled: true, picks: [{ id: item.card, name: names.get(item.card) ?? '', copies }], hand: copies })
    const { events, snapshot } = result
    const faults = snapshot.faults.filter((fault) => fault.kind !== 'script' || !fault.message.startsWith('card data'))
    const reasons = snapshot.answers.flatMap((answer) => (answer.reason ? [answer.reason] : []))
    const rival = snapshot.answers.filter((answer) => answer.seat === 1 && JSON.stringify(answer.answer) !== '{"type":"select_chain","index":null}').map((answer) => answer.answer)
    const outcome = item.check(result)

    report.push({ card: names.get(item.card), kind: item.kind, what: item.what, asks: result.asks, rival, reasons: reasons.map((reason) => ({ key: reason.key, cards: reason.cards })), outcome, faults })

    expect({ status: snapshot.status, fault: snapshot.fault, faults, outcome }).toEqual({ status: 'ready', fault: null, faults: [], outcome: null })
    expect(used(events, item.card)).toBe(item.kind === 'use' || item.reason?.startsWith('handtrap.') === true)
    if (item.reason) expect(reasons).toContainEqual(expect.objectContaining({ key: `auto.bot.reason.${item.reason}`, cards: expect.arrayContaining([item.card]) }))
    else expect(reasons.filter((reason) => reason.cards?.includes(item.card))).toEqual([])
    // Los motivos van sólo en las respuestas del rival.
    expect(snapshot.answers.filter((answer) => answer.reason && answer.seat !== 1)).toEqual([])
  })
})
