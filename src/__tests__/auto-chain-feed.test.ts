import { createAdapter } from '../app/auto/adapter'
import { CHAIN_LINK_MS, CHAIN_READ_MS, CHAIN_SOLVE_MS, chainDwell, chainFeed, chainOutcome, linkPhrase, stepsUpTo, type ChainStep } from '../app/auto/chain-feed'
import { CLOSE_MS } from '../app/chain-motion'
import { LOCATION as L, type WireEvent } from '../app/auto/protocol'

const link = (index: number, mine: boolean, code: number, at: number): ChainStep => ({ kind: 'chain', at, index, link: { card: { side: mine ? 'mine' : 'theirs', id: `x${code}` }, code, mine } })
const step = (kind: ChainStep['kind'], index: number, at: number): ChainStep => ({ kind, at, index })

// Tu Terraforming (CL1) y el Ash del rival (CL2), en el orden del núcleo: Ash se resuelve primero y, mientras, deja Terraforming sin efecto.
const ASH_CHAIN: ChainStep[] = [
  link(0, true, 73628505, 1),
  link(1, false, 14558127, 1),
  step('solving', 1, 1),
  step('disabled', 0, 1),
  step('solved', 1, 1),
  step('solving', 0, 1),
  step('solved', 0, 2),
  step('end', -1, 2),
]

describe('chainFeed: la cadena paso a paso', () => {
  it('se arma de a un eslabón y se resuelve del último al primero; lo que quedó sin efecto sigue así al terminar', () => {
    expect(chainFeed(ASH_CHAIN, 0)).toBeNull()
    expect(chainFeed(ASH_CHAIN, 1)).toMatchObject({ key: 0, resolving: false, done: false, focus: 0, rows: [{ number: 1, mine: true, state: 'chained' }] })
    expect(chainFeed(ASH_CHAIN, 2)).toMatchObject({ resolving: false, focus: 1, rows: [{ state: 'chained' }, { number: 2, mine: false, code: 14558127, state: 'chained' }] })
    expect(chainFeed(ASH_CHAIN, 3)).toMatchObject({ resolving: true, focus: 1, rows: [{ state: 'chained' }, { state: 'solving' }] })
    expect(chainFeed(ASH_CHAIN, 4)).toMatchObject({ focus: 0, rows: [{ state: 'disabled' }, { state: 'solving' }] })
    // Le llega el turno y se resuelve: sigue sin efecto.
    expect(chainFeed(ASH_CHAIN, 6)).toMatchObject({ focus: 0, rows: [{ state: 'disabled' }, { state: 'solved' }] })
    expect(chainFeed(ASH_CHAIN, 7)).toMatchObject({ done: false, rows: [{ state: 'disabled' }, { state: 'solved' }] })
    expect(chainFeed(ASH_CHAIN, 8)).toMatchObject({ done: true, rows: [{ state: 'disabled' }, { state: 'solved' }] })
    // Los primeros en resolverse son los últimos que se sumaron.
    expect(ASH_CHAIN.filter((item) => item.kind === 'solving').map((item) => item.index)).toEqual([1, 0])
  })

  it('quién negó (`by`) queda en la fila negada, sólo si el paso lo trae', () => {
    const withBy = ASH_CHAIN.map((item) => (item.kind === 'disabled' ? { ...item, by: 2 } : item))

    expect(chainFeed(withBy, 3)?.rows[0]).not.toHaveProperty('by')
    expect(chainFeed(withBy, 4)).toMatchObject({ rows: [{ state: 'disabled', by: 2 }, { state: 'solving' }] })
    // Al llegarle el turno y resolverse, sigue diciendo quién fue.
    expect(chainFeed(withBy, 8)).toMatchObject({ done: true, rows: [{ state: 'disabled', by: 2 }, { state: 'solved' }] })
    expect(chainFeed(withBy, 8)?.rows[1]).not.toHaveProperty('by')
    expect(chainFeed(ASH_CHAIN, 8)?.rows[0]).not.toHaveProperty('by')
  })

  it('una cadena nueva reemplaza a la anterior (otra key)', () => {
    const next = [...ASH_CHAIN, link(0, false, 1, 3), step('solving', 0, 3)]

    expect(chainFeed(next, next.length)).toMatchObject({ key: ASH_CHAIN.length, resolving: true, rows: [{ number: 1, mine: false, state: 'solving' }] })
  })

  it('el ritmo: un eslabón se ve un rato y cada uno se lee al resolverse; lo que queda sin efecto, 1,6 s más; una activación suelta, breve', () => {
    expect(ASH_CHAIN.map((_, i) => chainDwell(ASH_CHAIN, i))).toEqual([CHAIN_LINK_MS, CHAIN_LINK_MS, CHAIN_SOLVE_MS, CHAIN_SOLVE_MS + CHAIN_READ_MS, 0, 0, 0, 0])
    expect(CHAIN_READ_MS).toBe(1600)
    const single = [link(0, true, 5, 0), step('solving', 0, 0), step('solved', 0, 1), step('end', -1, 1)]

    expect(single.map((_, i) => chainDwell(single, i))).toEqual([0, CHAIN_LINK_MS, 0, 0])
    expect(chainDwell(single, -1)).toBe(0)
  })

  it('resolver tres eslabones lleva 2,25 s (2,45 con el cierre); si uno queda negado, 1,6 s más y sólo eso', () => {
    const three = (negate: boolean): ChainStep[] => [
      link(0, true, 1, 0),
      link(1, false, 2, 0),
      link(2, true, 3, 0),
      step('solving', 2, 0),
      ...(negate ? [{ ...step('negated', 1, 0), by: 3 }] : []),
      step('solved', 2, 0),
      step('solving', 1, 0),
      // La negada: al llegarle el turno sigue negada (no se lee dos veces).
      step('solved', 1, 0),
      step('solving', 0, 0),
      step('solved', 0, 0),
      step('end', -1, 0),
    ]
    const resolving = (steps: ChainStep[]) => steps.slice(3).reduce((sum, _, i) => sum + chainDwell(steps, i + 3), 0)

    expect(resolving(three(false))).toBe(3 * CHAIN_SOLVE_MS)
    expect(resolving(three(false)) + CLOSE_MS).toBe(2450)
    expect(resolving(three(true))).toBe(3 * CHAIN_SOLVE_MS + CHAIN_READ_MS)
  })

  it('stepsUpTo: los que llegaron hasta esa jugada de tu mesa', () => {
    expect(stepsUpTo(ASH_CHAIN, 0)).toBe(0)
    expect(stepsUpTo(ASH_CHAIN, 1)).toBe(6)
    expect(stepsUpTo(ASH_CHAIN, 2)).toBe(8)
  })
})

describe('chainOutcome: qué hizo un eslabón, sólo sin duda', () => {
  const at = (controller: 0 | 1, location: number, overlay_sequence?: number) => ({ controller, location, sequence: 0, position: 5, ...(overlay_sequence === undefined ? {} : { overlay_sequence }) })
  const move = (from: number, to: number, controller: 0 | 1 = 0): WireEvent => ({ type: 'move', card: 0, from: at(controller, from), to: at(controller, to) })
  const draw = (player: 0 | 1, count: number): WireEvent => ({ type: 'draw', player, drawn: Array.from({ length: count }, () => ({ code: 0, position: 10 })) })
  const spsummoning: WireEvent = { type: 'spsummoning', code: 0, controller: 0, location: L.MZONE, sequence: 0, position: 1 }
  const quiet: WireEvent[] = [{ type: 'shuffle_deck', player: 0 }, { type: 'confirm_cards', player: 0, cards: [] }, { type: 'recover', player: 1, amount: 1000 }]

  it('una sola clase de cosa: la cuenta (lo que no mueve cartas no cuenta)', () => {
    expect(chainOutcome([move(L.DECK, L.HAND), ...quiet])).toEqual({ kind: 'add', count: 1 })
    expect(chainOutcome([move(L.GRAVE, L.HAND), move(L.REMOVED, L.HAND, 1)])).toEqual({ kind: 'add', count: 2 })
    expect(chainOutcome([draw(0, 2), ...quiet])).toEqual({ kind: 'draw', count: 2 })
    expect(chainOutcome([move(L.GRAVE, L.MZONE), spsummoning, { type: 'spsummoned' }, move(L.DECK, L.MZONE), spsummoning])).toEqual({ kind: 'summon', count: 2 })
    // Una Ficha llega de ningún lado (lugar 0) y se Invoca igual.
    expect(chainOutcome([move(0, L.MZONE), spsummoning])).toEqual({ kind: 'summon', count: 1 })
    expect(chainOutcome([move(L.MZONE, L.GRAVE), move(L.MZONE, L.GRAVE, 1)])).toEqual({ kind: 'grave', count: 2 })
    expect(chainOutcome([move(L.GRAVE, L.REMOVED, 1)])).toEqual({ kind: 'banish', count: 1 })
  })

  it('se calla: nada, dos clases (robar y descartar), robos de los dos, regresar del campo, una Invocación Normal o una Colocación, un material, al Deck', () => {
    expect(chainOutcome([])).toBeNull()
    expect(chainOutcome(quiet)).toBeNull()
    expect(chainOutcome([draw(0, 3), move(L.HAND, L.GRAVE), move(L.HAND, L.GRAVE)])).toBeNull()
    expect(chainOutcome([draw(0, 1), draw(1, 1)])).toBeNull()
    expect(chainOutcome([move(L.MZONE, L.HAND)])).toBeNull()
    expect(chainOutcome([move(L.DECK, L.HAND), move(L.MZONE, L.HAND)])).toBeNull()
    expect(chainOutcome([move(L.HAND, L.MZONE), { type: 'summoning', code: 0, controller: 0, location: L.MZONE, sequence: 0, position: 1 }])).toBeNull()
    expect(chainOutcome([move(L.HAND, L.MZONE), move(L.GRAVE, L.MZONE), spsummoning])).toBeNull()
    expect(chainOutcome([{ type: 'move', card: 0, from: at(0, L.MZONE, 0), to: at(0, L.GRAVE) }])).toBeNull()
    expect(chainOutcome([move(L.GRAVE, L.DECK)])).toBeNull()
    expect(chainOutcome([move(L.DECK, L.SZONE)])).toBeNull()
  })

  it('chainFeed lo pasa a la fila sólo si quedó resuelta (una sin efecto no dice lo que hizo)', () => {
    const outcome = { kind: 'add', count: 1 } as const
    const steps = ASH_CHAIN.map((item, i) => (item.kind === 'solved' ? { ...item, outcome: i === 6 ? outcome : { kind: 'draw' as const, count: 1 } } : item))

    expect(chainFeed(steps, 5)?.rows[1]).toMatchObject({ state: 'solved', outcome: { kind: 'draw', count: 1 } })
    // Terraforming quedó sin efecto: su paso `solved` no le da `outcome`.
    expect(chainFeed(steps, 8)?.rows[0]).toMatchObject({ state: 'disabled' })
    expect(chainFeed(steps, 8)?.rows[0]).not.toHaveProperty('outcome')
    expect(chainFeed(ASH_CHAIN, 8)?.rows.some((row) => 'outcome' in row)).toBe(false)
  })

  it('el adaptador lo anota en el paso `solved`, aunque una pregunta parta la resolución en dos tandas, y no cuenta el costo ni la Mágica que se va después', () => {
    const adapter = createAdapter({ seat: 0, mine: { deck: [111, 222, 333], extra: [] }, theirs: { deck: 3, extra: 0 }, typeOf: () => 1 })
    const batch = (...list: WireEvent[]) => adapter.apply({ t: 'events', seat: 0, n: 0, events: list }).chain
    const card = (location: number, sequence: number, position = 10) => ({ controller: 0 as const, location, sequence, position })

    adapter.apply({ t: 'events', seat: 0, n: 0, events: [draw(0, 1)] })
    expect(batch(
      { type: 'move', card: 333, from: card(L.HAND, 0), to: card(L.SZONE, 0, 5) },
      { type: 'chaining', code: 333, controller: 0, location: L.SZONE, sequence: 0, position: 5, triggering_controller: 0, triggering_location: L.SZONE, triggering_sequence: 0, description: '0', chain_size: 1 },
      { type: 'chained', chain_size: 1 },
      { type: 'chain_solving', chain_size: 1 },
    ).map((item) => item.kind)).toEqual(['chain', 'solving'])
    const solved = batch(
      { type: 'move', card: 222, from: card(L.DECK, 1), to: card(L.HAND, 0) },
      { type: 'shuffle_deck', player: 0 },
      { type: 'chain_solved', chain_size: 1 },
      { type: 'move', card: 333, from: card(L.SZONE, 0, 5), to: card(L.GRAVE, 0, 5) },
      { type: 'chain_end' },
    )

    expect(solved.map((item) => [item.kind, item.outcome])).toEqual([['solved', { kind: 'add', count: 1 }], ['end', undefined]])
  })
})

describe('linkPhrase: la frase del efecto de un eslabón, sólo sin duda', () => {
  const ASH_TEXT =
    'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect.\r\n● Add a card from the Deck to the hand.\r\n● Special Summon from the Deck.\r\n● Send a card from the Deck to the GY.\r\nYou can only use this effect of "Ash Blossom & Joyous Spring" once per turn.'
  const TWO_EFFECTS = 'If this card is Normal Summoned: You can add 1 "Test" card from your Deck to your hand. During your Main Phase: You can discard 1 card; Special Summon this card from your GY.'
  const stringId = (code: number, n: number) => String((BigInt(code) << 20n) | BigInt(n))

  it('un solo efecto que se activa y el `desc` de la misma carta: esa frase', () => {
    const range = linkPhrase(ASH_TEXT, 14558127, stringId(14558127, 0))!

    expect(ASH_TEXT.slice(range.start, range.end)).toBe('When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect.')
  })

  it('con dos efectos, sin `desc`, o con el de otra carta (un efecto prestado), nada', () => {
    expect(linkPhrase(TWO_EFFECTS, 1, stringId(1, 0))).toBeNull()
    expect(linkPhrase(ASH_TEXT, 14558127, undefined)).toBeNull()
    expect(linkPhrase(ASH_TEXT, 14558127, '0')).toBeNull()
    expect(linkPhrase(ASH_TEXT, 14558127, stringId(999, 0))).toBeNull()
  })
})
