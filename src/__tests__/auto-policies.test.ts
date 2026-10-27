import type { CardRef, ChainLink, CorePlace } from '../app/auto/adapter'
import { handtrapPolicy, passivePolicy, randomLegalPolicy, type RivalView } from '../app/auto/policies'
import { ASK_SHAPES, LOCATION as L, parseAnswer, type AskOf, type CoreAnswer, type CoreAsk, type Seat } from '../app/auto/protocol'

const card = (code: number, sequence = 0) => ({ code, controller: 0 as const, location: 2, sequence })
const pos = (code: number, sequence = 0) => ({ ...card(code, sequence), position: 10 })

/** Una pregunta de cada uno de los 21 tipos. */
const ASKS: CoreAsk[] = [
  { type: 'select_battlecmd', player: 0, chains: [], attacks: [{ ...card(1), can_direct: true }], to_m2: true, to_ep: true },
  { type: 'select_idlecmd', player: 0, summons: [card(1)], special_summons: [], pos_changes: [], monster_sets: [card(1)], spell_sets: [], activates: [{ ...card(2), description: '0', client_mode: 0 }], to_bp: true, to_ep: true, shuffle: false },
  { type: 'select_effectyn', player: 0, ...pos(1), description: '16' },
  { type: 'select_yesno', player: 0, description: '30' },
  { type: 'select_option', player: 0, options: ['1', '2', '3'] },
  { type: 'select_card', player: 0, can_cancel: false, min: 1, max: 2, selects: [pos(1), pos(2, 1), pos(3, 2)] },
  { type: 'select_chain', player: 0, spe_count: 0, forced: false, hint_timing: 0, hint_timing_other: 0, selects: [{ ...pos(1), description: '0', client_mode: 0 }] },
  { type: 'select_place', player: 1, count: 1, field_mask: 0xffff_ff00 | 0b1110_0001 },
  { type: 'select_position', player: 0, code: 1, positions: 4 | 8 },
  { type: 'select_tribute', player: 0, can_cancel: false, min: 2, max: 2, selects: [{ ...card(1), release_param: 1 }, { ...card(2, 1), release_param: 1 }, { ...card(3, 2), release_param: 2 }] },
  { type: 'sort_chain', player: 0, cards: [card(1), card(2, 1)] },
  { type: 'select_counter', player: 0, counter_type: 1, count: 3, cards: [{ ...card(1), count: 1 }, { ...card(2, 1), count: 5 }] },
  { type: 'select_sum', player: 0, select_max: 0, amount: 8, min: 1, max: 3, selects_must: [], selects: [{ ...card(1), amount: 4 }, { ...card(2, 1), amount: 3 }, { ...card(3, 2), amount: 0x10004 }] },
  { type: 'select_disfield', player: 0, count: 1, field_mask: 0xff_ff_ff_fe },
  { type: 'sort_card', player: 0, cards: [card(1), card(2, 1), card(3, 2)] },
  { type: 'select_unselect_card', player: 0, can_finish: false, can_cancel: false, min: 1, max: 1, select_cards: [pos(1)], unselect_cards: [] },
  { type: 'announce_race', player: 0, count: 1, available: String((1n << 40n) | 4n) },
  { type: 'announce_attrib', player: 0, count: 2, available: 0b0110010 },
  { type: 'announce_card', player: 0, opcodes: ['46986414', '1073741840'] },
  { type: 'announce_number', player: 0, options: ['1', '2'] },
  { type: 'rock_paper_scissors', player: 0 },
]

describe('las políticas de respuesta', () => {
  it('cubren las 21 preguntas con una respuesta de su mismo tipo y forma válida', () => {
    expect(new Set(ASKS.map((ask) => ask.type))).toEqual(new Set(Object.keys(ASK_SHAPES)))

    for (const policy of [passivePolicy(() => 46986414), randomLegalPolicy(9, () => 46986414)]) {
      for (const ask of ASKS) {
        const answer = policy(ask)

        expect(answer.type).toBe(ask.type)
        expect(parseAnswer(answer)).toEqual(answer)
      }
    }
  })

  it('el rival pasivo no hace nada que pueda no hacer', () => {
    const passive = passivePolicy()
    const answers = Object.fromEntries(ASKS.map((ask) => [ask.type, passive(ask)]))

    expect(answers).toMatchObject({
      select_idlecmd: { action: 7, index: null },
      select_battlecmd: { action: 3, index: null },
      select_chain: { index: null },
      select_effectyn: { yes: false },
      select_yesno: { yes: false },
      select_card: { indices: [0] },
      select_tribute: { indices: [0, 1] },
      select_place: { places: [{ player: 1, location: 4, sequence: 1 }] },
      select_disfield: { places: [{ player: 0, location: 4, sequence: 0 }] },
      select_position: { position: 4 },
      select_counter: { counters: [1, 2] },
      select_sum: { indices: [0, 1, 2] },
      sort_card: { order: null },
      select_unselect_card: { index: 0 },
      announce_race: { races: '4' },
      announce_attrib: { attributes: 0b0000010 | 0b0010000 },
      announce_card: { code: 0 },
    })
    expect(passive({ ...ASKS[6], forced: true } as CoreAsk)).toEqual({ type: 'select_chain', index: 0 })
    expect(passive({ ...ASKS[1], to_ep: false, to_bp: false } as CoreAsk)).toEqual({ type: 'select_idlecmd', action: 0, index: 0 })
  })

  it('el rival pasivo saca piedra, papel o tijera al azar, la misma con la misma semilla', () => {
    const rps: CoreAsk = { type: 'rock_paper_scissors', player: 1 }
    const hands = (seed: number) => {
      const passive = passivePolicy(undefined, seed)

      return Array.from({ length: 30 }, () => (passive(rps) as Extract<CoreAnswer, { type: 'rock_paper_scissors' }>).value)
    }

    expect(hands(7)).toEqual(hands(7))
    expect(hands(7)).not.toEqual(hands(8))
    expect(new Set(hands(7))).toEqual(new Set([1, 2, 3]))
    // Un empate no se repite para siempre: la semilla avanza con cada pregunta.
    expect(hands(7).some((value, i, all) => i > 0 && value !== all[i - 1])).toBe(true)
  })

  it('el bot al azar respeta los límites y es el mismo con la misma semilla', () => {
    const play = (seed: number) => {
      const policy = randomLegalPolicy(seed)

      return Array.from({ length: 30 }, () => ASKS.map((ask) => policy(ask)))
    }

    expect(play(5)).toEqual(play(5))
    expect(play(5)).not.toEqual(play(6))

    for (const round of play(11)) {
      const byType = <K extends CoreAnswer['type']>(type: K) => round.find((answer) => answer.type === type) as Extract<CoreAnswer, { type: K }>
      const card = byType('select_card')

      expect(card.indices === null || (card.indices.length >= 1 && card.indices.length <= 2)).toBe(true)
      expect([4, 8]).toContain(byType('select_position').position)
      expect(byType('select_counter').counters.reduce((sum: number, n: number) => sum + n, 0)).toBe(3)
      expect(byType('select_counter').counters[0]).toBeLessThanOrEqual(1)
      expect(byType('select_place').places[0]!.sequence).toBeGreaterThanOrEqual(1)
      expect(byType('select_place').places[0]!.sequence).toBeLessThanOrEqual(4)
      expect([String(1n << 40n), '4']).toContain(byType('announce_race').races)
    }
  })
})

describe('el rival de handtraps', () => {
  const ASH = 14558127
  const MAXX = 23434538
  const VEILER = 97268402
  const IMPERM = 10045474
  const MOURNER = 52038442
  const CROW = 24508238
  /** Una carta que no tiene regla (la agregó quien juega con el buscador). */
  const OTHER = 12345678

  /** Lo que el rival (asiento 1) ve: tu Stratos en tu mz 2, tu Glow-Up Bulb en tu cementerio, tu búsqueda en tus Mágicas y su Veiler, ya en su cementerio. */
  const places: Record<string, CorePlace> = { stratos: { controller: 0, location: L.MZONE, sequence: 2 }, bulb: { controller: 0, location: L.GRAVE, sequence: 1 }, search: { controller: 0, location: L.SZONE, sequence: 0 }, veiler: { controller: 1, location: L.GRAVE, sequence: 0 } }
  const link = (id: string, code: number, side: CardRef['side'] = 'theirs', state: ChainLink['state'] = 'chained'): ChainLink => ({ card: { side, id }, code, description: '0', state })
  const view = (chain: ChainLink[], turnPlayer: Seat | null = 0): RivalView => ({ overlay: { chain, turnPlayer }, locationOf: (ref) => places[ref.id] ?? null })
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
  const policy = handtrapPolicy([ASH, MAXX, VEILER, IMPERM, MOURNER, CROW, OTHER])
  const pass = { type: 'select_chain', index: null }

  it('responde a tu activación con la primera que su regla pide, en el orden de la hoja; nunca a lo suyo', () => {
    // Tu búsqueda (una Mágica): Ash, aunque Veiler también se ofrezca (no es un monstruo en el campo).
    expect(policy(chainAsk([VEILER, ASH]), view([link('search', 1)]))).toEqual({ type: 'select_chain', index: 1 })
    // Contra lo suyo (su Maxx "C", que Ash podría negar), nada.
    expect(policy(chainAsk([ASH]), view([link('search', 1), link('maxx', MAXX, 'mine')]))).toEqual(pass)
    // Sin cadena, nada: ni en la ventana de tu Invocación (no es una de robar).
    expect(policy(chainAsk([ASH, VEILER, IMPERM]), view([]))).toEqual(pass)
    expect(policy(chainAsk([VEILER, IMPERM], { hint_timing_other: 0x40 }), view([]))).toEqual(pass)
    // Un eslabón tuyo que ya se resuelve no espera respuesta.
    expect(policy(chainAsk([ASH]), view([link('search', 1, 'theirs', 'solving')]))).toEqual(pass)
    // Una carta sin regla no la usa nunca.
    expect(policy(chainAsk([OTHER]), view([link('search', 1)]))).toEqual(pass)
  })

  it('Veiler e Imperm, sólo contra el efecto de un monstruo tuyo en el campo, y apuntan a ese monstruo', () => {
    expect(policy(chainAsk([IMPERM, VEILER]), view([link('stratos', 40044918)]))).toEqual({ type: 'select_chain', index: 1 })
    expect(policy(chainAsk([VEILER]), view([link('bulb', 67441435)]))).toEqual(pass)
    // El objetivo: tu Stratos (no la primera que ofrece el núcleo).
    const target: CoreAsk = { type: 'select_card', player: 1, can_cancel: false, min: 1, max: 1, selects: [0, 2, 4].map((sequence) => ({ code: 7, controller: 0 as const, location: L.MZONE, sequence, position: 1 })) }

    expect(policy(target, view([link('stratos', 40044918), link('veiler', VEILER, 'mine')]))).toEqual({ type: 'select_card', indices: [1] })
    // Si el de abajo no es un monstruo que ofrezca el núcleo, lo del pasivo: la primera.
    expect(policy(target, view([link('bulb', 67441435), link('veiler', VEILER, 'mine')]))).toEqual({ type: 'select_card', indices: [0] })
  })

  it('D.D. Crow, contra un efecto que activás desde tu cementerio, destierra esa carta', () => {
    expect(policy(chainAsk([CROW]), view([link('bulb', 67441435)]))).toEqual({ type: 'select_chain', index: 0 })
    expect(policy(chainAsk([CROW]), view([link('stratos', 40044918)]))).toEqual(pass)
    const target: CoreAsk = { type: 'select_card', player: 1, can_cancel: false, min: 1, max: 1, selects: [0, 1].map((sequence) => ({ code: 7, controller: 0 as const, location: L.GRAVE, sequence, position: 5 })) }

    expect(policy(target, view([link('bulb', 67441435), link('crow', CROW, 'mine')]))).toEqual({ type: 'select_card', indices: [1] })
  })

  it('las de robar, en tu turno a tu primera activación o Invocación; las que el núcleo ofrece sólo cuando pasó algo, apenas aparecen', () => {
    expect(policy(chainAsk([MAXX]), view([link('search', 1)]))).toEqual({ type: 'select_chain', index: 0 })
    expect(policy(chainAsk([MAXX], { hint_timing_other: 0x80 }), view([]))).toEqual({ type: 'select_chain', index: 0 })
    // En su turno, o en otra ventana del tuyo (el fin de tu Main Phase), no.
    expect(policy(chainAsk([MAXX]), view([link('search', 1)], 1))).toEqual(pass)
    expect(policy(chainAsk([MAXX], { hint_timing_other: 0x4 }), view([]))).toEqual(pass)
    // Ghost Mourner: el núcleo la ofrece sólo después de tu Invocación Especial.
    expect(policy(chainAsk([MOURNER]), view([]))).toEqual({ type: 'select_chain', index: 0 })
  })

  it('una cadena obligatoria y todo lo demás lo contesta como el pasivo', () => {
    const passive = passivePolicy()

    expect(policy(chainAsk([ASH], { forced: true }), view([]))).toEqual({ type: 'select_chain', index: 0 })
    for (const ask of ASKS.filter((item) => item.type !== 'select_chain')) expect(policy({ ...ask, player: 1 } as CoreAsk, view([link('search', 1)]))).toEqual(passive({ ...ask, player: 1 } as CoreAsk))
  })
})
