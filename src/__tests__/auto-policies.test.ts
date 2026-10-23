import { passivePolicy, randomLegalPolicy } from '../app/auto/policies'
import { ASK_SHAPES, parseAnswer, type CoreAnswer, type CoreAsk } from '../app/auto/protocol'

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
