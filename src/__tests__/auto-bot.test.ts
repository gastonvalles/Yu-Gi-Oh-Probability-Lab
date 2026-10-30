import { createAdapter, type CardRef, type ChainLink, type CorePlace } from '../app/auto/adapter'
import { botViewOf, publicEventsOf, type BotContext, type BotSide, type BotView, type PublicEvent } from '../app/auto/bot/bot'
import { handtrapBot, passiveBot } from '../app/auto/bot/rivals'
import { handtrapPolicy, passivePolicy, type RivalView } from '../app/auto/policies'
import { LOCATION as L, POSITION as P, type AskOf, type AutoEvent, type CoreAsk, type Seat, type WireEvent } from '../app/auto/protocol'

/** El bot (`src/app/auto/bot/`): lo que ve (`botViewOf`, con un flujo armado a mano) y sus motivos. Lo que puede importar: `auto-bot-privacy.test.ts`; con el núcleo real, `auto-bot-privacy.slow.test.ts`. */

describe('el bot sólo ve lo de su asiento', () => {
  // Lo que le llega al asiento 1 (el bot) de un duelo armado a mano, ya filtrado: lo tuyo oculto viaja con código 0.
  const OWN = [101, 102, 103, 104, 105, 106, 107]
  const at = (controller: Seat, location: number, sequence: number, position: number = P.FACEUP_ATTACK) => ({ controller, location, sequence, position })
  const events = (...list: WireEvent[]): AutoEvent => ({ t: 'events', seat: 1, n: 0, events: list })
  const STREAM: AutoEvent[] = [
    events({ type: 'draw', player: 1, drawn: [101, 102, 103].map((code) => ({ code, position: 10 })) }),
    events({ type: 'draw', player: 0, drawn: [0, 0, 0, 0].map((code) => ({ code, position: 10 })) }),
    events({ type: 'new_turn', player: 0 }, { type: 'new_phase', phase: 4 }),
    // Colocás una boca abajo (no se ve) e Invocás a 555 (sí) y activás su efecto.
    events({ type: 'move', card: 0, from: at(0, L.HAND, 0, 10), to: at(0, L.SZONE, 1, P.FACEDOWN_DEFENSE) }, { type: 'set', code: 0, controller: 0, location: L.SZONE, sequence: 1, position: P.FACEDOWN_DEFENSE }),
    events({ type: 'move', card: 555, from: at(0, L.HAND, 0, 10), to: at(0, L.MZONE, 2) }, { type: 'summoning', code: 555, controller: 0, location: L.MZONE, sequence: 2, position: P.FACEUP_ATTACK }),
    { t: 'stats', seat: 1, cards: [{ code: 555, controller: 0, location: L.MZONE, sequence: 2, position: P.FACEUP_ATTACK, attack: 1800, defense: 1000, level: 4 }] },
    events({ type: 'chaining', code: 555, controller: 0, location: L.MZONE, sequence: 2, position: P.FACEUP_ATTACK, triggering_controller: 0, triggering_location: L.MZONE, triggering_sequence: 2, description: '8880', chain_size: 1 }),
  ]
  /** El bot con su deck en ese orden y el flujo (con `noise`: 10 `waiting` y un `stats` repetido entre cada tanda, lo que cambia con cuántas veces te preguntaron). */
  const run = (deck = OWN, noise = false) => {
    const adapter = createAdapter({ seat: 1, mine: { deck, extra: [900] }, theirs: { deck: 10, extra: 2 }, typeOf: () => 0x21 })
    const history: PublicEvent[] = []

    for (const event of STREAM) {
      history.push(...publicEventsOf(adapter.apply(event), adapter, 1))
      if (noise) {
        for (let i = 0; i < 10; i += 1) history.push(...publicEventsOf(adapter.apply(events({ type: 'waiting' })), adapter, 1))
        history.push(...publicEventsOf(adapter.apply(STREAM[5]!), adapter, 1))
      }
    }
    return botViewOf(adapter, 1, history)
  }

  it('sin un código que no llegó en el flujo: tu mano y lo colocado van en 0; lo propio, con su código', () => {
    const view = run()
    const arrived = new Set([0, ...OWN, 900, 555])
    const codes: number[] = []
    const walk = (value: unknown, key = ''): void => {
      if (typeof value === 'number' && ['code', 'target'].includes(key)) codes.push(value)
      else if (value && typeof value === 'object') Object.entries(value).forEach(([name, item]) => (['deckLeft', 'extraLeft'].includes(key) ? codes.push(Number(name)) : walk(item, name)))
    }

    walk(view)
    expect(codes.filter((code) => !arrived.has(code))).toEqual([])
    expect(view.them.hand.map((card) => card.code)).toEqual([0, 0])
    expect(view.them.spells[1]).toMatchObject({ code: 0, pos: 'set' })
    expect(view.them.monsters[2]).toMatchObject({ code: 555, stats: { attack: 1800, defense: 1000, level: 4 } })
    expect(view.me.hand.map((card) => card.code)).toEqual([101, 102, 103])
    expect(view.chain).toMatchObject([{ code: 555, state: 'chained', card: { ref: { side: 'theirs' } } }])
    expect(view.history).toEqual([
      { kind: 'phase', side: 'them', phase: 'main1' },
      { kind: 'set', side: 'them', what: 'spell' },
      { kind: 'summon', side: 'them', code: 555, how: 'normal' },
      { kind: 'activate', side: 'them', code: 555, link: 1 },
    ])
    // Ni la semilla, ni preguntas, ni tandas: la vista no tiene de dónde sacarlas.
    expect(JSON.stringify(view)).not.toMatch(/"(?:seed|key|askId|n|waiting)"/)
  })

  it('sin el orden de su deck: con la misma lista en otro orden, la misma vista (lo que queda, por código)', () => {
    const before = (deck: number[]) => botViewOf(createAdapter({ seat: 1, mine: { deck, extra: [900] }, theirs: { deck: 10, extra: 2 }, typeOf: () => 0x21 }), 1, [])

    expect(JSON.stringify(before([...OWN].reverse()))).toBe(JSON.stringify(before(OWN)))
    expect(before(OWN).me.deckLeft).toEqual({ 101: 1, 102: 1, 103: 1, 104: 1, 105: 1, 106: 1, 107: 1 })
    expect(before(OWN).me).toMatchObject({ deckCount: 7, extraFaceDown: 1, extraLeft: { 900: 1 } })
    expect(before(OWN).them).toMatchObject({ deckCount: 10, extraFaceDown: 2 })
    expect(before(OWN).them.deckLeft).toBeUndefined()
  })

  it('cuántas veces te preguntó el núcleo no se ve: con 10 `waiting` y `stats` repetidos entre cada tanda, la misma vista y el mismo historial', () => {
    expect(JSON.stringify(run(OWN, true))).toBe(JSON.stringify(run(OWN, false)))
  })
})

describe('los rivales como Bot: lo mismo que contestaban, y por qué', () => {
  const ASH = 14558127
  const ASH_ALT = 14558128
  const MAXX = 23434538
  const VEILER = 97268402
  const IMPERM = 10045474
  const OTHER = 12345678
  const STRATOS = 40044918
  const SEARCH = 1
  const context = (): BotContext => ({ random: () => 0.5, level: 'normal' })
  const empty: BotSide = { hand: [], monsters: [], spells: [], grave: [], banished: [], extraFaceUp: [], extraFaceDown: 0, deckCount: 0 }
  const places: Record<string, CorePlace> = { stratos: { controller: 0, location: L.MZONE, sequence: 2 }, search: { controller: 0, location: L.SZONE, sequence: 0 }, veiler: { controller: 1, location: L.GRAVE, sequence: 0 } }
  const link = (id: string, code: number, side: CardRef['side'] = 'theirs', state: ChainLink['state'] = 'chained'): ChainLink => ({ card: { side, id }, code, description: '0', state })
  /** La misma mesa para la política (`RivalView`) y para el bot (`BotView`). */
  const views = (chain: ChainLink[], turnPlayer: Seat = 0): [RivalView, BotView] => [
    { overlay: { chain, turnPlayer }, locationOf: (ref) => places[ref.id] ?? null },
    {
      seat: 1,
      me: empty,
      them: empty,
      lp: { me: 8000, them: 8000 },
      turn: 1,
      turnPlayer: turnPlayer === 1 ? 'me' : 'them',
      phase: 4,
      chain: chain.map((item) => ({ code: item.code, card: item.card && { ref: item.card, code: item.code, place: places[item.card.id] ?? null }, description: item.description, state: item.state })),
      limits: { me: [], them: [] },
      history: [],
    },
  ]
  const chainAsk = (codes: number[], extra: Partial<AskOf<'select_chain'>> = {}): CoreAsk => ({
    type: 'select_chain',
    player: 1,
    spe_count: 0,
    forced: false,
    hint_timing: 0,
    hint_timing_other: 0,
    selects: codes.map((code, sequence) => ({ code, controller: 1 as const, location: L.HAND, sequence, position: 10, description: '0', client_mode: 0 })),
    ...extra,
  })
  const target: CoreAsk = { type: 'select_card', player: 1, can_cancel: false, min: 1, max: 1, selects: [0, 2, 4].map((sequence) => ({ code: 7, controller: 0 as const, location: L.MZONE, sequence, position: 1 })) }
  const idle: CoreAsk = { type: 'select_idlecmd', player: 1, summons: [], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }
  const priority = [ASH, MAXX, VEILER, IMPERM, OTHER]
  const CASES: [string, CoreAsk, ChainLink[], Seat?][] = [
    ['Ash contra tu búsqueda', chainAsk([VEILER, ASH]), [link('search', SEARCH)]],
    ['nada contra lo suyo', chainAsk([ASH]), [link('search', SEARCH), link('maxx', MAXX, 'mine')]],
    ['Veiler contra Stratos', chainAsk([IMPERM, VEILER]), [link('stratos', STRATOS)]],
    ['Imperm guardada contra una Mágica', chainAsk([IMPERM]), [link('search', SEARCH)]],
    ['sin regla, guardada', chainAsk([OTHER]), [link('search', SEARCH)]],
    ['Maxx "C" en tu Draw Phase', chainAsk([MAXX], { hint_timing_other: 0x1 }), []],
    ['Maxx "C" a tu primera jugada', chainAsk([MAXX]), [link('search', SEARCH)]],
    ['el objetivo de Veiler', target, [link('stratos', STRATOS), link('veiler', VEILER, 'mine')]],
    ['su turno: lo termina', idle, [], 1],
  ]

  it.each(CASES)('%s: la misma respuesta que handtrapPolicy', (_name, ask, chain, turn) => {
    const [rival, view] = views(chain, turn)

    expect(handtrapBot(priority)(ask, view, context()).answer).toEqual(handtrapPolicy(priority)(ask, rival))
  })

  it('cada decisión que se cuenta, con su clave y sus cartas; pasar sin nada que decir, sin motivo', () => {
    const bot = handtrapBot(priority)
    const reason = (index: number) => {
      const [, ask, chain, turn] = CASES[index]!

      return bot(ask, views(chain, turn)[1], context()).reason
    }

    expect(CASES.map((_, i) => reason(i))).toEqual([
      { key: 'auto.bot.reason.handtrap.respond', cards: [ASH, SEARCH] },
      undefined,
      { key: 'auto.bot.reason.handtrap.monster', cards: [VEILER, STRATOS] },
      { key: 'auto.bot.reason.hold.monster', cards: [IMPERM, SEARCH] },
      { key: 'auto.bot.reason.hold.noRule', cards: [OTHER, SEARCH] },
      { key: 'auto.bot.reason.handtrap.draw', cards: [MAXX] },
      { key: 'auto.bot.reason.handtrap.drawLate', cards: [MAXX, SEARCH] },
      { key: 'auto.bot.reason.target.link', cards: [VEILER, STRATOS] },
      { key: 'auto.bot.reason.end.noPlays' },
    ])
  })

  it('un arte alternativo juega con la regla de su original (`alias`): sin él, la tiene y no la usa', () => {
    const [, view] = views([link('search', SEARCH)])
    const alias = (code: number) => (code === ASH_ALT ? ASH : 0)

    expect(handtrapBot([ASH_ALT], [], alias)(chainAsk([ASH_ALT]), view, context()).answer).toEqual({ type: 'select_chain', index: 0 })
    expect(handtrapBot([ASH_ALT])(chainAsk([ASH_ALT]), view, context()).answer).toEqual({ type: 'select_chain', index: null })
  })

  it('el pasivo contesta lo de passivePolicy, sin motivos, y su piedra, papel o tijera sale de su azar, no de la semilla del duelo', () => {
    const [, view] = views([])
    const rps: CoreAsk = { type: 'rock_paper_scissors', player: 1 }

    expect(passiveBot()(idle, view, context())).toEqual({ answer: passivePolicy()(idle) })
    expect(passiveBot()(rps, view, { random: () => 0.99, level: 'normal' })).toEqual({ answer: { type: 'rock_paper_scissors', value: 3 } })
    expect(passiveBot()(rps, view, { random: () => 0, level: 'normal' })).toEqual({ answer: { type: 'rock_paper_scissors', value: 1 } })
  })
})
